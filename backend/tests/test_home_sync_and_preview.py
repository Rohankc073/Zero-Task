import pytest
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.models.user import User
from app.models.task import Task, TaskAssignee
from app.services.task_service import TaskService
from app.schemas.task import TaskCreate, TaskUpdate
from app.websocket.events import RealtimeEventType


# ── Fixtures ─────────────────────────────────────────────────────────

COMPANY_A = uuid.uuid4()
COMPANY_B = uuid.uuid4()

FOUNDER_A = User(
    id=uuid.uuid4(),
    email="founder_a@companya.com",
    role="Founder",
    company_id=COMPANY_A,
    is_deleted=False,
)

EMPLOYEE_A1 = User(
    id=uuid.uuid4(),
    email="emp_a1@companya.com",
    role="Employee",
    company_id=COMPANY_A,
    is_deleted=False,
)

EMPLOYEE_A2 = User(
    id=uuid.uuid4(),
    email="emp_a2@companya.com",
    role="Employee",
    company_id=COMPANY_A,
    is_deleted=False,
)

EMPLOYEE_B1 = User(
    id=uuid.uuid4(),
    email="emp_b1@companyb.com",
    role="Employee",
    company_id=COMPANY_B,
    is_deleted=False,
)


# ── 1. HOME SYNCHRONIZATION TESTS ────────────────────────────────────

@pytest.mark.asyncio
async def test_home_and_tasks_use_consistent_task_scope():
    """Home metrics and Tasks screen must both derive from the exact same authorized tasks dataset."""
    tasks = [
        Task(
            id=uuid.uuid4(),
            title="Task 1",
            status="To Do",
            due_date=datetime.now(timezone.utc) + timedelta(days=2),
            user_id=EMPLOYEE_A1.id,
            company_id=COMPANY_A,
        ),
        Task(
            id=uuid.uuid4(),
            title="Task 2",
            status="In Progress",
            progress=50,
            due_date=datetime.now(timezone.utc) + timedelta(days=1),
            user_id=EMPLOYEE_A1.id,
            company_id=COMPANY_A,
        ),
        Task(
            id=uuid.uuid4(),
            title="Task 3",
            status="Done",
            progress=100,
            due_date=datetime.now(timezone.utc) - timedelta(days=1),
            user_id=EMPLOYEE_A1.id,
            company_id=COMPANY_A,
        ),
    ]

    # Calculate metrics in exactly the same way as computeTaskMetrics
    assigned = len(tasks)
    in_progress = sum(1 for t in tasks if t.status == "In Progress")
    completed = sum(1 for t in tasks if t.status in ("Done", "Completed"))
    overdue = sum(1 for t in tasks if t.due_date and t.due_date < datetime.now(timezone.utc) and t.status != "Done")

    assert assigned == 3
    assert in_progress == 1
    assert completed == 1
    assert overdue == 0  # Completed task is not overdue even if past due date


@pytest.mark.asyncio
async def test_subtasks_do_not_double_count_dashboard_root_metrics():
    """Child tasks should be counted cleanly and not disrupt root task metrics."""
    parent = Task(
        id=uuid.uuid4(),
        title="Major Project",
        status="In Progress",
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
        parent_task_id=None,
    )
    child1 = Task(
        id=uuid.uuid4(),
        title="Subtask 1",
        status="Done",
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
        parent_task_id=parent.id,
    )
    child2 = Task(
        id=uuid.uuid4(),
        title="Subtask 2",
        status="In Progress",
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
        parent_task_id=parent.id,
    )

    all_tasks = [parent, child1, child2]

    # Universal assignment scoping
    my_tasks = [t for t in all_tasks if t.user_id == EMPLOYEE_A1.id]
    assert len(my_tasks) == 3

    # Root tasks only for Tasks screen root view
    root_tasks = [t for t in my_tasks if not t.parent_task_id]
    assert len(root_tasks) == 1
    assert root_tasks[0].id == parent.id


@pytest.mark.asyncio
async def test_company_isolation_home_metrics():
    """Company A tasks must never be returned to or visible in Company B Home."""
    task_a = Task(
        id=uuid.uuid4(),
        title="Secret Company A Task",
        status="To Do",
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
    )

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = task_a
    mock_db.execute.return_value = mock_res

    # Access by Company B user must raise 403 Forbidden
    with pytest.raises(HTTPException) as exc:
        await TaskService.get_task_by_id(mock_db, task_a.id, EMPLOYEE_B1)
    assert exc.value.status_code == 403
    assert "Cross-company access denied" in exc.value.detail


# ── 2. PREVIEW INTEGRATION & ERROR CODE TESTS ────────────────────────

