"""
test_task_hierarchy_explorer.py
================================
Authoritative regression and unit tests for VS Code / File Explorer Task Hierarchy.
Max depth: 5
FastAPI -> PostgreSQL canonical runtime.
"""
import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, SubtaskSummaryResponse
from app.services.task_service import TaskService
from tests.conftest import (
    COMPANY_A_ID,
    COMPANY_B_ID,
    USER_FOUNDER_A_ID,
    USER_MANAGER_A_ID,
    USER_EMPLOYEE_A_ID,
    USER_FOUNDER_B_ID,
    make_user,
)

ROOT_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
CHILD_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
CHILD_N_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
CHILD_O_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")
CHILD_P_ID = uuid.UUID("55555555-5555-5555-5555-555555555555")


def make_task_node(task_id, parent_task_id=None, title="Task", company_id=COMPANY_A_ID, status="To Do", progress=0):
    t = Task(
        title=title,
        status=status,
        priority="Medium",
        progress=progress,
        company_id=company_id,
        parent_task_id=parent_task_id,
    )
    t.id = task_id
    t.created_at = datetime.now(timezone.utc)
    t.updated_at = datetime.now(timezone.utc)
    t.subtasks = []
    return t


# ============================================================
# 1. Root task depth = 1
# ============================================================
@pytest.mark.asyncio
async def test_root_task_depth_is_1():
    db = AsyncMock()
    # When root task has no parent, query returns None
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    depth, ancestors = await TaskService.get_task_depth_and_ancestors(db, ROOT_A_ID)
    assert depth == 1
    assert len(ancestors) == 0


# ============================================================
# 2. Child depth = 2
# ============================================================
@pytest.mark.asyncio
async def test_child_depth_is_2():
    db = AsyncMock()

    # Query 1: child B's parent_task_id -> ROOT_A_ID
    # Query 2: parent A's details -> ROOT_A_ID, "Root A", None
    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = ROOT_A_ID

    row_a = MagicMock()
    row_a.id = ROOT_A_ID
    row_a.title = "Root A"
    row_a.parent_task_id = None
    res2 = MagicMock()
    res2.first.return_value = row_a

    db.execute = AsyncMock(side_effect=[res1, res2])

    depth, ancestors = await TaskService.get_task_depth_and_ancestors(db, CHILD_B_ID)
    assert depth == 2
    assert len(ancestors) == 1
    assert ancestors[0]["id"] == ROOT_A_ID
    assert ancestors[0]["depth"] == 1


# ============================================================
# 3. Grandchild depth = 3
# ============================================================
@pytest.mark.asyncio
async def test_grandchild_depth_is_3():
    db = AsyncMock()

    res_parent = MagicMock()
    res_parent.scalar_one_or_none.return_value = CHILD_B_ID

    row_b = MagicMock()
    row_b.id = CHILD_B_ID
    row_b.title = "Child B"
    row_b.parent_task_id = ROOT_A_ID
    res_b = MagicMock()
    res_b.first.return_value = row_b

    row_a = MagicMock()
    row_a.id = ROOT_A_ID
    row_a.title = "Root A"
    row_a.parent_task_id = None
    res_a = MagicMock()
    res_a.first.return_value = row_a

    db.execute = AsyncMock(side_effect=[res_parent, res_b, res_a])

    depth, ancestors = await TaskService.get_task_depth_and_ancestors(db, CHILD_N_ID)
    assert depth == 3
    assert len(ancestors) == 2
    assert ancestors[0]["id"] == ROOT_A_ID
    assert ancestors[0]["depth"] == 1
    assert ancestors[1]["id"] == CHILD_B_ID
    assert ancestors[1]["depth"] == 2


# ============================================================
# 4. Level 4 valid
# ============================================================
@pytest.mark.asyncio
async def test_level_4_creation_valid():
    """Creating child O under level 3 parent N is valid (child depth = 4)."""
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    parent_n = make_task_node(CHILD_N_ID, parent_task_id=CHILD_B_ID, title="Task N")

    db = AsyncMock()
    exec_res = MagicMock()
    exec_res.scalar_one_or_none.return_value = parent_n
    db.execute = AsyncMock(return_value=exec_res)

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(3, []))), \
         patch.object(TaskService, "can_assign", new=AsyncMock(return_value=True)):
        data = TaskCreate(title="Task O", parent_task_id=CHILD_N_ID, assignee_ids=[str(USER_EMPLOYEE_A_ID)])
        task = await TaskService.create_task(db, founder, data)
        assert task.parent_task_id == CHILD_N_ID


# ============================================================
# 5. Level 5 valid
# ============================================================
@pytest.mark.asyncio
async def test_level_5_creation_valid():
    """Creating child P under level 4 parent O is valid (child depth = 5)."""
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    parent_o = make_task_node(CHILD_O_ID, parent_task_id=CHILD_N_ID, title="Task O")

    db = AsyncMock()
    exec_res = MagicMock()
    exec_res.scalar_one_or_none.return_value = parent_o
    db.execute = AsyncMock(return_value=exec_res)

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(4, []))), \
         patch.object(TaskService, "can_assign", new=AsyncMock(return_value=True)):
        data = TaskCreate(title="Task P", parent_task_id=CHILD_O_ID, assignee_ids=[str(USER_EMPLOYEE_A_ID)])
        task = await TaskService.create_task(db, founder, data)
        assert task.parent_task_id == CHILD_O_ID


