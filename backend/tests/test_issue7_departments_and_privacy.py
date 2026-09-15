"""
test_issue7_departments_and_privacy.py
======================================
Comprehensive automated test suite for ZeroTask Issue 7:
- Part A: Dynamic Department Management & Uniqueness
- Part B: Strict Task & Meeting Privacy & Search Isolation
- Part C: Subtask Assignee Eligibility & Hierarchy Authorization

Canonical runtime: FastAPI -> PostgreSQL (no Supabase).
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.models.user import User, Department, Designation
from app.models.company import Company
from app.models.task import Task, TaskAssignee
from app.models.meeting import Meeting, MeetingParticipant
from app.schemas.user import DepartmentCreate, DepartmentUpdate
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.task_service import TaskService
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

USER_DH_A_ID = uuid.UUID("aaaaaaaa-0010-0000-0000-000000000000")
USER_EMPLOYEE_A2_ID = uuid.UUID("aaaaaaaa-0020-0000-0000-000000000000")
PARENT_TASK_ID = uuid.UUID("cccccccc-1111-1111-1111-cccccccccccc")


@pytest.fixture
def dh_a():
    return make_user(USER_DH_A_ID, "dh.a@acme.com", "Department Head", COMPANY_A_ID, DEPT_A_ID)


@pytest.fixture
def employee_a2():
    return make_user(USER_EMPLOYEE_A2_ID, "employee.a2@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID)


# =========================================================================
# PART A: DEPARTMENT MANAGEMENT & UNIQUENESS TESTS (Tests 1 - 10)
# =========================================================================

def test_department_model_structure():
    """1. Department model initializes correctly with company_id."""
    dept = Department(
        id=uuid.uuid4(),
        company_id=COMPANY_A_ID,
        name="Customer Service",
    )
    assert dept.name == "Customer Service"
    assert dept.company_id == COMPANY_A_ID


def test_department_create_schema():
    """2. DepartmentCreate schema parses and validates."""
    data = DepartmentCreate(name="  Customer Service  ", company_id=COMPANY_A_ID)
    assert data.name.strip() == "Customer Service"
    assert data.company_id == COMPANY_A_ID


@pytest.mark.asyncio
async def test_duplicate_department_same_company_rejected():
    """3. Duplicate department in the same company is rejected."""
    from app.api.v1.users import create_department

    mock_db = AsyncMock()
    existing_dept = Department(id=uuid.uuid4(), company_id=COMPANY_A_ID, name="Management")
    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = existing_dept
    mock_db.execute.return_value = res_mock

    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)

    with pytest.raises(HTTPException) as exc_info:
        await create_department(
            data=DepartmentCreate(name="Management"),
            current_user=founder,
            db=mock_db,
        )
    assert exc_info.value.status_code == 409
    assert "already exists" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_case_insensitive_duplicate_department_rejected():
    """4. Case-insensitive and trimmed department name duplicate is rejected."""
    from app.api.v1.users import create_department

    mock_db = AsyncMock()
    existing_dept = Department(id=uuid.uuid4(), company_id=COMPANY_A_ID, name="Management")
    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = existing_dept
    mock_db.execute.return_value = res_mock

    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)

    with pytest.raises(HTTPException) as exc_info:
        await create_department(
            data=DepartmentCreate(name="  management  "),
            current_user=founder,
            db=mock_db,
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_same_department_name_different_company_allowed():
    """5. Same department name in different companies is allowed."""
    from app.api.v1.users import create_department

    mock_db = AsyncMock()
    # Company B has no department named Management yet
    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = res_mock

    founder_b = make_user(USER_FOUNDER_B_ID, "founder@beta.com", "Founder", COMPANY_B_ID)

    new_dept = await create_department(
        data=DepartmentCreate(name="Management"),
        current_user=founder_b,
        db=mock_db,
    )
    assert new_dept.name == "Management"
    assert new_dept.company_id == COMPANY_B_ID
    assert mock_db.add.called
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_department_list_is_company_scoped(founder_a):
    """6. Department list returns only caller's company departments."""
    from app.api.v1.users import list_departments

    mock_db = AsyncMock()
    dept1 = Department(id=uuid.uuid4(), company_id=COMPANY_A_ID, name="Engineering")
    dept2 = Department(id=uuid.uuid4(), company_id=COMPANY_A_ID, name="Management")

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [dept1, dept2]
    res_mock = MagicMock()
    res_mock.scalars.return_value = scalars_mock
    mock_db.execute.return_value = res_mock

    depts = await list_departments(current_user=founder_a, db=mock_db)
    assert len(depts) == 2
    for d in depts:
        assert d.company_id == COMPANY_A_ID


