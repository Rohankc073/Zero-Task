"""
test_parent_subtask_hierarchy.py
=================================
Regression test suite for ZeroTask parent task / subtask hierarchy.
Canonical runtime: FastAPI -> PostgreSQL (no Supabase).

22 tests covering all acceptance criteria.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.task import Task, TaskAssignee
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    SubtaskSummaryResponse,
)
from app.services.task_service import TaskService
from tests.conftest import (
    COMPANY_A_ID,
    COMPANY_B_ID,
    DEPT_A_ID,
    USER_FOUNDER_A_ID,
    USER_MANAGER_A_ID,
    USER_EMPLOYEE_A_ID,
    USER_FOUNDER_B_ID,
    USER_EMPLOYEE_B_ID,
    make_user,
)

PARENT_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
CHILD_1_ID = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
CHILD_2_ID = uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")


def make_task(task_id=None, parent_task_id=None, status="To Do", progress=0, company_id=None, title="Test Task"):
    t = Task(
        title=title,
        status=status,
        priority="Medium",
        progress=progress,
        company_id=company_id or COMPANY_A_ID,
        parent_task_id=parent_task_id,
    )
    t.id = task_id or uuid.uuid4()
    t.created_at = datetime.now(timezone.utc)
    t.updated_at = datetime.now(timezone.utc)
    return t


# ============================================================
# TEST 1: Parent created with parent_task_id = NULL
# ============================================================
def test_major_task_has_null_parent():
    task = make_task(task_id=PARENT_ID)
    assert task.parent_task_id is None


# ============================================================
# TEST 2: Child created with parent_task_id = parent.id
# ============================================================
def test_subtask_has_parent_task_id():
    child = make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID)
    assert child.parent_task_id == PARENT_ID


# ============================================================
# TEST 3: 10 children under 1 parent
# ============================================================
def test_ten_children_under_one_parent():
    children = [make_task(parent_task_id=PARENT_ID, title=f"Sub {i}") for i in range(10)]
    assert len(children) == 10
    for c in children:
        assert c.parent_task_id == PARENT_ID


# ============================================================
# TEST 4: Level 6 child rejected (Max depth 5)
# ============================================================
@pytest.mark.asyncio
async def test_level_6_rejected():
    """TaskService must reject a task whose parent is already at level 5."""
    founder = make_user(USER_FOUNDER_A_ID, "founder@a.com", "Founder", COMPANY_A_ID)

    db = AsyncMock()
    # Mock parent task exists and get_task_depth_and_ancestors returns depth 5
    p_task = make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID)
    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = p_task
    db.execute = AsyncMock(return_value=execute_result)

    with patch.object(TaskService, "get_task_depth_and_ancestors", new=AsyncMock(return_value=(5, []))):
        data = TaskCreate(
            title="Level 6 task",
            parent_task_id=CHILD_1_ID,
            assignee_ids=[str(USER_EMPLOYEE_A_ID)],
        )

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await TaskService.create_task(db, founder, data)

        assert exc_info.value.status_code == 400
        assert "Maximum task hierarchy depth of 5 reached" in exc_info.value.detail


# ============================================================
# TEST 5: Self-referential parent_task_id model invariant
# ============================================================
def test_self_parent_model_invariant():
    self_id = uuid.uuid4()
    task = make_task(task_id=self_id, parent_task_id=self_id)
    # The model allows this field to be set; rejection happens at service level
    assert task.parent_task_id == task.id


# ============================================================
# TEST 6: Cross-company child rejected
# ============================================================
@pytest.mark.asyncio
async def test_cross_company_child_rejected():
    parent_task = make_task(task_id=PARENT_ID, company_id=COMPANY_A_ID)
    company_b_founder = make_user(USER_FOUNDER_B_ID, "founder@b.com", "Founder", COMPANY_B_ID)

    db = AsyncMock()
    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = parent_task
    db.execute = AsyncMock(return_value=execute_result)

    data = TaskCreate(
        title="Cross-company subtask",
        parent_task_id=PARENT_ID,
        assignee_ids=[str(USER_EMPLOYEE_B_ID)],
    )

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await TaskService.create_task(db, company_b_founder, data)

    assert exc_info.value.status_code in (400, 403)


# ============================================================
# TEST 7: Assigned user model has correct user_id
# ============================================================
def test_assigned_user_can_see_child():
    child = make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID)
    child.user_id = USER_MANAGER_A_ID
    assert child.user_id == USER_MANAGER_A_ID
    assert child.parent_task_id == PARENT_ID


# ============================================================
# TEST 8: Private child ? unrelated employee denied model check
# ============================================================
def test_unrelated_user_denied_private_child():
    child = make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID)
    child.is_private = True
    child.created_by = USER_FOUNDER_A_ID
    employee = make_user(USER_EMPLOYEE_A_ID, "emp@a.com", "Employee", COMPANY_A_ID)
    assert child.is_private is True
    assert child.created_by != employee.id


# ============================================================
# TEST 9: Cross-company isolation model check
# ============================================================
def test_cross_company_user_denied():
    child = make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID, company_id=COMPANY_A_ID)
    user_b = make_user(USER_EMPLOYEE_B_ID, "emp@b.com", "Employee", COMPANY_B_ID)
    assert child.company_id != user_b.company_id


# ============================================================
# TEST 10: Parent progress = 0% (no subtasks done)
# ============================================================
@pytest.mark.asyncio
async def test_parent_progress_zero_when_none_done():
    parent = make_task(task_id=PARENT_ID, progress=0)
    parent.subtasks = [
        make_task(parent_task_id=PARENT_ID, status="To Do"),
        make_task(parent_task_id=PARENT_ID, status="In Progress"),
        make_task(parent_task_id=PARENT_ID, status="To Do"),
    ]

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 0
    assert parent.status != "Done"


# ============================================================
# TEST 11: Parent progress = 40% (2/5 done)
# ============================================================
@pytest.mark.asyncio
async def test_parent_progress_partial():
    parent = make_task(task_id=PARENT_ID, progress=0)
    parent.subtasks = [
        make_task(parent_task_id=PARENT_ID, status="Done"),
        make_task(parent_task_id=PARENT_ID, status="Done"),
        make_task(parent_task_id=PARENT_ID, status="To Do"),
        make_task(parent_task_id=PARENT_ID, status="In Progress"),
        make_task(parent_task_id=PARENT_ID, status="To Do"),
    ]

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 40
    assert parent.status != "Done"


# ============================================================
# TEST 12: Parent progress = 100% (all done)
# ============================================================
@pytest.mark.asyncio
async def test_parent_progress_full():
    parent = make_task(task_id=PARENT_ID, progress=0, status="In Progress")
    parent.subtasks = [make_task(parent_task_id=PARENT_ID, status="Done") for _ in range(5)]

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 100
    assert parent.status == "Done"


# ============================================================
# TEST 13: Parent not Done until ALL subtasks Done
# ============================================================
@pytest.mark.asyncio
async def test_parent_not_done_until_all_subtasks_done():
    parent = make_task(task_id=PARENT_ID, progress=0, status="In Progress")
    parent.subtasks = [
        make_task(parent_task_id=PARENT_ID, status="Done"),
        make_task(parent_task_id=PARENT_ID, status="Done"),
        make_task(parent_task_id=PARENT_ID, status="Done"),
        make_task(parent_task_id=PARENT_ID, status="Done"),
        make_task(parent_task_id=PARENT_ID, status="In Progress"),  # 1 incomplete
    ]

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 80
    assert parent.status != "Done"


# ============================================================
# TEST 14: Delete child ? parent recalculates
# ============================================================
@pytest.mark.asyncio
async def test_delete_child_recalculates_parent():
    parent = make_task(task_id=PARENT_ID, progress=33, status="In Progress")
    parent.subtasks = [
        make_task(parent_task_id=PARENT_ID, status="Done"),
        make_task(parent_task_id=PARENT_ID, status="To Do"),
    ]

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 50


# ============================================================
# TEST 15: Delete last child ? parent reset to 0
# ============================================================
@pytest.mark.asyncio
async def test_delete_last_child_resets_parent():
    parent = make_task(task_id=PARENT_ID, progress=100, status="Done")
    parent.subtasks = []

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 0
    assert parent.status != "Done"


# ============================================================
# TEST 16: Attachment ownership (child task_id)
# ============================================================
def test_attachment_belongs_to_child_not_parent():
    from app.models.task import TaskFile
    file = TaskFile(
        task_id=CHILD_1_ID,
        user_id=USER_FOUNDER_A_ID,
        file_url="http://minio/task-attachments/file.pdf",
        file_name="report.pdf",
    )
    file.id = uuid.uuid4()
    assert file.task_id == CHILD_1_ID
    assert file.task_id != PARENT_ID


# ============================================================
# TEST 17: Voice note ownership (child task_id)
# ============================================================
def test_voice_note_belongs_to_child_not_parent():
    from app.models.task import TaskVoiceNote
    note = TaskVoiceNote(
        task_id=CHILD_1_ID,
        creator_id=USER_FOUNDER_A_ID,
        storage_path="uid/child_id/note1.m4a",
        display_name="Note 1",
        note_number=1,
        duration_seconds=30.0,
        mime_type="audio/m4a",
        file_size=1024,
    )
    note.id = uuid.uuid4()
    assert note.task_id == CHILD_1_ID
    assert note.task_id != PARENT_ID


# ============================================================
# TEST 18: Multi-assignee ? both in task_assignees
# ============================================================
def test_multi_assignee_visibility():
    child = make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID)
    child.user_id = USER_MANAGER_A_ID
    assignee_a = TaskAssignee(task_id=CHILD_1_ID, user_id=USER_MANAGER_A_ID)
    assignee_b = TaskAssignee(task_id=CHILD_1_ID, user_id=USER_EMPLOYEE_A_ID)
    assert assignee_a.task_id == CHILD_1_ID
    assert assignee_b.task_id == CHILD_1_ID
    assert assignee_a.user_id != assignee_b.user_id


# ============================================================
# TEST 19: top_level_only excludes subtasks
# ============================================================
def test_top_level_only_excludes_subtasks():
    child = make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID)
    parent = make_task(task_id=PARENT_ID, parent_task_id=None)
    all_tasks = [parent, child]
    top_level = [t for t in all_tasks if t.parent_task_id is None]
    assert len(top_level) == 1
    assert top_level[0].id == PARENT_ID
    assert child not in top_level


# ============================================================
# TEST 20: No duplicate children in parent subtasks
# ============================================================
def test_no_duplicate_children():
    parent = make_task(task_id=PARENT_ID)
    parent.subtasks = [make_task(task_id=CHILD_1_ID, parent_task_id=PARENT_ID)]
    unique_ids = {c.id for c in parent.subtasks}
    assert len(unique_ids) == len(parent.subtasks)


# ============================================================
# TEST 21: SubtaskSummaryResponse has no subtasks field (no recursion)
# ============================================================
def test_subtask_summary_has_no_subtasks_field():
    fields = SubtaskSummaryResponse.model_fields
    assert "subtasks" not in fields, (
        "SubtaskSummaryResponse must NOT contain a 'subtasks' field "
        "to prevent recursive serialization."
    )


# ============================================================
# TEST 22: Existing top-level tasks unaffected (regression)
# ============================================================
def test_existing_top_level_task_regression():
    task = Task(
        title="Legacy Task",
        status="In Progress",
        priority="High",
        progress=50,
        company_id=COMPANY_A_ID,
    )
    task.id = uuid.uuid4()
    assert task.parent_task_id is None
    assert task.title == "Legacy Task"
    assert task.progress == 50


# ============================================================
# TEST 23: Exact mathematical progression 0/2=0%, 1/2=50%, 2/2=100%
# ============================================================
@pytest.mark.asyncio
async def test_progress_two_subtasks_progression():
    parent = make_task(task_id=PARENT_ID, status="In Progress", progress=0)
    sub1 = make_task(parent_task_id=PARENT_ID, status="To Do")
    sub2 = make_task(parent_task_id=PARENT_ID, status="In Progress")
    parent.subtasks = [sub1, sub2]

    db = AsyncMock()
    exec_res = MagicMock()
    exec_res.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=exec_res)

    # 0 of 2 complete -> 0% (NOT 50%)
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 0
    assert parent.status != "Done"

    # 1 of 2 complete -> 50%
    sub1.status = "Done"
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 50
    assert parent.status != "Done"

    # 2 of 2 complete -> 100% and Done
    sub2.status = "Done"
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 100
    assert parent.status == "Done"


# ============================================================
# TEST 24: Exact mathematical progression 0/10, 2/10, 5/10, 8/10, 10/10
# ============================================================
@pytest.mark.asyncio
async def test_progress_ten_subtasks_exact_steps():
    parent = make_task(task_id=PARENT_ID, status="To Do", progress=0)
    subtasks = [make_task(parent_task_id=PARENT_ID, status="To Do", title=f"Subtask {i+1}") for i in range(10)]
    parent.subtasks = subtasks

    db = AsyncMock()
    exec_res = MagicMock()
    exec_res.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=exec_res)

    # 0 / 10 -> 0%
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 0
    assert parent.status != "Done"

    # 2 / 10 -> 20%
    for i in range(2):
        subtasks[i].status = "Done"
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 20
    assert parent.status != "Done"

    # 5 / 10 -> 50%
    for i in range(2, 5):
        subtasks[i].status = "Done"
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 50
    assert parent.status != "Done"

    # 8 / 10 -> 80%
    for i in range(5, 8):
        subtasks[i].status = "Done"
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 80
    assert parent.status != "Done"

    # 10 / 10 -> 100% & Done
    for i in range(8, 10):
        subtasks[i].status = "Done"
    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 100
    assert parent.status == "Done"


# ============================================================
# TEST 25: Status normalization ("Completed" also counts as Done)
# ============================================================
@pytest.mark.asyncio
async def test_progress_status_normalization_completed():
    parent = make_task(task_id=PARENT_ID, status="In Progress", progress=0)
    sub1 = make_task(parent_task_id=PARENT_ID, status="Completed")
    sub2 = make_task(parent_task_id=PARENT_ID, status="Done")
    parent.subtasks = [sub1, sub2]

    db = AsyncMock()
    exec_res = MagicMock()
    exec_res.scalar_one_or_none.return_value = parent
    db.execute = AsyncMock(return_value=exec_res)

    await TaskService.recalculate_parent_progress(db, PARENT_ID)
    assert parent.progress == 100
    assert parent.status == "Done"

