import asyncio
import uuid
from typing import Dict, Any
from datetime import datetime, timezone, timedelta

import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"

class SecurityAuditRunner:
    def __init__(self):
        self.client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)
        self.sa_token = ""
        self.founder_a_token = ""
        self.founder_b_token = ""
        self.emp_a_token = ""
        self.company_a_id = ""
        self.company_b_id = ""
        self.founder_a_id = ""
        self.founder_b_id = ""
        self.task_a_id = ""
        self.task_b_id = ""
        self.results = []

    def record(self, test_name: str, passed: bool, details: str):
        status = "PASSED" if passed else "FAILED"
        print(f"[{status}] {test_name}: {details}")
        self.results.append({"name": test_name, "status": status, "details": details})

    async def run_all(self):
        print("\n========================================================")
        print("  STARTING END-TO-END SUPER ADMIN & FOUNDER SECURITY AUDIT")
        print("========================================================\n")

        await self.step1_superadmin_login()
        await self.step2_superadmin_create_companies()
        await self.step3_superadmin_create_user_in_company_a()
        await self.step4_superadmin_views_all_users()
        await self.step5_founder_a_login()
        await self.step6_founder_a_create_employee()
        await self.step7_founder_security_negative_tests()
        await self.step8_founder_a_user_list_isolation()
        await self.step9_founder_tasks_creation()
        await self.step10_founder_task_visibility_isolation()
        await self.step11_cross_company_task_attacks()
        await self.step12_superadmin_global_task_scope()

        await self.client.aclose()
        self.print_summary()

    async def step1_superadmin_login(self):
        # Authenticate as platform Super Admin
        res = await self.client.post("/auth/login", json={
            "email": "superadmin@zerotask.com",
            "password": "Password123"
        })
        if res.status_code == 200:
            data = res.json()
            self.sa_token = data.get("access_token")
            self.record("1. Super Admin Authentication", True, "Successfully logged in as Super Admin")
        else:
            self.record("1. Super Admin Authentication", False, f"Status: {res.status_code}, Body: {res.text}")

    async def step2_superadmin_create_companies(self):
        uid = uuid.uuid4().hex[:6]
        # Company A
        comp_a_name = f"Audit Company A {uid}"
        founder_a_email = f"founder_a_{uid}@audit.com"
        res_a = await self.client.post(
            "/superadmin/companies",
            headers={"Authorization": f"Bearer {self.sa_token}"},
            json={
                "company_name": comp_a_name,
                "founder_name": f"Founder A {uid}",
                "founder_email": founder_a_email,
                "founder_phone": "9876543210",
                "initial_password": "Password123"
            }
        )
        passed_a = res_a.status_code in [200, 201]
        if passed_a:
            data_a = res_a.json()
            self.company_a_id = str(data_a.get("company_id") or data_a.get("id"))
            self.founder_a_id = str(data_a.get("founder_id") or data_a.get("founder", {}).get("id"))
            self.founder_a_email = founder_a_email

        # Company B
        comp_b_name = f"Audit Company B {uid}"
        founder_b_email = f"founder_b_{uid}@audit.com"
        res_b = await self.client.post(
            "/superadmin/companies",
            headers={"Authorization": f"Bearer {self.sa_token}"},
            json={
                "company_name": comp_b_name,
                "founder_name": f"Founder B {uid}",
                "founder_email": founder_b_email,
                "founder_phone": "9876543211",
                "initial_password": "Password123"
            }
        )
        passed_b = res_b.status_code in [200, 201]
        if passed_b:
            data_b = res_b.json()
            self.company_b_id = str(data_b.get("company_id") or data_b.get("id"))
            self.founder_b_id = str(data_b.get("founder_id") or data_b.get("founder", {}).get("id"))
            self.founder_b_email = founder_b_email

        self.record("2. Super Admin Company & Founder Provisioning", passed_a and passed_b,
                    f"Created Company A ({self.company_a_id}) and Company B ({self.company_b_id})")

    async def step3_superadmin_create_user_in_company_a(self):
        uid = uuid.uuid4().hex[:6]
        mgr_email = f"sa_created_mgr_{uid}@audit.com"
        res = await self.client.post(
            "/users",
            headers={"Authorization": f"Bearer {self.sa_token}"},
            json={
                "email": mgr_email,
                "name": f"SA Manager {uid}",
                "full_name": f"SA Manager {uid}",
                "role": "Manager",
                "company_id": self.company_a_id,
                "password": "Password123"
            }
        )
        passed = res.status_code in [200, 201] and res.json().get("company_id") == self.company_a_id
        self.record("3. Super Admin User Creation under Target Company", passed,
                    f"Super Admin created Manager in Company A: {mgr_email}")

    async def step4_superadmin_views_all_users(self):
        res = await self.client.get(
            "/users",
            headers={"Authorization": f"Bearer {self.sa_token}"}
        )
        passed = False
        if res.status_code == 200:
            users = res.json()
            comp_ids = set(u.get("company_id") for u in users if u.get("company_id"))
            # Super Admin must see users from Company A, Company B, and others
            has_comp_a = self.company_a_id in comp_ids
            has_comp_b = self.company_b_id in comp_ids
            passed = has_comp_a and has_comp_b and len(users) > 5
            self.record("4. Super Admin Global User Visibility", passed,
                        f"Super Admin sees {len(users)} total users spanning {len(comp_ids)} companies (including Company A & B)")
        else:
            self.record("4. Super Admin Global User Visibility", False, f"Status: {res.status_code}")

    async def step5_founder_a_login(self):
        # Login as Founder A
        res_a = await self.client.post("/auth/login", json={
            "email": self.founder_a_email,
            "password": "Password123"
        })
        passed_a = res_a.status_code == 200
        if passed_a:
            self.founder_a_token = res_a.json().get("access_token")

        # Login as Founder B
        res_b = await self.client.post("/auth/login", json={
            "email": self.founder_b_email,
            "password": "Password123"
        })
        passed_b = res_b.status_code == 200
        if passed_b:
            self.founder_b_token = res_b.json().get("access_token")

        self.record("5. Founders Authentication", passed_a and passed_b,
                    f"Founder A & Founder B successfully logged into their company sessions")

    async def step6_founder_a_create_employee(self):
        uid = uuid.uuid4().hex[:6]
        emp_email = f"emp_a_{uid}@audit.com"
        res = await self.client.post(
            "/users",
            headers={"Authorization": f"Bearer {self.founder_a_token}"},
            json={
                "email": emp_email,
                "name": f"Employee A {uid}",
                "full_name": f"Employee A {uid}",
                "role": "Employee",
                "password": "Password123"
            }
        )
        passed = False
        if res.status_code in [200, 201]:
            data = res.json()
            # Enforce that user created by Founder A was automatically assigned to Company A
            passed = (data.get("company_id") == self.company_a_id) and (data.get("role") == "Employee")
            self.emp_a_id = data.get("id")
            self.emp_a_email = emp_email
            self.record("6. Founder User Creation (Role=Employee)", passed,
                        f"Founder A created Employee under Company A: {emp_email}")
        else:
            self.record("6. Founder User Creation (Role=Employee)", False, f"Status {res.status_code}: {res.text}")

    async def step7_founder_security_negative_tests(self):
        uid = uuid.uuid4().hex[:6]
        # Attack 1: Founder A attempts to create a Super Admin account
        res_sa_attack = await self.client.post(
            "/users",
            headers={"Authorization": f"Bearer {self.founder_a_token}"},
            json={
                "email": f"hacker_sa_{uid}@audit.com",
                "name": "Rogue SA",
                "role": "Super Admin",
                "password": "Password123"
            }
        )
        # Should be forbidden or role denied
        sa_attack_blocked = res_sa_attack.status_code in [400, 403]

        # Attack 2: Founder A attempts to create a user in Company B
        res_comp_attack = await self.client.post(
            "/users",
            headers={"Authorization": f"Bearer {self.founder_a_token}"},
            json={
                "email": f"cross_comp_{uid}@audit.com",
                "name": "Cross Comp User",
                "role": "Employee",
                "company_id": self.company_b_id, # Attempt cross-company injection
                "password": "Password123"
            }
        )
        comp_attack_blocked = False
        if res_comp_attack.status_code in [200, 201]:
            created = res_comp_attack.json()
            # Backend MUST force target_company_id = current_user.company_id for Founder!
            comp_attack_blocked = (created.get("company_id") == self.company_a_id)
        else:
            comp_attack_blocked = res_comp_attack.status_code in [400, 403]

        passed = sa_attack_blocked and comp_attack_blocked
        self.record("7. Founder Privilege Escalation & Cross-Company User Injection Prevention", passed,
                    f"Super Admin creation blocked: {sa_attack_blocked}; Cross-company user injection neutralized: {comp_attack_blocked}")

    async def step8_founder_a_user_list_isolation(self):
        res = await self.client.get(
            "/users",
            headers={"Authorization": f"Bearer {self.founder_a_token}"}
        )
        passed = False
        if res.status_code == 200:
            users = res.json()
            # Founder A must ONLY see users from Company A
            non_company_users = [u for u in users if u.get("company_id") != self.company_a_id]
            superadmin_users = [u for u in users if u.get("role") == "Super Admin"]
            passed = (len(non_company_users) == 0) and (len(superadmin_users) == 0) and (len(users) >= 2)
            self.record("8. Founder User List Tenant Isolation", passed,
                        f"Founder A sees {len(users)} users, all strictly in Company A ({self.company_a_id}). Cross-company users: 0, Super Admins: 0")
        else:
            self.record("8. Founder User List Tenant Isolation", False, f"Status: {res.status_code}")

    async def step9_founder_tasks_creation(self):
        due = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        # Founder A creates Task in Company A
        res_a = await self.client.post(
            "/tasks",
            headers={"Authorization": f"Bearer {self.founder_a_token}"},
            json={
                "title": "Alpha Confidential Strategic Plan",
                "description": "Company A internal deliverables only",
                "priority": "High",
                "due_date": due,
                "status": "To Do"
            }
        )
        passed_a = res_a.status_code in [200, 201]
        if passed_a:
            self.task_a_id = res_a.json().get("id")

        # Founder B creates Task in Company B
        res_b = await self.client.post(
            "/tasks",
            headers={"Authorization": f"Bearer {self.founder_b_token}"},
            json={
                "title": "Beta Proprietary Patent Filing",
                "description": "Company B trade secrets only",
                "priority": "Medium",
                "due_date": due,
                "status": "To Do"
            }
        )
        passed_b = res_b.status_code in [200, 201]
        if passed_b:
            self.task_b_id = res_b.json().get("id")
        else:
            print(f"DEBUG: Task B failed with status {res_b.status_code}: {res_b.text}")

        self.record("9. Multi-Tenant Task Provisioning", passed_a and passed_b,
                    f"Created Task A ({self.task_a_id}) in Company A & Task B ({self.task_b_id}) in Company B")

    async def step10_founder_task_visibility_isolation(self):
        # Founder A queries tasks
        res_a = await self.client.get(
            "/tasks",
            headers={"Authorization": f"Bearer {self.founder_a_token}"}
        )
        tasks_a = res_a.json() if res_a.status_code == 200 else []
        task_a_ids = [t.get("id") for t in tasks_a]

        # Founder B queries tasks
        res_b = await self.client.get(
            "/tasks",
            headers={"Authorization": f"Bearer {self.founder_b_token}"}
        )
        tasks_b = res_b.json() if res_b.status_code == 200 else []
        task_b_ids = [t.get("id") for t in tasks_b]

        # Assertions
        founder_a_sees_own_task = self.task_a_id in task_a_ids
        founder_a_sees_other_task = self.task_b_id in task_a_ids
        founder_b_sees_own_task = self.task_b_id in task_b_ids
        founder_b_sees_other_task = self.task_a_id in task_b_ids

        passed = (
            founder_a_sees_own_task and not founder_a_sees_other_task and
            founder_b_sees_own_task and not founder_b_sees_other_task
        )
        self.record("10. Founder Task List Strict Company Boundary", passed,
                    f"Founder A sees {len(tasks_a)} tasks (Beta Task visible: {founder_a_sees_other_task}); "
                    f"Founder B sees {len(tasks_b)} tasks (Alpha Task visible: {founder_b_sees_other_task})")

    async def step11_cross_company_task_attacks(self):
        # Attack 1: Founder A attempts direct GET of Founder B's task
        res_get = await self.client.get(
            f"/tasks/{self.task_b_id}",
            headers={"Authorization": f"Bearer {self.founder_a_token}"}
        )
        get_blocked = res_get.status_code in [403, 404]

        # Attack 2: Founder A attempts to complete Founder B's task
        res_comp = await self.client.post(
            f"/tasks/{self.task_b_id}/complete",
            headers={"Authorization": f"Bearer {self.founder_a_token}"}
        )
        comp_blocked = res_comp.status_code in [403, 404]

        # Attack 3: Founder A attempts to delete Founder B's task
        res_del = await self.client.delete(
            f"/tasks/{self.task_b_id}",
            headers={"Authorization": f"Bearer {self.founder_a_token}"}
        )
        del_blocked = res_del.status_code in [403, 404]

        passed = get_blocked and comp_blocked and del_blocked
        self.record("11. Cross-Company Task Attack Probing (Read / Complete / Delete)", passed,
                    f"Direct GET blocked: {get_blocked} ({res_get.status_code}); "
                    f"Complete blocked: {comp_blocked} ({res_comp.status_code}); "
                    f"Delete blocked: {del_blocked} ({res_del.status_code})")

    async def step12_superadmin_global_task_scope(self):
        res = await self.client.get(
            "/tasks",
            headers={"Authorization": f"Bearer {self.sa_token}"}
        )
        passed = False
        if res.status_code == 200:
            tasks = res.json()
            task_ids = [t.get("id") for t in tasks]
            # Super Admin must see tasks across companies
            has_task_a = self.task_a_id in task_ids
            has_task_b = self.task_b_id in task_ids
            passed = has_task_a and has_task_b
            self.record("12. Super Admin Global Operational Task Scope", passed,
                        f"Super Admin sees {len(tasks)} operational tasks including Company A ({has_task_a}) and Company B ({has_task_b})")
        else:
            self.record("12. Super Admin Global Operational Task Scope", False, f"Status: {res.status_code}")

    def print_summary(self):
        print("\n========================================================")
        print("                 AUDIT REPORT SUMMARY                   ")
        print("========================================================")
        total = len(self.results)
        passed = sum(1 for r in self.results if r["status"] == "PASSED")
        failed = total - passed
        print(f"Total Security & Functional Criteria: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Score: {(passed/total)*100:.1f}%\n")
        for idx, r in enumerate(self.results, 1):
            icon = "✓" if r["status"] == "PASSED" else "✗"
            print(f"{idx:02d}. [{icon}] {r['name']}: {r['details']}")
        print("========================================================\n")


if __name__ == "__main__":
    runner = SecurityAuditRunner()
    asyncio.run(runner.run_all())