@pytest.mark.asyncio
async def test_new_department_returns_authoritative_record(founder_a):
    """7. Created department returns authoritative ID and properties."""
    from app.api.v1.users import create_department

    mock_db = AsyncMock()
    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = res_mock

    created = await create_department(
        data=DepartmentCreate(name="Customer Service"),
        current_user=founder_a,
        db=mock_db,
    )
    assert created.id is not None
    assert created.company_id == COMPANY_A_ID
    assert created.name == "Customer Service"


@pytest.mark.asyncio
async def test_department_delete_blocked_when_users_assigned(founder_a):
    """8. Department deletion is blocked when active users belong to it."""
    from app.api.v1.users import delete_department

    mock_db = AsyncMock()
    dept = Department(id=DEPT_A_ID, company_id=COMPANY_A_ID, name="Operations")
    dept_res = MagicMock()
    dept_res.scalar_one_or_none.return_value = dept

    count_res = MagicMock()
    count_res.scalar.return_value = 3  # 3 active users
    mock_db.execute.side_effect = [dept_res, count_res]

    with pytest.raises(HTTPException) as exc_info:
        await delete_department(dept_id=DEPT_A_ID, current_user=founder_a, db=mock_db)
    assert exc_info.value.status_code == 400
    assert "active user" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_department_rename_checks_uniqueness(founder_a):
    """9. Department rename enforces company-scoped uniqueness."""
    from app.api.v1.users import update_department

    mock_db = AsyncMock()
    dept = Department(id=DEPT_A_ID, company_id=COMPANY_A_ID, name="Old Name")
    dept_res = MagicMock()
    dept_res.scalar_one_or_none.return_value = dept

    # Conflict query finds an existing department with the target name
    dup = Department(id=uuid.uuid4(), company_id=COMPANY_A_ID, name="Engineering")
    dup_res = MagicMock()
    dup_res.scalar_one_or_none.return_value = dup
    mock_db.execute.side_effect = [dept_res, dup_res]

    with pytest.raises(HTTPException) as exc_info:
        await update_department(
            dept_id=DEPT_A_ID,
            data=DepartmentUpdate(name="Engineering"),
            current_user=founder_a,
            db=mock_db,
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_cross_company_department_access_rejected(founder_a):
    """10. Accessing another company's department for update/delete is forbidden."""
    from app.api.v1.users import update_department

    mock_db = AsyncMock()
    dept_b = Department(id=DEPT_B_ID, company_id=COMPANY_B_ID, name="Beta Dept")
    dept_res = MagicMock()
    dept_res.scalar_one_or_none.return_value = dept_b
    mock_db.execute.return_value = dept_res

    with pytest.raises(HTTPException) as exc_info:
        await update_department(
            dept_id=DEPT_B_ID,
            data=DepartmentUpdate(name="Renamed"),
            current_user=founder_a,
            db=mock_db,
        )
    assert exc_info.value.status_code == 403


# =========================================================================
# PART B: STRICT WORK PRIVACY & SEARCH ISOLATION (Tests 11 - 16)
# =========================================================================

@pytest.mark.asyncio
async def test_unrelated_employee_cannot_retrieve_unrelated_task(employee_a, employee_a2):
    """11. Unrelated same-company employee cannot access a task they are not involved in."""
    mock_db = AsyncMock()
    task = Task(
        id=uuid.uuid4(),
        title="Employee A Task",
        company_id=COMPANY_A_ID,
        created_by=employee_a.id,
        user_id=employee_a.id,
        is_private=False,
    )
    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = task
    mock_db.execute.return_value = res_mock

    # Employee A2 has no involvement (not creator, not assignee, not subtask participant)
    with pytest.raises(HTTPException) as exc_info:
        await TaskService.get_task_by_id(mock_db, task.id, employee_a2)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_company_task_access_rejected(employee_a, employee_b):
    """12. Cross-company task access returns 403 Forbidden."""
    mock_db = AsyncMock()
    task_b = Task(
        id=uuid.uuid4(),
        title="Company B Task",
        company_id=COMPANY_B_ID,
        created_by=employee_b.id,
        user_id=employee_b.id,
        is_private=False,
    )
    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = task_b
    mock_db.execute.return_value = res_mock

    with pytest.raises(HTTPException) as exc_info:
        await TaskService.get_task_by_id(mock_db, task_b.id, employee_a)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_unrelated_employee_cannot_retrieve_unrelated_meeting(employee_a, employee_a2):
    """13. Unrelated same-company employee cannot access meeting they are not part of."""
    from app.api.v1.meetings import get_meeting

    mock_db = AsyncMock()
    meeting = Meeting(
        id=uuid.uuid4(),
        title="Executive Strategy Session",
        company_id=COMPANY_A_ID,
        organizer_id=USER_FOUNDER_A_ID,
    )
    meeting.participants = [MeetingParticipant(meeting_id=meeting.id, user_id=USER_FOUNDER_A_ID)]
    meeting.approvals = []

    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = meeting
    mock_db.execute.return_value = res_mock

    with pytest.raises(HTTPException) as exc_info:
        await get_meeting(meeting_id=meeting.id, current_user=employee_a2, db=mock_db)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_company_meeting_access_rejected(employee_a, employee_b):
    """14. Cross-company meeting access returns 403 Forbidden."""
    from app.api.v1.meetings import get_meeting

    mock_db = AsyncMock()
    meeting_b = Meeting(
        id=uuid.uuid4(),
        title="Company B Sync",
        company_id=COMPANY_B_ID,
        organizer_id=employee_b.id,
    )
    meeting_b.participants = []
    meeting_b.approvals = []

    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = meeting_b
    mock_db.execute.return_value = res_mock

    with pytest.raises(HTTPException) as exc_info:
        await get_meeting(meeting_id=meeting_b.id, current_user=employee_a, db=mock_db)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_user_search_is_company_scoped(employee_a):
    """15. User search endpoint strictly filters by authenticated user's company."""
    from app.api.v1.users import list_company_users

    mock_db = AsyncMock()
    scalars_mock = MagicMock()
    user_same_company = make_user(uuid.uuid4(), "alice@acme.com", "Employee", COMPANY_A_ID)
    scalars_mock.all.return_value = [user_same_company]
    res_mock = MagicMock()
    res_mock.scalars.return_value = scalars_mock
    mock_db.execute.return_value = res_mock

    users = await list_company_users(search="alice", current_user=employee_a, db=mock_db)
    assert len(users) == 1
    assert users[0].company_id == COMPANY_A_ID


# =========================================================================
# PART C: SUBTASK ASSIGNEE ELIGIBILITY & AUTHORIZATION (Tests 16 - 30)
# =========================================================================

def test_can_assign_super_admin_universal():
    """16. Super Admin can assign to any role."""
    sa = make_user(USER_SUPERADMIN_ID, "sa@zerotask.internal", "Super Admin")
    target = make_user(uuid.uuid4(), "target@acme.com", "Founder", COMPANY_A_ID)
    assert TaskService.can_assign_role(sa.role, target.role) is True


def test_can_assign_employee_to_founder_rejected():
    """17. Employee CANNOT assign to Founder."""
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)
    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)
    assert TaskService.can_assign_role(emp.role, founder.role) is False