# ============================================================
# 6. Level 6 rejected
# ============================================================
@pytest.mark.asyncio
async def test_level_6_creation_rejected():
    """Attempting to create a child under level 5 parent P must be rejected with HTTP 400."""
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    parent_p = make_task_node(CHILD_P_ID, parent_task_id=CHILD_O_ID, title="Task P")

    db = AsyncMock()
    exec_res = MagicMock()
    exec_res.scalar_one_or_none.return_value = parent_p
    db.execute = AsyncMock(return_value=exec_res)

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(5, []))):
        data = TaskCreate(title="Task Q", parent_task_id=CHILD_P_ID, assignee_ids=[str(USER_EMPLOYEE_A_ID)])
        with pytest.raises(HTTPException) as exc_info:
            await TaskService.create_task(db, founder, data)

        assert exc_info.value.status_code == 400
        assert "Maximum task hierarchy depth of 5 reached" in exc_info.value.detail


# ============================================================
# 7. Cross-company parent rejected
# ============================================================
@pytest.mark.asyncio
async def test_cross_company_parent_rejected():
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)
    company_b_parent = make_task_node(ROOT_A_ID, company_id=COMPANY_B_ID)

    db = AsyncMock()
    exec_res = MagicMock()
    exec_res.scalar_one_or_none.return_value = company_b_parent
    db.execute = AsyncMock(return_value=exec_res)

    data = TaskCreate(title="Child Task", parent_task_id=ROOT_A_ID, assignee_ids=[str(USER_EMPLOYEE_A_ID)])
    with pytest.raises(HTTPException) as exc_info:
        await TaskService.create_task(db, founder, data)

    assert exc_info.value.status_code == 403
    assert "Cross-company parent task assignment forbidden" in exc_info.value.detail


# ============================================================
# 8. Circular hierarchy rejected
# ============================================================
@pytest.mark.asyncio
async def test_circular_hierarchy_rejected():
    """Circular parent references in get_task_depth_and_ancestors raise HTTP 400."""
    db = AsyncMock()

    # Node 1 points to Node 2, Node 2 points back to Node 1
    node1_id = uuid.uuid4()
    node2_id = uuid.uuid4()

    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = node2_id

    row2 = MagicMock()
    row2.id = node2_id
    row2.title = "Node 2"
    row2.parent_task_id = node1_id
    res2 = MagicMock()
    res2.first.return_value = row2

    db.execute = AsyncMock(side_effect=[res1, res2])

    with pytest.raises(HTTPException) as exc_info:
        await TaskService.get_task_depth_and_ancestors(db, node1_id)

    assert exc_info.value.status_code == 400
    assert "Circular hierarchy detected" in exc_info.value.detail


# ============================================================
# 9. Direct children query returns only direct children metadata
# ============================================================
@pytest.mark.asyncio
async def test_direct_children_metadata_populated():
    """get_task_by_id enriches direct children with depth, child_count, and has_children."""
    parent = make_task_node(ROOT_A_ID, title="Parent A")
    child_b = make_task_node(CHILD_B_ID, parent_task_id=ROOT_A_ID, title="Child B")
    parent.subtasks = [child_b]

    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)

    db = AsyncMock()
    task_res = MagicMock()
    task_res.scalar_one_or_none.return_value = parent

    counts_res = MagicMock()
    # Child B has 3 children
    counts_res.all.return_value = [(CHILD_B_ID, 3)]

    db.execute = AsyncMock(side_effect=[task_res, counts_res])

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(1, []))):
        result = await TaskService.get_task_by_id(db, ROOT_A_ID, founder)

        assert result.depth == 1
        assert result.child_count == 1
        assert result.has_children is True
        assert len(result.subtasks) == 1

        b_subtask = result.subtasks[0]
        assert b_subtask.depth == 2
        assert b_subtask.child_count == 3
        assert b_subtask.has_children is True


# ============================================================
# 10. Parent progress remains mathematically consistent
# ============================================================
@pytest.mark.asyncio
async def test_parent_progress_propagation():
    """Updating subtask status recalculates parent progress mathematically."""
    parent = make_task_node(ROOT_A_ID, title="Parent A")
    sub1 = make_task_node(CHILD_B_ID, parent_task_id=ROOT_A_ID, status="Done")
    sub2 = make_task_node(uuid.uuid4(), parent_task_id=ROOT_A_ID, status="To Do")
    parent.subtasks = [sub1, sub2]

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=res)

    await TaskService.recalculate_parent_progress(db, ROOT_A_ID)

    # 1 of 2 completed = 50%
    assert parent.progress == 50
    assert parent.status != "Done"


# ============================================================
# 11. Last child deletion resets parent progress
# ============================================================
@pytest.mark.asyncio
async def test_last_child_deletion_resets_parent():
    parent = make_task_node(ROOT_A_ID, title="Parent A", status="Done", progress=100)
    parent.subtasks = []  # 0 subtasks remaining

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=res)

    await TaskService.recalculate_parent_progress(db, ROOT_A_ID)

    assert parent.progress == 0
    assert parent.status == "In Progress"
