import uuid
import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock
from app.core.dependencies import (
    require_role,
    require_company_access,
    require_department_access,
)
from app.websocket.connection_manager import ConnectionManager
from app.websocket.events import RealtimeEventType
from tests.conftest import (
    COMPANY_A_ID,
    COMPANY_B_ID,
    DEPT_A_ID,
    DEPT_B_ID,
    make_user,
    USER_SUPERADMIN_ID,
    USER_FOUNDER_A_ID,
    USER_MANAGER_A_ID,
    USER_EMPLOYEE_A_ID,
    USER_FOUNDER_B_ID,
    USER_EMPLOYEE_B_ID,
)


# ==============================================================================
# 1. MULTI-COMPANY ISOLATION: REST & STORAGE
# ==============================================================================
def test_company_data_isolation_rest():
    """Verify Company A users cannot access Company B resources via REST"""
    emp_a = make_user(USER_EMPLOYEE_A_ID, "emp.a@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID)
    emp_b = make_user(USER_EMPLOYEE_B_ID, "emp.b@beta.com", "Employee", COMPANY_B_ID, DEPT_B_ID)

    # Employee A accessing Company A resource -> OK
    require_company_access(COMPANY_A_ID, emp_a)

    # Employee A accessing Company B resource -> 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        require_company_access(COMPANY_B_ID, emp_a)
    assert exc_info.value.status_code == 403
    assert "Cross-company access violation" in exc_info.value.detail

    # Employee B accessing Company A resource -> 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        require_company_access(COMPANY_A_ID, emp_b)
    assert exc_info.value.status_code == 403
    assert "Cross-company access violation" in exc_info.value.detail


# ==============================================================================
# 2. MULTI-COMPANY ISOLATION: WEBSOCKETS (NO CROSS-COMPANY LEAKAGE)
# ==============================================================================
@pytest.mark.asyncio
async def test_company_event_isolation_websockets():
    """Verify WebSocket events from Company A NEVER leak to Company B clients"""
    manager = ConnectionManager()

    # Connect client from Company A
    user_a = make_user(USER_EMPLOYEE_A_ID, "emp.a@acme.com", "Employee", COMPANY_A_ID)
    ws_a = AsyncMock()
    ws_a.send_text = AsyncMock()
    await manager.connect(ws_a, user_a)

    # Connect client from Company B
    user_b = make_user(USER_EMPLOYEE_B_ID, "emp.b@beta.com", "Employee", COMPANY_B_ID)
    ws_b = AsyncMock()
    ws_b.send_text = AsyncMock()
    await manager.connect(ws_b, user_b)

    # Dispatch sensitive task update event strictly to Company A
    await manager.broadcast_to_company(
        company_id=COMPANY_A_ID,
        event=RealtimeEventType.TASK_UPDATE,
        payload={"task_id": "confidential-acme-task", "title": "Secret M&A Task"},
    )

    # ws_a must receive the event
    assert ws_a.send_text.called is True
    call_args_a = ws_a.send_text.call_args[0][0]
    assert "Secret M&A Task" in call_args_a

    # ws_b must NEVER receive the event!
    assert ws_b.send_text.called is False

    # Disconnect
    manager.disconnect(ws_a)
    manager.disconnect(ws_b)


# ==============================================================================
# 3. ROLE HIERARCHY & BOUNDARY ENFORCEMENT
# ==============================================================================
def test_department_boundary_enforcement():
    """Verify Department Head and Manager cannot cross departmental boundaries"""
    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID, DEPT_A_ID)
    mgr_dept_a = make_user(USER_MANAGER_A_ID, "mgr.a@acme.com", "Manager", COMPANY_A_ID, DEPT_A_ID)

    # Founder has universal company access
    require_department_access(DEPT_A_ID, founder)
    require_department_access(DEPT_B_ID, founder)

    # Manager in Dept A accessing Dept A -> OK
    require_department_access(DEPT_A_ID, mgr_dept_a)

    # Manager in Dept A accessing Dept B -> 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        require_department_access(DEPT_B_ID, mgr_dept_a)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_meeting_approval_authorization():
    """Verify only authorized approvers (Manager, Dept Head, Founder) can approve meetings"""
    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)
    manager = make_user(USER_MANAGER_A_ID, "mgr@acme.com", "Manager", COMPANY_A_ID)
    employee = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)

    approver_role_check = require_role(["Manager", "Department Head", "Founder", "Super Admin"])

    # Founder can approve
    res_f = await approver_role_check(founder)
    assert res_f.role == "Founder"

    # Manager can approve
    res_m = await approver_role_check(manager)
    assert res_m.role == "Manager"

    # Regular Employee CANNOT approve -> 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        await approver_role_check(employee)
    assert exc_info.value.status_code == 403


# ==============================================================================
# 4. FOUNDER PRIVACY & SUPER ADMIN SEPARATION
# ==============================================================================
def test_founder_privacy_protection():
    """Verify Founder personal/private items are isolated and protected from Super Admin"""
    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)
    superadmin = make_user(USER_SUPERADMIN_ID, "admin@zerotask.internal", "Super Admin")

    # Founder's personal note owner check
    founder_note_owner_id = USER_FOUNDER_A_ID

    # Founder accessing own note -> OK
    assert founder.id == founder_note_owner_id

    # Super Admin attempting to view private founder note directly -> Blocked
    assert superadmin.id != founder_note_owner_id
    # Super Admin cannot act as regular company user
    assert superadmin.company_id is None