def test_can_assign_employee_to_super_admin_rejected():
    """18. Employee CANNOT assign to Super Admin."""
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)
    sa = make_user(USER_SUPERADMIN_ID, "sa@zerotask.internal", "Super Admin")
    assert TaskService.can_assign_role(emp.role, sa.role) is False


def test_can_assign_employee_to_dh_allowed():
    """19. Employee CAN assign to Department Head."""
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)
    dh = make_user(USER_DH_A_ID, "dh@acme.com", "Department Head", COMPANY_A_ID)
    assert TaskService.can_assign_role(emp.role, dh.role) is True


def test_can_assign_employee_to_manager_allowed():
    """20. Employee CAN assign to Manager."""
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)
    mgr = make_user(USER_MANAGER_A_ID, "mgr@acme.com", "Manager", COMPANY_A_ID)
    assert TaskService.can_assign_role(emp.role, mgr.role) is True


def test_can_assign_employee_to_employee_allowed():
    """21. Employee CAN assign to another Employee."""
    emp1 = make_user(USER_EMPLOYEE_A_ID, "emp1@acme.com", "Employee", COMPANY_A_ID)
    emp2 = make_user(USER_EMPLOYEE_A2_ID, "emp2@acme.com", "Employee", COMPANY_A_ID)
    assert TaskService.can_assign_role(emp1.role, emp2.role) is True


