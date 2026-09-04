"""
Verification script for Phase 3 Step 7: Safe Local Development Test User
Verifies:
1. User in database
2. Company in database
3. user_credentials in database
4. Password hash validity (bcrypt hash, not plaintext)
5. POST /api/v1/auth/login
6. Access token issued
7. Refresh token issued
8. GET /api/v1/auth/me
9. POST /api/v1/auth/logout
10. POST /api/v1/auth/refresh after logout (rejection)
11. JWT token claims
12. FastAPI authorization dependencies resolution
"""
import asyncio
import json
import httpx
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token, verify_password
from app.models.company import Company
from app.models.user import User, UserCredential, UserRefreshToken
from app.core.dependencies import get_current_user, require_role, require_company_access

BASE_URL = "http://localhost:8000/api/v1"
TEST_EMAIL = "founder@test.local"
TEST_PASSWORD = "TestFounder2026!"


async def run_all_verifications():
    print("==================================================================")
    print("ZeroTask Self-Hosted Backend — Phase 3 Step 7 Test User Verification")
    print("==================================================================\n")

    results = {}

    # --- DB Verification ---
    print("--- 1. Database Entity Verification ---")
    async with AsyncSessionLocal() as db:
        # Check User
        user_stmt = select(User).where(User.email == TEST_EMAIL)
        res = await db.execute(user_stmt)
        user = res.scalar_one_or_none()
        if user:
            print(f"✅ 1. User found in users: id={user.id}, email={user.email}, role={user.role}")
            results["user_exists"] = True
        else:
            print("❌ 1. User NOT found in users")
            results["user_exists"] = False
            return results

        # Check Company
        comp_stmt = select(Company).where(Company.id == user.company_id)
        comp_res = await db.execute(comp_stmt)
        company = comp_res.scalar_one_or_none()
        if company:
            print(f"✅ 2. Company found in companies: id={company.id}, name={company.name}, code={company.code}")
            results["company_exists"] = True
        else:
            print("❌ 2. Company NOT found")
            results["company_exists"] = False

        # Check Credentials
        cred_stmt = select(UserCredential).where(UserCredential.user_id == user.id)
        cred_res = await db.execute(cred_stmt)
        cred = cred_res.scalar_one_or_none()
        if cred:
            print(f"✅ 3. user_credentials found: user_id={cred.user_id}")
            results["cred_exists"] = True
            
            # Check bcrypt format and not plaintext
            is_bcrypt = cred.password_hash.startswith("$2b$") or cred.password_hash.startswith("$2a$")
            not_plaintext = cred.password_hash != TEST_PASSWORD
            valid_hash = verify_password(TEST_PASSWORD, cred.password_hash)
            if is_bcrypt and not_plaintext and valid_hash:
                print(f"✅ 4. Password hash is valid bcrypt hash: {cred.password_hash[:15]}... (never stored as plaintext)")
                results["hash_valid"] = True
            else:
                print(f"❌ 4. Password hash format check failed: hash={cred.password_hash}")
                results["hash_valid"] = False
        else:
            print("❌ 3. user_credentials NOT found")
            results["cred_exists"] = False
            results["hash_valid"] = False

    # --- API Authentication Verification ---
    print("\n--- 2. API Authentication Flow Verification ---")
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # 5. Login
        login_payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
        login_resp = await client.post("/api/v1/auth/login", json=login_payload)
        if login_resp.status_code == 200:
            login_data = login_resp.json()
            access_token = login_data.get("access_token")
            refresh_token = login_data.get("refresh_token")
            print(f"✅ 5. POST /api/v1/auth/login: HTTP 200 OK")
            results["login"] = True

            # 6 & 7. Tokens
            if access_token:
                print(f"✅ 6. Access token returned: {access_token[:25]}...")
                results["access_token"] = True
            else:
                print("❌ 6. Access token missing")
                results["access_token"] = False

            if refresh_token:
                print(f"✅ 7. Refresh token returned: {refresh_token[:25]}...")
                results["refresh_token"] = True
            else:
                print("❌ 7. Refresh token missing")
                results["refresh_token"] = False

            # 11. Claims Verification
            claims = decode_token(access_token)
            print("\n--- 3. JWT Claims Verification ---")
            print(f"   Subject (User ID): {claims.get('sub')}")
            print(f"   Role: {claims.get('role')}")
            print(f"   Company ID: {claims.get('company_id')}")
            print(f"   Email: {claims.get('email')}")
            print(f"   Full Name: {claims.get('full_name')}")
            if (
                claims.get("sub") == str(user.id)
                and claims.get("role") == "Founder"
                and claims.get("company_id") == str(company.id)
                and claims.get("email") == TEST_EMAIL
            ):
                print("✅ 11. JWT token claims match user and company exactly")
                results["claims_valid"] = True
            else:
                print("❌ 11. JWT token claims mismatch")
                results["claims_valid"] = False

            # 8. /auth/me
            print("\n--- 4. Protected Endpoints & Authorization Context ---")
            headers = {"Authorization": f"Bearer {access_token}"}
            me_resp = await client.get("/api/v1/auth/me", headers=headers)
            if me_resp.status_code == 200:
                me_data = me_resp.json()
                print(f"✅ 8. GET /api/v1/auth/me: HTTP 200 OK (id={me_data.get('id')}, email={me_data.get('email')})")
                results["auth_me"] = True
            else:
                print(f"❌ 8. GET /api/v1/auth/me failed: {me_resp.status_code} {me_resp.text}")
                results["auth_me"] = False

            # Check /auth/status
            status_resp = await client.get("/api/v1/auth/status", headers=headers)
            if status_resp.status_code == 200:
                print(f"✅ 8b. GET /api/v1/auth/status: HTTP 200 OK: {status_resp.json()}")

            # 9. Logout
            print("\n--- 5. Session Revocation & Token Lifecycle ---")
            logout_resp = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
            if logout_resp.status_code == 200:
                print(f"✅ 9. POST /api/v1/auth/logout: HTTP 200 OK ({logout_resp.json().get('message')})")
                results["logout"] = True
            else:
                print(f"❌ 9. POST /api/v1/auth/logout failed: {logout_resp.status_code} {logout_resp.text}")
                results["logout"] = False

            # 10. Refresh after logout must fail
            refresh_resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
            if refresh_resp.status_code == 401:
                print(f"✅ 10. POST /api/v1/auth/refresh after logout: HTTP 401 Unauthorized ({refresh_resp.json().get('detail')})")
                results["revoked_rejected"] = True
            else:
                print(f"❌ 10. Expected HTTP 401 after logout, got {refresh_resp.status_code}: {refresh_resp.text}")
                results["revoked_rejected"] = False

            # Verify in DB that refresh token is marked revoked
            async with AsyncSessionLocal() as db:
                ref_payload = decode_token(refresh_token)
                jti = ref_payload.get("jti")
                t_stmt = select(UserRefreshToken).where(UserRefreshToken.token_hash == jti)
                t_res = await db.execute(t_stmt)
                t_rec = t_res.scalar_one_or_none()
                if t_rec and t_rec.revoked_at is not None:
                    print(f"✅ 10b. Verified in database: UserRefreshToken revoked_at is set ({t_rec.revoked_at})")

        else:
            print(f"❌ 5. Login failed: {login_resp.status_code} {login_resp.text}")
            results["login"] = False
            results["access_token"] = False
            results["refresh_token"] = False
            results["auth_me"] = False
            results["logout"] = False
            results["revoked_rejected"] = False
            results["claims_valid"] = False

    # --- Authorization Middleware Validation ---
    print("\n--- 6. FastAPI Authorization Middleware Verification ---")
    async with AsyncSessionLocal() as db:
        # Test get_current_user dependency
        resolved_user = await get_current_user(token=access_token, db=db)
        if resolved_user and resolved_user.id == user.id:
            print(f"✅ 12a. get_current_user resolved user correctly: {resolved_user.email} (Role: {resolved_user.role})")
            
            # Test require_role
            role_checker = require_role(["Founder", "Super Admin"])
            allowed = await role_checker(resolved_user)
            print(f"✅ 12b. require_role(['Founder', 'Super Admin']) passed: {allowed.role}")

            # Test require_company_access
            require_company_access(company.id, resolved_user)
            print(f"✅ 12c. require_company_access passed for company_id={company.id}")
            results["auth_middleware"] = True
        else:
            print("❌ 12. Authorization middleware resolution failed")
            results["auth_middleware"] = False

    # --- Summary ---
    print("\n==================================================================")
    print("VERIFICATION COMPLETED")
    print("==================================================================")
    return results


if __name__ == "__main__":
    asyncio.run(run_all_verifications())