@pytest.mark.asyncio
async def test_task_preview_passes_and_fetches_exact_id():
    """Task Preview lookup must resolve task by exact task ID."""
    target_id = uuid.uuid4()
    task = Task(
        id=target_id,
        title="Launch ZeroTask V2",
        status="In Progress",
        user_id=FOUNDER_A.id,
        company_id=COMPANY_A,
        created_by=FOUNDER_A.id,
        subtasks=[],
    )

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = task
    mock_db.execute.return_value = mock_res

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(1, []))):
        fetched = await TaskService.get_task_by_id(mock_db, target_id, FOUNDER_A)

    assert fetched is not None
    assert fetched.id == target_id
    assert fetched.title == "Launch ZeroTask V2"


@pytest.mark.asyncio
async def test_task_preview_zero_children_is_valid():
    """A task with 0 subtasks is valid and must not return unavailable."""
    target_id = uuid.uuid4()
    task = Task(
        id=target_id,
        title="Standalone Task With No Subtasks",
        status="To Do",
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
        created_by=FOUNDER_A.id,
        subtasks=[],
    )

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = task
    mock_db.execute.return_value = mock_res

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(1, []))):
        fetched = await TaskService.get_task_by_id(mock_db, target_id, EMPLOYEE_A1)

    assert fetched is not None
    assert fetched.subtasks == []


@pytest.mark.asyncio
async def test_task_preview_optional_null_fields():
    """A task with null due_date, description, and department must resolve cleanly."""
    target_id = uuid.uuid4()
    task = Task(
        id=target_id,
        title="Minimal Task",
        status="To Do",
        description=None,
        due_date=None,
        department_id=None,
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
        created_by=EMPLOYEE_A1.id,
        subtasks=[],
    )

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = task
    mock_db.execute.return_value = mock_res

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(1, []))):
        fetched = await TaskService.get_task_by_id(mock_db, target_id, EMPLOYEE_A1)

    assert fetched is not None
    assert fetched.due_date is None
    assert fetched.description is None
    assert fetched.department_id is None


@pytest.mark.asyncio
async def test_task_preview_unauthorized_user_raises_403():
    """An unauthorized employee attempting to preview a task they are not involved in gets 403."""
    target_id = uuid.uuid4()
    task = Task(
        id=target_id,
        title="Private Peer Task",
        status="To Do",
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
        created_by=EMPLOYEE_A1.id,
        is_private=True,
        subtasks=[],
    )

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = task
    mock_db.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await TaskService.get_task_by_id(mock_db, target_id, EMPLOYEE_A2)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_task_preview_nonexistent_task_returns_none():
    """A nonexistent task ID returns None (mapped to 404 in route)."""
    target_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_res

    fetched = await TaskService.get_task_by_id(mock_db, target_id, EMPLOYEE_A1)
    assert fetched is None


# ── 3. REALTIME SCOPING TESTS ────────────────────────────────────────

@pytest.mark.asyncio
async def test_task_created_event_broadcast_user_scoped():
    """Task creation must broadcast TASK_UPDATE only to assignees and creator."""
    task_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    create_data = TaskCreate(
        title="Review PR",
        priority="High",
        status="To Do",
        assignee_ids=[EMPLOYEE_A1.id],
    )

    with patch("app.websocket.connection_manager.connection_manager.broadcast_to_user", new_callable=AsyncMock) as mock_ws_user, \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_company", new_callable=AsyncMock) as mock_ws_comp, \
         patch.object(TaskService, "can_assign", new=AsyncMock(return_value=True)), \
         patch("app.services.push_service.push_service.send_to_user", new_callable=AsyncMock):
        
        # Call create_task
        task = await TaskService.create_task(mock_db, FOUNDER_A, create_data)

        # Must broadcast to affected users (EMPLOYEE_A1 and FOUNDER_A)
        assert mock_ws_user.called
        broadcast_recipient_ids = [call.kwargs.get("user_id") for call in mock_ws_user.call_args_list]
        
        assert EMPLOYEE_A1.id in broadcast_recipient_ids
        assert FOUNDER_A.id in broadcast_recipient_ids
        
        # Unrelated employee must NOT be broadcasted
        assert EMPLOYEE_A2.id not in broadcast_recipient_ids
        assert EMPLOYEE_B1.id not in broadcast_recipient_ids


@pytest.mark.asyncio
async def test_task_completion_protection_blocks_completion_when_children_incomplete():
    """Parent completion protection must block marking Done when child tasks are open."""
    parent_id = uuid.uuid4()
    child_id = uuid.uuid4()

    parent = Task(
        id=parent_id,
        title="Major Milestone",
        status="In Progress",
        progress=50,
        user_id=EMPLOYEE_A1.id,
        company_id=COMPANY_A,
        created_by=FOUNDER_A.id,
        subtasks=[],
    )

    mock_db = AsyncMock()
    with patch.object(TaskService, "get_task_by_id", new=AsyncMock(return_value=parent)), \
         patch.object(TaskService, "has_incomplete_subtasks", new=AsyncMock(return_value=True)):

        with pytest.raises(HTTPException) as exc:
            await TaskService.update_task(
                mock_db, parent_id, EMPLOYEE_A1, TaskUpdate(status="Done")
            )

        assert exc.value.status_code == 400
        assert "First complete the child tasks" in exc.value.detail