def test_can_assign_dh_to_roles_allowed():
    """22. Department Head can assign to DH, Manager, Employee."""
    dh = make_user(USER_DH_A_ID, "dh@acme.com", "Department Head", COMPANY_A_ID)
    mgr = make_user(USER_MANAGER_A_ID, "mgr@acme.com", "Manager", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)

    assert TaskService.can_assign_role(dh.role, dh.role) is True
    assert TaskService.can_assign_role(dh.role, mgr.role) is True
    assert TaskService.can_assign_role(dh.role, emp.role) is True


def test_can_assign_manager_to_roles_allowed():
    """23. Manager can assign to DH, Manager, Employee."""
    mgr = make_user(USER_MANAGER_A_ID, "mgr@acme.com", "Manager", COMPANY_A_ID)
    dh = make_user(USER_DH_A_ID, "dh@acme.com", "Department Head", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)

    assert TaskService.can_assign_role(mgr.role, dh.role) is True
    assert TaskService.can_assign_role(mgr.role, mgr.role) is True
    assert TaskService.can_assign_role(mgr.role, emp.role) is True


@pytest.mark.asyncio
async def test_cross_company_assignee_rejected_in_can_assign():
    """24. Cross-company assignee is rejected in database can_assign check."""
    mock_db = AsyncMock()
    emp_a = make_user(USER_EMPLOYEE_A_ID, "emp.a@acme.com", "Employee", COMPANY_A_ID)
    emp_b = make_user(USER_EMPLOYEE_B_ID, "emp.b@beta.com", "Employee", COMPANY_B_ID)

    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = emp_b
    mock_db.execute.return_value = res_mock

    allowed = await TaskService.can_assign(mock_db, emp_a, emp_b.id)
    assert allowed is False


@pytest.mark.asyncio
async def test_eligible_assignees_excludes_founder_for_non_executives(dh_a):
    """25. Eligible assignees endpoint excludes Founder and Super Admin for Department Head."""
    mock_db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)
    mgr = make_user(USER_MANAGER_A_ID, "mgr@acme.com", "Manager", COMPANY_A_ID)
    emp = make_user(USER_EMPLOYEE_A_ID, "emp@acme.com", "Employee", COMPANY_A_ID)

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [mgr, emp]
    res_mock = MagicMock()
    res_mock.scalars.return_value = scalars_mock
    mock_db.execute.return_value = res_mock

    assignees = await TaskService.get_eligible_assignees(mock_db, dh_a)
    roles = [u.role for u in assignees]
    assert "Founder" not in roles
    assert "Super Admin" not in roles


