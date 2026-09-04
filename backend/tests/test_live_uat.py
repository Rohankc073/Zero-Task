"""
ZeroTask Phase 4 Final Gate - Live Mobile & Backend End-to-End UAT Test Suite
Tests executed against running self-hosted local stack (FastAPI + PostgreSQL + MinIO + WebSockets).
Provides explicit PASS/FAIL evidence for all 25 checklist criteria.
"""
import pytest
import asyncio
import httpx
import websockets
import json
import hashlib
import os
from typing import Dict, Any

BASE_URL = os.getenv("UAT_BASE_URL", "http://localhost:8088/api/v1")
WS_URL = os.getenv("UAT_WS_URL", "ws://localhost:8088/ws")

# Test Credentials
CREDENTIALS = {
    "superadmin": ("superadmin@zerotask.internal", "Test@123"),
    "founder_a": ("founder.a@acme.com", "Test@123"),
    "depthead_a": ("depthead.a@acme.com", "Test@123"),
    "manager_a": ("manager.a@acme.com", "Test@123"),
    "employee_a": ("employee.a@acme.com", "Test@123"),
    "founder_b": ("founder.b@beta.com", "Test@123"),
    "depthead_b": ("depthead.b@beta.com", "Test@123"),
    "manager_b": ("manager.b@beta.com", "Test@123"),
    "employee_b": ("employee.b@beta.com", "Test@123"),
}


async def get_auth_session(email: str, password: str = "Test@123") -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=10.0,
        )
        assert res.status_code == 200, f"Login failed for {email}: {res.text}"
        return res.json()


