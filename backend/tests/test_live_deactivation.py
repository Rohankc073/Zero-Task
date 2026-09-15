import asyncio
import uuid
import httpx

BASE_URL = "http://localhost:8088/api/v1"

async def run_live_test():
    run_id = uuid.uuid4().hex[:8]
    founder_email = f"founder_{run_id}@example.com"
    emp_email = f"emp_{run_id}@example.com"
    comp_name = f"Deact Corp {run_id}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        print("=== 1. Super Admin Login ===")
        login_res = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": "superadmin@zerotask.com", "password": "Test@123"},
        )
        assert login_res.status_code == 200, f"Superadmin login failed: {login_res.text}"
        sa_data = login_res.json()
        sa_token = sa_data["access_token"]
        sa_headers = {"Authorization": f"Bearer {sa_token}"}
        print("Super Admin logged in successfully!")

        print("\n=== 2. Create Test Company with Founder ===")
        comp_res = await client.post(
            f"{BASE_URL}/superadmin/companies",
            headers=sa_headers,
            json={
                "company_name": comp_name,
                "founder_name": f"Founder {run_id}",
                "founder_email": founder_email,
                "founder_phone": "9998887771",
                "initial_password": "Password@123",
            },
        )
        assert comp_res.status_code == 200, f"Create company failed: {comp_res.text}"
        company_data = comp_res.json()
        print("Create company response:", company_data)
        company_id = company_data["company_id"]
        founder_id = company_data["founder_id"]
        print(f"Created company {company_id}, founder {founder_id}")

        print("\n=== 3. Create Employee in Test Company ===")
        emp_res = await client.post(
            f"{BASE_URL}/users",
            headers=sa_headers,
            json={
                "name": f"Employee {run_id}",
                "email": emp_email,
                "role": "Employee",
                "company_id": company_id,
                "phone_number": "9998887772",
                "password": "Password@123",
            },
        )
        assert emp_res.status_code in (200, 201), f"Create employee failed: {emp_res.text}"
        emp_data = emp_res.json()
        emp_id = emp_data["id"]
        print(f"Created employee {emp_id}")

        print("\n=== 4. Verify Initial Logins (Both Active) ===")
        f_login = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": founder_email, "password": "Password@123"},
        )
        assert f_login.status_code == 200, f"Founder login failed: {f_login.text}"
        e_login = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": emp_email, "password": "Password@123"},
        )
        assert e_login.status_code == 200, f"Employee login failed: {e_login.text}"
        emp_token = e_login.json()["access_token"]
        print("Both Founder and Employee logged in successfully.")

        print("\n=== 5. Deactivate Company from Company Section (Super Admin) ===")
        deact_comp = await client.patch(
            f"{BASE_URL}/superadmin/companies/{company_id}",
            headers=sa_headers,
            json={"status": "Inactive"},
        )
        assert deact_comp.status_code == 200, f"Deactivate company failed: {deact_comp.text}"
        print("Company status set to Inactive.")

        print("\n=== 6. Verify None of the Company Users Can Log In ===")
        f_blocked = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": founder_email, "password": "Password@123"},
        )
        print("Founder login attempt while company Inactive -> HTTP", f_blocked.status_code, f_blocked.json())
        assert f_blocked.status_code == 403
        assert "company account is deactivated" in f_blocked.json()["detail"].lower()

        e_blocked = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": emp_email, "password": "Password@123"},
        )
        print("Employee login attempt while company Inactive -> HTTP", e_blocked.status_code, e_blocked.json())
        assert e_blocked.status_code == 403
        assert "company account is deactivated" in e_blocked.json()["detail"].lower()

        print("\n=== 7. Reactivate Company ===")
        react_comp = await client.patch(
            f"{BASE_URL}/superadmin/companies/{company_id}",
            headers=sa_headers,
            json={"status": "Active"},
        )
        assert react_comp.status_code == 200
        print("Company status restored to Active.")

        print("\n=== 8. Verify Non-SuperAdmin CANNOT Deactivate Founder ===")
        emp_headers = {"Authorization": f"Bearer {emp_token}"}
        unauth_deact = await client.patch(
            f"{BASE_URL}/users/{founder_id}",
            headers=emp_headers,
            json={"is_active": False},
        )
        print("Employee attempting to deactivate founder -> HTTP", unauth_deact.status_code)
        assert unauth_deact.status_code == 403, "Non-superadmin should be forbidden from deactivating founder"

        print("\n=== 9. Super Admin Deactivates ONLY Founder Account ===")
        sa_deact_founder = await client.patch(
            f"{BASE_URL}/users/{founder_id}",
            headers=sa_headers,
            json={"is_active": False},
        )
        assert sa_deact_founder.status_code == 200, f"Super Admin deactivate founder failed: {sa_deact_founder.text}"
        print("Founder account deactivated by Super Admin.")

        print("\n=== 10. Verify Founder CANNOT Log In, but Employee CAN Log In ===")
        f_only_blocked = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": founder_email, "password": "Password@123"},
        )
        print("Founder login attempt -> HTTP", f_only_blocked.status_code, f_only_blocked.json())
        assert f_only_blocked.status_code == 403
        assert "founder account is deactivated by super admin" in f_only_blocked.json()["detail"].lower()

        e_still_allowed = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": emp_email, "password": "Password@123"},
        )
        print("Employee login attempt -> HTTP", e_still_allowed.status_code)
        assert e_still_allowed.status_code == 200, f"Employee should still be able to log in: {e_still_allowed.text}"
        print("Employee logged in successfully while founder is deactivated!")

        print("\n=== 11. Cleanup Test Company ===")
        await client.patch(
            f"{BASE_URL}/superadmin/companies/{company_id}",
            headers=sa_headers,
            json={"status": "Inactive"},
        )
        del_comp = await client.delete(
            f"{BASE_URL}/superadmin/companies/{company_id}",
            headers=sa_headers,
        )
        print("Cleanup company result:", del_comp.status_code)

        print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    asyncio.run(run_live_test())