@pytest.mark.asyncio
async def test_subtask_creation_uses_parent_task_id(dh_a):
    """26. Subtask created with parent_task_id stores exact parent ID."""
    parent = Task(
        id=PARENT_TASK_ID,
        title="Founder Major Task",
        company_id=COMPANY_A_ID,
        created_by=USER_FOUNDER_A_ID,
        is_private=False,
    )
    mock_db = AsyncMock()
    parent_res = MagicMock()
    parent_res.scalar_one_or_none.return_value = parent
    mock_db.execute.return_value = parent_res

    with patch("app.services.task_service.TaskService.get_task_depth_and_ancestors", new_callable=AsyncMock, return_value=(1, [])), \
         patch("app.services.task_service.TaskService.can_assign", new_callable=AsyncMock, return_value=True), \
         patch("app.services.task_service.TaskService.recalculate_parent_progress", new_callable=AsyncMock):

        task_data = TaskCreate(
            title="Subtask B under A",
            parent_task_id=PARENT_TASK_ID,
            assignee_ids=[USER_DH_A_ID],
        )

        res = await TaskService.create_task(mock_db, dh_a, task_data)
        assert res.parent_task_id == PARENT_TASK_ID


@pytest.mark.asyncio
async def test_subtask_at_depth_5_cannot_create_depth_6(dh_a):
    """27. Subtask under Level 5 parent is rejected with 400 Bad Request."""
    parent = Task(
        id=PARENT_TASK_ID,
        title="Level 5 Task",
        company_id=COMPANY_A_ID,
        created_by=dh_a.id,
        is_private=False,
    )
    mock_db = AsyncMock()
    parent_res = MagicMock()
    parent_res.scalar_one_or_none.return_value = parent
    mock_db.execute.return_value = parent_res

    with patch("app.services.task_service.TaskService.get_task_depth_and_ancestors", new_callable=AsyncMock, return_value=(5, [])):
        task_data = TaskCreate(
            title="Invalid Level 6 Subtask",
            parent_task_id=PARENT_TASK_ID,
            assignee_ids=[USER_DH_A_ID],
        )

        with pytest.raises(HTTPException) as exc_info:
            await TaskService.create_task(mock_db, dh_a, task_data)
        assert exc_info.value.status_code == 400
        assert "depth of 5" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_cross_company_parent_task_rejected(dh_a, founder_b):
    """28. Attempting to create a subtask under a Company B parent is rejected."""
    parent_b = Task(
        id=uuid.uuid4(),
        title="Company B Major Task",
        company_id=COMPANY_B_ID,
        created_by=founder_b.id,
    )
    mock_db = AsyncMock()
    res_mock = MagicMock()
    res_mock.scalar_one_or_none.return_value = parent_b
    mock_db.execute.return_value = res_mock

    with pytest.raises(HTTPException) as exc_info:
        await TaskService.get_eligible_assignees(mock_db, dh_a, parent_task_id=parent_b.id)
    assert exc_info.value.status_code == 403
    assert "cross-company" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_has_incomplete_subtasks_detects_nested_incomplete(founder_a):
    """29. has_incomplete_subtasks recursively detects nested child task (A -> B -> C)."""
    task_a_id = uuid.uuid4()
    task_b_id = uuid.uuid4()
    task_c_id = uuid.uuid4()

    mock_db = AsyncMock()

    # Step 1: Query for children of A returns B (Done)
    res_b = MagicMock()
    row_b = MagicMock()
    row_b.id = task_b_id
    row_b.status = "Done"
    res_b.all.return_value = [row_b]

    # Step 2: Query for children of B returns C (To Do)
    res_c = MagicMock()
    row_c = MagicMock()
    row_c.id = task_c_id
    row_c.status = "To Do"
    res_c.all.return_value = [row_c]

    mock_db.execute.side_effect = [res_b, res_c]

    has_incomplete = await TaskService.has_incomplete_subtasks(mock_db, task_a_id)
    assert has_incomplete is True


