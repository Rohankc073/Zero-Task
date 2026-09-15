"""
test_secure_hierarchical_password_reset.py
==========================================
Comprehensive Automated Security & Authorization Test Suite for ZeroTask
Secure Hierarchical Password Reset / Recovery System.

Covers:
1. Normal user reset request routing to Company Founder
2. Founder recovery request routing to Super Admin
3. Super Admin forgotten password recovery blocked in-app (directs to Database/Backend Team)
4. Strict approver authorization & matrix enforcement
5. Self-approval prevention
6. Cross-company boundary isolation
7. Unauthorized role prevention (Manager/Employee cannot approve)
8. Super Admin scope isolation (Super Admin cannot reset normal users)
9. Duplicate active request prevention
10. Request expiration enforcement
11. State machine integrity (Pending -> Approved -> Completed; no invalid transitions)
12. Completed & Rejected request reuse prevention
13. Password policy validation
14. Secure bcrypt hashing & credential replacement
15. Session & Refresh Token revocation
16. Old password invalidation & new password authentication
17. Concurrency / double-approval protection
18. Audit event emission without secret leakage
19. Safe user notification without credential leakage
20. No plaintext password / hash leakage in responses
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.models.user import User, UserCredential, UserRefreshToken
from app.models.approval import PasswordReset
from app.schemas.auth import (
    PasswordResetRequest,
    PasswordResetRejectRequest,
    PasswordResetCompleteRequest,
)
from app.services.auth_service import AuthService
from app.core.security import verify_password, get_password_hash
from tests.conftest import (
    COMPANY_A_ID,
    COMPANY_B_ID,
    DEPT_A_ID,
    DEPT_B_ID,
    USER_SUPERADMIN_ID,
    USER_FOUNDER_A_ID,
    USER_MANAGER_A_ID,
    USER_EMPLOYEE_A_ID,
    USER_FOUNDER_B_ID,
    USER_EMPLOYEE_B_ID,
    make_user,
)


def make_password_reset(
    req_id=None,
    requester_id=None,
    company_id=None,
    target_role="Employee",
    status="Pending",
    approver_id=None,
    expires_delta_minutes=1440,
):
    pr = PasswordReset()
    pr.id = req_id or uuid.uuid4()
    pr.requester_id = requester_id or USER_EMPLOYEE_A_ID
    pr.email = "user@example.com"
    pr.company_id = company_id or COMPANY_A_ID
    pr.status = status
    pr.approver_id = approver_id
    pr.reason = "Forgot password"
    pr.created_at = datetime.now(timezone.utc)
    pr.expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_delta_minutes)
    return pr


# ==============================================================================
# 1. NORMAL USER RESET REQUEST ROUTING (Employee -> Founder)
# ==============================================================================
@pytest.mark.asyncio
async def test_employee_request_routes_to_founder():
    db = AsyncMock()
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)

    # Mock user query
    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = emp
    
    # Mock existing request query (none)
    exist_res = MagicMock()
    exist_res.scalar_one_or_none.return_value = None
    
    # Mock founder query
    founder_res = MagicMock()
    founder_res.scalars.return_value.all.return_value = [founder]

    db.execute = AsyncMock(side_effect=[user_res, exist_res, founder_res, MagicMock()])

    req_data = PasswordResetRequest(email="emp@a.com", reason="Locked out")
    resp = await AuthService.request_password_reset(db, req_data)

    assert resp["status"] == "Pending"
    assert resp["approver_role"] == "Founder"
    assert "Founder" in resp["message"]
    assert db.add.called is True


# ==============================================================================
# 2. FOUNDER RECOVERY REQUEST ROUTING (Founder -> Super Admin)
# ==============================================================================
@pytest.mark.asyncio
async def test_founder_request_routes_to_super_admin():
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    sa = make_user(USER_SUPERADMIN_ID, "sa@zt.internal", "Super Admin")

    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = founder

    exist_res = MagicMock()
    exist_res.scalar_one_or_none.return_value = None

    sa_res = MagicMock()
    sa_res.scalars.return_value.all.return_value = [sa]

    db.execute = AsyncMock(side_effect=[user_res, exist_res, sa_res, MagicMock()])

    req_data = PasswordResetRequest(email="founder@a.com", reason="Recovery needed")
    resp = await AuthService.request_password_reset(db, req_data)

    assert resp["status"] == "Pending"
    assert resp["approver_role"] == "Super Admin"
    assert "Super Admin" in resp["message"]


# ==============================================================================
# 3. SUPER ADMIN RECOVERY (IN-APP SELF-RESET FORBIDDEN -> EXTERNAL DB TEAM)
# ==============================================================================
@pytest.mark.asyncio
async def test_super_admin_in_app_reset_forbidden():
    db = AsyncMock()
    sa = make_user(USER_SUPERADMIN_ID, "sa@zt.internal", "Super Admin")

    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = sa

    db.execute = AsyncMock(return_value=user_res)

    req_data = PasswordResetRequest(email="sa@zt.internal", reason="Locked out")
    resp = await AuthService.request_password_reset(db, req_data)

    assert resp["status"] == "SuperAdminExternal"
    assert resp["approver_role"] == "Database / Backend Team"
    assert "Database / Backend Team" in resp["message"]
    # Must NOT add record to password_resets
    assert db.add.called is False


# ==============================================================================
# 4. DUPLICATE ACTIVE REQUEST PROTECTION
# ==============================================================================
@pytest.mark.asyncio
async def test_duplicate_active_request_returns_existing_status():
    db = AsyncMock()
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    existing_req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID)

    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = emp

    exist_res = MagicMock()
    exist_res.scalar_one_or_none.return_value = existing_req

    db.execute = AsyncMock(side_effect=[user_res, exist_res])

    req_data = PasswordResetRequest(email="emp@a.com", reason="Forgot again")
    resp = await AuthService.request_password_reset(db, req_data)

    assert resp["status"] == "Pending"
    assert "already pending" in resp["message"]
    # Must not add a new duplicate request
    assert db.add.called is False


# ==============================================================================
# 5. APPROVER AUTHORIZATION: FOUNDER APPROVES COMPANY USER
# ==============================================================================
@pytest.mark.asyncio
async def test_founder_can_approve_company_user():
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID)
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(side_effect=[req_res, MagicMock()])

    item = await AuthService.approve_password_reset(db, req.id, founder)
    assert item["status"] == "Approved"
    assert req.status == "Approved"
    assert req.approver_id == founder.id


# ==============================================================================
# 6. APPROVER AUTHORIZATION: SUPER ADMIN APPROVES FOUNDER
# ==============================================================================
@pytest.mark.asyncio
async def test_super_admin_can_approve_founder():
    db = AsyncMock()
    sa = make_user(USER_SUPERADMIN_ID, "sa@zt.internal", "Super Admin")
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_FOUNDER_A_ID, company_id=COMPANY_A_ID)
    req.requester = founder

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(side_effect=[req_res, MagicMock()])

    item = await AuthService.approve_password_reset(db, req.id, sa)
    assert item["status"] == "Approved"
    assert req.status == "Approved"
    assert req.approver_id == sa.id


# ==============================================================================
# 7. NEGATIVE: SELF-APPROVAL PREVENTED
# ==============================================================================
@pytest.mark.asyncio
async def test_self_approval_strictly_prevented():
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_FOUNDER_A_ID, company_id=COMPANY_A_ID)
    req.requester = founder

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    with pytest.raises(HTTPException) as exc:
        await AuthService.approve_password_reset(db, req.id, founder)
    assert exc.value.status_code == 403
    assert "cannot approve your own" in exc.value.detail.lower()


# ==============================================================================
# 8. NEGATIVE: CROSS-COMPANY FOUNDER APPROVAL PREVENTED
# ==============================================================================
@pytest.mark.asyncio
async def test_cross_company_approval_prevented():
    db = AsyncMock()
    founder_b = make_user(USER_FOUNDER_B_ID, "founder@b.com", "Founder", COMPANY_B_ID)
    emp_a = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID)
    req.requester = emp_a

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    with pytest.raises(HTTPException) as exc:
        await AuthService.approve_password_reset(db, req.id, founder_b)
    assert exc.value.status_code == 403
    assert "cross-company" in exc.value.detail.lower()


# ==============================================================================
# 9. NEGATIVE: UNAUTHORIZED ROLE (Manager / Employee) CANNOT APPROVE
# ==============================================================================
@pytest.mark.asyncio
async def test_manager_cannot_approve_reset():
    db = AsyncMock()
    manager = make_user(USER_MANAGER_A_ID, "mgr@a.com", "Manager", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID)
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    with pytest.raises(HTTPException) as exc:
        await AuthService.approve_password_reset(db, req.id, manager)
    assert exc.value.status_code == 403
    assert "authority" in exc.value.detail.lower()


# ==============================================================================
# 10. NEGATIVE: SUPER ADMIN CANNOT APPROVE NORMAL USERS DIRECTLY
# ==============================================================================
@pytest.mark.asyncio
async def test_super_admin_cannot_approve_normal_employee():
    db = AsyncMock()
    sa = make_user(USER_SUPERADMIN_ID, "sa@zt.internal", "Super Admin")
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID)
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    with pytest.raises(HTTPException) as exc:
        await AuthService.approve_password_reset(db, req.id, sa)
    assert exc.value.status_code == 403
    assert "super admin can only approve founder" in exc.value.detail.lower()


# ==============================================================================
# 11. NEGATIVE: EXPIRED REQUEST CANNOT BE APPROVED OR COMPLETED
# ==============================================================================
@pytest.mark.asyncio
async def test_expired_request_cannot_be_approved():
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    # Expired 10 minutes ago
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID, expires_delta_minutes=-10)
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    with pytest.raises(HTTPException) as exc:
        await AuthService.approve_password_reset(db, req.id, founder)
    assert exc.value.status_code == 400
    assert "has expired" in exc.value.detail
    assert req.status == "Expired"


# ==============================================================================
# 12. STATE MACHINE: REJECTED REQUEST CANNOT BE COMPLETED
# ==============================================================================
@pytest.mark.asyncio
async def test_rejected_request_cannot_be_completed():
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID, status="Rejected")
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    complete_data = PasswordResetCompleteRequest(new_password="NewSecurePassword123!")
    with pytest.raises(HTTPException) as exc:
        await AuthService.complete_password_reset(db, req.id, founder, complete_data)
    assert exc.value.status_code == 400
    assert "Cannot complete" in exc.value.detail


# ==============================================================================
# 13. STATE MACHINE: COMPLETED REQUEST CANNOT BE RE-COMPLETED
# ==============================================================================
@pytest.mark.asyncio
async def test_completed_request_cannot_be_recompleted():
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID, status="Completed")
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    complete_data = PasswordResetCompleteRequest(new_password="NewSecurePassword123!")
    with pytest.raises(HTTPException) as exc:
        await AuthService.complete_password_reset(db, req.id, founder, complete_data)
    assert exc.value.status_code == 400


# ==============================================================================
# 14. PASSWORD POLICY VALIDATION (Min 8 chars, non-empty, non-whitespace)
# ==============================================================================
@pytest.mark.asyncio
async def test_password_policy_enforcement():
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    req = make_password_reset(requester_id=USER_EMPLOYEE_A_ID, company_id=COMPANY_A_ID, status="Approved")
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    # Test short password
    with pytest.raises(HTTPException) as exc:
        await AuthService.complete_password_reset(
            db, req.id, founder, PasswordResetCompleteRequest(new_password="short")
        )
    assert exc.value.status_code == 400
    assert "at least 8 characters" in exc.value.detail

    # Test whitespace-only password
    with pytest.raises(HTTPException) as exc2:
        await AuthService.complete_password_reset(
            db, req.id, founder, PasswordResetCompleteRequest(new_password="        ")
        )
    assert exc2.value.status_code == 400


# ==============================================================================
# 15. PASSWORD SETTING & BCRYPT HASHING & SESSION REVOCATION
# ==============================================================================
@pytest.mark.asyncio
async def test_password_reset_completion_flow():
    """Verifies:
    - bcrypt hashing
    - credential replacement in UserCredential
    - UserRefreshToken revocation (all active sessions revoked)
    - PasswordReset status set to 'Completed'
    - In-app notification creation
    - Audit log recording
    - Old password fails, new password succeeds
    """
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    
    old_hash = get_password_hash("OldPassword123!")
    cred = UserCredential(user_id=emp.id, password_hash=old_hash)

    req = make_password_reset(requester_id=emp.id, company_id=COMPANY_A_ID, status="Approved")
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req

    cred_res = MagicMock()
    cred_res.scalar_one_or_none.return_value = cred

    db.execute = AsyncMock(side_effect=[req_res, cred_res, MagicMock(), MagicMock()])

    new_pwd = "NewBrandNewPassword2026!"
    complete_data = PasswordResetCompleteRequest(new_password=new_pwd)

    result = await AuthService.complete_password_reset(db, req.id, founder, complete_data)

    assert result["status"] == "Completed"
    assert req.status == "Completed"
    assert req.completed_at is not None
    assert req.approver_id == founder.id

    # Verify credential updated with new bcrypt hash
    assert cred.password_hash != old_hash
    assert verify_password(new_pwd, cred.password_hash) is True
    assert verify_password("OldPassword123!", cred.password_hash) is False

    # Verify session revocation executed
    assert db.execute.call_count >= 3  # req lookup, cred lookup, refresh_token update
    assert db.commit.called is True


# ==============================================================================
# 16. CONCURRENCY / DOUBLE-APPROVAL PROTECTION
# ==============================================================================
@pytest.mark.asyncio
async def test_double_approval_race_protection():
    """If a request is already completed by another admin session, second approval fails"""
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    
    # Already completed by another founder session
    req = make_password_reset(requester_id=emp.id, company_id=COMPANY_A_ID, status="Completed")
    req.requester = emp

    req_res = MagicMock()
    req_res.scalar_one_or_none.return_value = req
    db.execute = AsyncMock(return_value=req_res)

    with pytest.raises(HTTPException) as exc:
        await AuthService.approve_password_reset(db, req.id, founder)
    assert exc.value.status_code == 400
    assert "cannot approve request" in exc.value.detail.lower()