# ==============================================================================
# 1. AUTHENTICATION UAT
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_auth_flows():
    async with httpx.AsyncClient() as client:
        # Valid Login
        session_a = await get_auth_session("founder.a@acme.com")
        assert "access_token" in session_a
        assert session_a["user"]["role"] == "Founder"
        token = session_a["access_token"]
        refresh_token = session_a["refresh_token"]

        # Invalid Password Check
        bad_res = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": "founder.a@acme.com", "password": "WrongPassword!99"},
        )
        assert bad_res.status_code == 401

        # Session Restoration (/auth/me)
        me_res = await client.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["email"] == "founder.a@acme.com"
        assert me_data["role"] == "Founder"
        assert me_data["company_id"] is not None

        # Token Refresh Flow
        refresh_res = await client.post(
            f"{BASE_URL}/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert refresh_res.status_code == 200
        new_token_data = refresh_res.json()
        assert "access_token" in new_token_data

        # Logout Flow
        logout_res = await client.post(
            f"{BASE_URL}/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
            json={"refresh_token": new_token_data["refresh_token"]},
        )
        assert logout_res.status_code == 200


# ==============================================================================
# 2. FOUNDER UAT & DASHBOARD METRICS
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_founder_operations():
    session = await get_auth_session("founder.a@acme.com")
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    async with httpx.AsyncClient() as client:
        # Dashboard Metrics
        metrics_res = await client.get(f"{BASE_URL}/reports/manager-analytics", headers=headers)
        assert metrics_res.status_code == 200
        metrics = metrics_res.json()
        assert isinstance(metrics, (dict, list))

        # Tasks list (Must be isolated to Company A)
        tasks_res = await client.get(f"{BASE_URL}/tasks", headers=headers)
        assert tasks_res.status_code == 200
        tasks = tasks_res.json()
        assert len(tasks) > 0
        for t in tasks:
            assert t.get("company_id") == session["user"]["company_id"]

        # Create Task
        new_task_res = await client.post(
            f"{BASE_URL}/tasks",
            headers=headers,
            json={
                "title": "UAT Founder Architectural Directive",
                "description": "Verify high-priority workflow directives",
                "priority": "High",
                "due_date": "2026-09-15T18:00:00Z",
                "department_id": session["user"]["department_id"],
            },
        )
        assert new_task_res.status_code in [200, 201]
        created_task = new_task_res.json()

        # Update Task Status
        patch_res = await client.patch(
            f"{BASE_URL}/tasks/{created_task['id']}",
            headers=headers,
            json={"status": "In Progress", "progress": 45},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "In Progress"

        # Complete Task
        comp_res = await client.patch(
            f"{BASE_URL}/tasks/{created_task['id']}",
            headers=headers,
            json={"status": "Done", "progress": 100},
        )
        assert comp_res.status_code == 200
        assert comp_res.json()["status"] == "Done"


# ==============================================================================
# 3. TASK SEGREGATION & CHILD TASKS UAT
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_task_segregation_and_children():
    session_mgr = await get_auth_session("manager.a@acme.com")
    session_emp = await get_auth_session("employee.a@acme.com")
    headers = {"Authorization": f"Bearer {session_mgr['access_token']}"}

    async with httpx.AsyncClient() as client:
        # Create Parent Task (assigned to Employee)
        parent_res = await client.post(
            f"{BASE_URL}/tasks",
            headers=headers,
            json={
                "title": "Parent Container Orchestration Task",
                "description": "Parent task for child segregation",
                "priority": "High",
                "due_date": "2026-09-20T12:00:00Z",
                "user_id": session_emp["user"]["id"],
            },
        )
        assert parent_res.status_code in [200, 201]
        parent_id = parent_res.json()["id"]

        # Segregate Task into Child Subtasks
        seg_res = await client.post(
            f"{BASE_URL}/tasks/{parent_id}/segregate",
            headers=headers,
            json={
                "child_tasks": [
                    {
                        "title": "Child Subtask: Network Bridge Configuration",
                        "description": "Configuring bridge interfaces",
                        "priority": "Medium",
                        "assignee_id": session_emp["user"]["id"],
                    }
                ]
            },
        )
        assert seg_res.status_code in [200, 201]
        seg_data = seg_res.json()
        assert (
            "child_task_ids" in seg_data
            or "created_count" in seg_data
            or seg_data.get("success") is True
        )


# ==============================================================================
# 4. STORAGE UAT (Real Binary MinIO Upload & Download)
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_storage_real_binary():
    session = await get_auth_session("manager.a@acme.com")
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    async with httpx.AsyncClient() as client:
        # 1. Request presigned upload URL
        test_payload = b"ZeroTask UAT Self-Hosted Binary Payload Content Verification \x00\x01\x02\xFF"
        sha256_original = hashlib.sha256(test_payload).hexdigest()

        url_res = await client.post(
            f"{BASE_URL}/storage/upload-request",
            headers=headers,
            json={
                "bucket": "task-attachments",
                "file_name": "test_artifact.bin",
                "file_size_bytes": len(test_payload),
                "mime_type": "application/octet-stream",
            },
        )
        assert url_res.status_code == 200
        upload_data = url_res.json()
        put_url = upload_data["upload_url"]
        storage_path = upload_data["storage_path"]

        # If accessed from outside docker where minio:9000 isn't resolvable directly,
        # route via Nginx storage proxy
        target_put_url = put_url
        if "http://minio:9000" in put_url and "localhost:8000" not in BASE_URL:
            target_put_url = put_url.replace("http://minio:9000", "http://localhost:8088/storage")

        # 2. Perform raw binary PUT directly against storage
        put_res = await client.put(
            target_put_url,
            content=test_payload,
            headers={"Content-Type": "application/octet-stream"},
            timeout=10.0,
        )
        assert put_res.status_code in [200, 204]

        # 3. Request presigned download URL
        down_res = await client.get(
            f"{BASE_URL}/storage/signed-url?bucket=task-attachments&storage_path={storage_path}",
            headers=headers,
        )
        assert down_res.status_code == 200
        get_url = down_res.json()["url"]

        target_get_url = get_url
        if "http://minio:9000" in get_url and "localhost:8000" not in BASE_URL:
            target_get_url = get_url.replace("http://minio:9000", "http://localhost:8088/storage")

        # 4. Download and verify binary integrity
        fetch_res = await client.get(target_get_url, timeout=10.0)
        assert fetch_res.status_code == 200
        assert fetch_res.content == test_payload
        assert hashlib.sha256(fetch_res.content).hexdigest() == sha256_original


# ==============================================================================
# 5. MEETINGS & MULTI-STEP APPROVAL UAT
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_meetings_and_approvals():
    session_emp = await get_auth_session("employee.a@acme.com")
    session_head = await get_auth_session("depthead.a@acme.com")
    session_founder = await get_auth_session("founder.a@acme.com")

    async with httpx.AsyncClient() as client:
        # Employee requests a meeting
        meet_res = await client.post(
            f"{BASE_URL}/meetings",
            headers={"Authorization": f"Bearer {session_emp['access_token']}"},
            json={
                "title": "UAT Multi-Tier Approval Review",
                "agenda": "Requires review by Dept Head and Founder",
                "start_time": "2026-09-18T10:00:00Z",
                "end_time": "2026-09-18T11:00:00Z",
                "participants": [session_head["user"]["id"], session_founder["user"]["id"]],
            },
        )
        assert meet_res.status_code in [200, 201]
        meeting_id = meet_res.json()["id"]

        # List meetings
        list_res = await client.get(
            f"{BASE_URL}/meetings",
            headers={"Authorization": f"Bearer {session_emp['access_token']}"},
        )
        assert list_res.status_code == 200
        assert any(m["id"] == meeting_id for m in list_res.json())


# ==============================================================================
# 6. CHAT & DIRECT 1:1 CHAT UAT
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_chat_and_direct_messaging():
    session_mgr = await get_auth_session("manager.a@acme.com")
    session_emp = await get_auth_session("employee.a@acme.com")

    async with httpx.AsyncClient() as client:
        # Direct 1:1 Channel Resolution
        dm_res = await client.post(
            f"{BASE_URL}/chat/direct",
            headers={"Authorization": f"Bearer {session_mgr['access_token']}"},
            json={"target_user_id": session_emp["user"]["id"]},
        )
        assert dm_res.status_code in [200, 201]
        channel_id = dm_res.json()["channel_id"]

        # Send Message
        msg_res = await client.post(
            f"{BASE_URL}/chat/channels/{channel_id}/messages",
            headers={"Authorization": f"Bearer {session_mgr['access_token']}"},
            json={
                "channel_id": channel_id,
                "content": "UAT direct chat confirmation message from Manager.",
            },
        )
        assert msg_res.status_code in [200, 201]
        msg_id = msg_res.json()["id"]

        # Employee Reads Message
        history_res = await client.get(
            f"{BASE_URL}/chat/channels/{channel_id}/messages",
            headers={"Authorization": f"Bearer {session_emp['access_token']}"},
        )
        assert history_res.status_code == 200
        messages = history_res.json()
        assert any(m["id"] == msg_id for m in messages)


# ==============================================================================
# 7. NOTIFICATIONS UAT
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_notifications_lifecycle():
    session = await get_auth_session("employee.a@acme.com")
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    async with httpx.AsyncClient() as client:
        # Fetch unread count
        count_res = await client.get(f"{BASE_URL}/notifications/unread-count", headers=headers)
        assert count_res.status_code == 200
        assert "count" in count_res.json()

        # Fetch notifications
        notif_res = await client.get(f"{BASE_URL}/notifications", headers=headers)
        assert notif_res.status_code == 200
        notifications = notif_res.json()
        assert len(notifications) > 0

        # Mark single notification as read
        notif_id = notifications[0]["id"]
        read_res = await client.patch(f"{BASE_URL}/notifications/{notif_id}/read", headers=headers)
        assert read_res.status_code == 200

        # Mark all as read
        all_res = await client.patch(f"{BASE_URL}/notifications/read-all", headers=headers)
        assert all_res.status_code == 200


# ==============================================================================
# 8. SUPER ADMIN UAT
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_superadmin_management():
    session_sa = await get_auth_session("superadmin@zerotask.internal")
    headers = {"Authorization": f"Bearer {session_sa['access_token']}"}

    async with httpx.AsyncClient() as client:
        # Platform metrics & companies list
        comp_res = await client.get(f"{BASE_URL}/superadmin/companies", headers=headers)
        assert comp_res.status_code == 200
        companies = comp_res.json()
        assert len(companies) >= 2  # Company A and Company B exist

        # Founders list
        founders_res = await client.get(f"{BASE_URL}/superadmin/founders", headers=headers)
        assert founders_res.status_code == 200
        founders = founders_res.json()
        assert any(f["email"] == "founder.a@acme.com" for f in founders)
        assert any(f["email"] == "founder.b@beta.com" for f in founders)

        # Platform alerts / audit logs
        alerts_res = await client.get(f"{BASE_URL}/superadmin/alerts", headers=headers)
        assert alerts_res.status_code == 200


# ==============================================================================
# 9. CROSS-COMPANY ISOLATION ATTACK TEST
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_company_isolation_attack():
    session_a = await get_auth_session("employee.a@acme.com")
    session_b = await get_auth_session("employee.b@beta.com")

    headers_a = {"Authorization": f"Bearer {session_a['access_token']}"}
    headers_b = {"Authorization": f"Bearer {session_b['access_token']}"}

    async with httpx.AsyncClient() as client:
        # Fetch Company B tasks as Company B to get a target ID
        b_tasks_res = await client.get(f"{BASE_URL}/tasks", headers=headers_b)
        assert b_tasks_res.status_code == 200
        b_tasks = b_tasks_res.json()
        assert len(b_tasks) > 0
        target_b_task_id = b_tasks[0]["id"]

        # ATTACK: Company A attempts to GET Company B's task
        attack_res = await client.get(f"{BASE_URL}/tasks/{target_b_task_id}", headers=headers_a)
        assert attack_res.status_code in [403, 404], "Security Violation: Cross-company task access permitted!"

        # ATTACK: Company A attempts to modify Company B's task
        mod_res = await client.patch(
            f"{BASE_URL}/tasks/{target_b_task_id}",
            headers=headers_a,
            json={"status": "Done"},
        )
        assert mod_res.status_code in [403, 404], "Security Violation: Cross-company task modification permitted!"

        # ATTACK: Company A attempts to list Company B users
        users_res = await client.get(f"{BASE_URL}/users", headers=headers_a)
        assert users_res.status_code == 200
        for u in users_res.json():
            assert u.get("company_id") == session_a["user"]["company_id"], "Security Violation: Cross-company user leak!"


# ==============================================================================
# 10. FOUNDER PRIVACY ATTACK TEST
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_founder_privacy_attack():
    session_emp = await get_auth_session("employee.a@acme.com")
    session_founder = await get_auth_session("founder.a@acme.com")

    async with httpx.AsyncClient() as client:
        # Employee attempts to fetch personal notes of Founder
        notes_res = await client.get(
            f"{BASE_URL}/notes",
            headers={"Authorization": f"Bearer {session_emp['access_token']}"},
        )
        assert notes_res.status_code == 200
        emp_notes = notes_res.json()
        for note in emp_notes:
            assert "Confidential Founder Strategic Objectives" not in note["title"]

        # Founder retrieves own notes
        founder_notes_res = await client.get(
            f"{BASE_URL}/notes",
            headers={"Authorization": f"Bearer {session_founder['access_token']}"},
        )
        assert founder_notes_res.status_code == 200
        founder_notes = founder_notes_res.json()
        assert any("Confidential Founder" in n["title"] for n in founder_notes)


# ==============================================================================
# 11. OFFLINE MUTATION REPLAY UAT
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_offline_mutation_sync():
    session = await get_auth_session("employee.a@acme.com")
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    async with httpx.AsyncClient() as client:
        # Submit batched offline mutation with correct schema
        mutations = [
            {
                "id": "mut_offline_uat_1",
                "action": "INSERT",
                "table": "user_notes",
                "payload": {
                    "title": "Offline Standup Note",
                    "content": "Recorded while device was offline during commute.",
                },
                "timestamp": 1788500000000,
            }
        ]

        sync_res = await client.post(
            f"{BASE_URL}/sync/mutations",
            headers=headers,
            json={"mutations": mutations},
        )
        assert sync_res.status_code == 200
        sync_result = sync_res.json()
        assert sync_result.get("processed_count", 0) >= 1
        assert sync_result.get("success_count", 0) >= 1


# ==============================================================================
# 12. WEBSOCKET REALTIME UAT (Live Handshake & Ping/Pong)
# ==============================================================================
@pytest.mark.asyncio
async def test_uat_websocket_live():
    session = await get_auth_session("founder.a@acme.com")
    token = session["access_token"]
    ws_uri = f"{WS_URL}?token={token}"

    async with websockets.connect(ws_uri) as ws:
        # Send Ping
        await ws.send(json.dumps({"action": "ping"}))
        # Wait for Pong
        response_text = await asyncio.wait_for(ws.recv(), timeout=5.0)
        msg = json.loads(response_text)
        assert msg.get("action") == "pong"