@pytest.mark.asyncio
async def test_mark_major_task_completed_fails_with_exact_message_when_child_incomplete(founder_a):
    """30. Updating major task to Done when direct child is incomplete raises 400 with exact message."""
    task_a = Task(
        id=uuid.uuid4(),
        title="Major Task A",
        status="In Progress",
        progress=50,
        company_id=COMPANY_A_ID,
        created_by=founder_a.id,
    )
    mock_db = AsyncMock()

    with patch("app.services.task_service.TaskService.get_task_by_id", new_callable=AsyncMock, return_value=task_a), \
         patch("app.services.task_service.TaskService.has_incomplete_subtasks", new_callable=AsyncMock, return_value=True):

        with pytest.raises(HTTPException) as exc_info:
            await TaskService.update_task(
                mock_db, task_a.id, founder_a, TaskUpdate(status="Done")
            )

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "First complete the child tasks inside the major task given, then only proceed with completing the major task."


@pytest.mark.asyncio
async def test_mark_major_task_completed_fails_when_nested_child_incomplete(founder_a):
    """31. Setting progress=100 on major task when nested child (A -> B -> C) is incomplete raises 400."""
    task_a = Task(
        id=uuid.uuid4(),
        title="Major Task A",
        status="In Progress",
        progress=50,
        company_id=COMPANY_A_ID,
        created_by=founder_a.id,
    )
    mock_db = AsyncMock()

    with patch("app.services.task_service.TaskService.get_task_by_id", new_callable=AsyncMock, return_value=task_a), \
         patch("app.services.task_service.TaskService.has_incomplete_subtasks", new_callable=AsyncMock, return_value=True):

        with pytest.raises(HTTPException) as exc_info:
            await TaskService.update_task(
                mock_db, task_a.id, founder_a, TaskUpdate(progress=100)
            )

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "First complete the child tasks inside the major task given, then only proceed with completing the major task."


@pytest.mark.asyncio
async def test_complete_task_endpoint_fails_when_descendant_incomplete(founder_a):
    """32. complete_task() triggers completion validation and raises 400 with exact message."""
    task_a = Task(
        id=uuid.uuid4(),
        title="Major Task A",
        status="In Progress",
        progress=50,
        company_id=COMPANY_A_ID,
        created_by=founder_a.id,
    )
    mock_db = AsyncMock()

    with patch("app.services.task_service.TaskService.get_task_by_id", new_callable=AsyncMock, return_value=task_a), \
         patch("app.services.task_service.TaskService.has_incomplete_subtasks", new_callable=AsyncMock, return_value=True):

        with pytest.raises(HTTPException) as exc_info:
            await TaskService.complete_task(mock_db, task_a.id, founder_a)

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "First complete the child tasks inside the major task given, then only proceed with completing the major task."


@pytest.mark.asyncio
async def test_mark_major_task_completed_succeeds_when_all_children_done(founder_a):
    """33. Major task can be marked Done when all descendant child tasks are completed."""
    task_a = Task(
        id=uuid.uuid4(),
        title="Major Task A",
        status="In Progress",
        progress=50,
        company_id=COMPANY_A_ID,
        created_by=founder_a.id,
    )
    mock_db = AsyncMock()

    with patch("app.services.task_service.TaskService.get_task_by_id", new_callable=AsyncMock, return_value=task_a), \
         patch("app.services.task_service.TaskService.has_incomplete_subtasks", new_callable=AsyncMock, return_value=False), \
         patch("app.services.task_service.TaskService.recalculate_parent_progress", new_callable=AsyncMock):

        updated = await TaskService.update_task(
            mock_db, task_a.id, founder_a, TaskUpdate(status="Done")
        )

        assert updated.status == "Done"
        assert updated.progress == 100

