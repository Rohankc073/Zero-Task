import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
from app.models.user import User, UserPushToken
from app.models.task import Task, TaskAssignee, TaskFile, TaskVoiceNote
from app.models.company import Company
from app.models.misc import AuditLog
from app.services.push_service import PushNotificationService, push_service
from app.services.task_service import TaskService, task_service
from app.services.chat_service import ChatService, chat_service
from app.schemas.task import TaskCreate, SubtaskCreateItem

COMPANY_A_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
COMPANY_B_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
DEPT_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEPT_A2_ID = uuid.UUID("11111111-2222-1111-1111-111111111111")
DEPT_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")

USER_SUPERADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")
USER_FOUNDER_A_ID = uuid.UUID("aaaaaaaa-0001-0000-0000-000000000000")
USER_DH_A_ID = uuid.UUID("aaaaaaaa-0002-0000-0000-000000000000")
USER_MANAGER_A_ID = uuid.UUID("aaaaaaaa-0003-0000-0000-000000000000")
USER_EMPLOYEE_A1_ID = uuid.UUID("aaaaaaaa-0004-0000-0000-000000000000")
USER_EMPLOYEE_A2_ID = uuid.UUID("aaaaaaaa-0005-0000-0000-000000000000")

USER_FOUNDER_B_ID = uuid.UUID("bbbbbbbb-0001-0000-0000-000000000000")
USER_EMPLOYEE_B_ID = uuid.UUID("bbbbbbbb-0002-0000-0000-000000000000")


def create_mock_user(uid, email, role, company_id=None, dept_id=None):
    return User(
        id=uid,
        email=email,
        full_name=email.split("@")[0].capitalize(),
        role=role,
        company_id=company_id,
        department_id=dept_id,
        is_active=True,
        is_approved=True,
        is_deleted=False,
    )


# ==============================================================================
# 1. PUSH NOTIFICATION SERVICE UNIT TESTS
# ==============================================================================

def test_push_token_validation():
    assert PushNotificationService.is_valid_expo_token("ExponentPushToken[xxxxxxxx]") is True
    assert PushNotificationService.is_valid_expo_token("ExpoPushToken[yyyyyyyy]") is True
    assert PushNotificationService.is_valid_expo_token("  ExpoPushToken[zzzzzz]  ") is True
    assert PushNotificationService.is_valid_expo_token("invalid_token") is False
    assert PushNotificationService.is_valid_expo_token("") is False
    assert PushNotificationService.is_valid_expo_token(None) is False


@pytest.mark.asyncio
async def test_push_payload_formatting():
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(
            json=lambda: {"data": [{"status": "ok"}]}
        )

        tokens = ["ExponentPushToken[aaa]", "ExpoPushToken[bbb]"]
        res = await PushNotificationService.send_push_notification(
            tokens=tokens,
            title="Task Assigned",
            body="You have a new task",
            data={"task_id": "123", "url": "/tasks"},
        )

        assert res["sent"] == 2
        mock_post.assert_called_once()
        sent_messages = mock_post.call_args[1]["json"]
        assert len(sent_messages) == 2
        for msg in sent_messages:
            assert msg["channelId"] == "default"
            assert msg["priority"] == "high"
            assert msg["sound"] == "default"
            assert msg["_displayInForeground"] is True
            assert msg["title"] == "Task Assigned"
            assert msg["body"] == "You have a new task"


@pytest.mark.asyncio
async def test_push_dead_token_purging():
    mock_db = AsyncMock()
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(
            json=lambda: {
                "data": [
                    {"status": "ok"},
                    {"status": "error", "details": {"error": "DeviceNotRegistered"}},
                ]
            }
        )

        tokens = ["ExponentPushToken[alive]", "ExpoPushToken[dead]"]
        res = await PushNotificationService.send_push_notification(
            tokens=tokens,
            title="Alert",
            body="System alert",
            db=mock_db,
        )

        assert res["sent"] == 2
        assert res["dead_tokens_purged"] == 1
        mock_db.execute.assert_called_once()
        mock_db.commit.assert_called_once()


# ==============================================================================
# 2. TASK DELETION AUTHORIZATION HIERARCHY MATRIX
# ==============================================================================

def test_task_deletion_hierarchy_matrix():
    superadmin = create_mock_user(USER_SUPERADMIN_ID, "superadmin@zerotask.internal", "Super Admin")
    founder_a = create_mock_user(USER_FOUNDER_A_ID, "founder.a@acme.com", "Founder", COMPANY_A_ID, DEPT_A_ID)
    dh_a = create_mock_user(USER_DH_A_ID, "dh.a@acme.com", "Department Head", COMPANY_A_ID, DEPT_A_ID)
    mgr_a = create_mock_user(USER_MANAGER_A_ID, "mgr.a@acme.com", "Manager", COMPANY_A_ID, DEPT_A_ID)
    emp_a1 = create_mock_user(USER_EMPLOYEE_A1_ID, "emp1@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID)
    emp_a2 = create_mock_user(USER_EMPLOYEE_A2_ID, "emp2@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID)

    founder_b = create_mock_user(USER_FOUNDER_B_ID, "founder.b@beta.com", "Founder", COMPANY_B_ID, DEPT_B_ID)
    emp_b = create_mock_user(USER_EMPLOYEE_B_ID, "emp.b@beta.com", "Employee", COMPANY_B_ID, DEPT_B_ID)

    # 1. Tasks created by various users
    task_founder_a = Task(id=uuid.uuid4(), title="Founder Task", company_id=COMPANY_A_ID, department_id=DEPT_A_ID, created_by=USER_FOUNDER_A_ID)
    task_dh_a = Task(id=uuid.uuid4(), title="DH Task", company_id=COMPANY_A_ID, department_id=DEPT_A_ID, created_by=USER_DH_A_ID)
    task_mgr_a = Task(id=uuid.uuid4(), title="Manager Task", company_id=COMPANY_A_ID, department_id=DEPT_A_ID, created_by=USER_MANAGER_A_ID)
    task_emp_a1 = Task(id=uuid.uuid4(), title="Emp 1 Task", company_id=COMPANY_A_ID, department_id=DEPT_A_ID, created_by=USER_EMPLOYEE_A1_ID)
    task_company_b = Task(id=uuid.uuid4(), title="Beta Task", company_id=COMPANY_B_ID, department_id=DEPT_B_ID, created_by=USER_FOUNDER_B_ID)

    # SUPER ADMIN: Universal operational delete authority across all companies and creators
    assert TaskService.can_delete_task(task_founder_a, superadmin) is True
    assert TaskService.can_delete_task(task_dh_a, superadmin) is True
    assert TaskService.can_delete_task(task_mgr_a, superadmin) is True
    assert TaskService.can_delete_task(task_emp_a1, superadmin) is True
    assert TaskService.can_delete_task(task_company_b, superadmin) is True

    # FOUNDER: Full company delete authority; blocked on other company
    assert TaskService.can_delete_task(task_founder_a, founder_a) is True
    assert TaskService.can_delete_task(task_dh_a, founder_a) is True
    assert TaskService.can_delete_task(task_mgr_a, founder_a) is True
    assert TaskService.can_delete_task(task_emp_a1, founder_a) is True
    assert TaskService.can_delete_task(task_company_b, founder_a) is False  # Cross-company blocked

    # DEPARTMENT HEAD: Can delete tasks in own department or created by self
    assert TaskService.can_delete_task(task_dh_a, dh_a) is True
    assert TaskService.can_delete_task(task_mgr_a, dh_a) is True
    assert TaskService.can_delete_task(task_emp_a1, dh_a) is True
    assert TaskService.can_delete_task(task_company_b, dh_a) is False  # Cross-company blocked

    # MANAGER: Can delete tasks in own team/dept or created by self
    assert TaskService.can_delete_task(task_mgr_a, mgr_a) is True
    assert TaskService.can_delete_task(task_emp_a1, mgr_a) is True
    assert TaskService.can_delete_task(task_company_b, mgr_a) is False

    # EMPLOYEE: Can ONLY delete tasks/subtasks they created
    assert TaskService.can_delete_task(task_emp_a1, emp_a1) is True  # Creator allowed
    assert TaskService.can_delete_task(task_emp_a1, emp_a2) is False  # Other employee rejected
    assert TaskService.can_delete_task(task_mgr_a, emp_a1) is False   # Superior task rejected
    assert TaskService.can_delete_task(task_founder_a, emp_a1) is False
    assert TaskService.can_delete_task(task_company_b, emp_a1) is False


# ==============================================================================
# 3. PARENT PROGRESS RECALCULATION ON SUBTASK DELETION
# ==============================================================================

@pytest.mark.asyncio
async def test_parent_progress_recalculation():
    parent_id = uuid.uuid4()
    parent = Task(id=parent_id, title="Parent Task", progress=0, status="In Progress")

    # 4 subtasks: 2 Done, 2 To Do -> 50%
    sub1 = Task(id=uuid.uuid4(), parent_task_id=parent_id, status="Done", progress=100)
    sub2 = Task(id=uuid.uuid4(), parent_task_id=parent_id, status="Done", progress=100)
    sub3 = Task(id=uuid.uuid4(), parent_task_id=parent_id, status="To Do", progress=0)
    sub4 = Task(id=uuid.uuid4(), parent_task_id=parent_id, status="To Do", progress=0)
    parent.subtasks = [sub1, sub2, sub3, sub4]

    mock_db = AsyncMock()
    mock_db.execute.return_value = MagicMock(scalar_one_or_none=lambda: parent)

    # Recalculate with 4 subtasks (2 done)
    await TaskService.recalculate_parent_progress(mock_db, parent_id)
    assert parent.progress == 50
    assert parent.status == "In Progress"

    # Simulate deleting one incomplete subtask: 3 subtasks (2 done) -> 66%
    parent.subtasks = [sub1, sub2, sub3]
    await TaskService.recalculate_parent_progress(mock_db, parent_id)
    assert parent.progress == 66

    # Simulate completing all remaining subtasks: 3 subtasks (3 done) -> 100%, Done
    sub3.status = "Done"
    await TaskService.recalculate_parent_progress(mock_db, parent_id)
    assert parent.progress == 100
    assert parent.status == "Done"

    # Simulate deleting ALL subtasks -> reset to 0, status In Progress
    parent.subtasks = []
    await TaskService.recalculate_parent_progress(mock_db, parent_id)
    assert parent.progress == 0
    assert parent.status == "In Progress"


# ==============================================================================
# 4. TASK DELETION SERVICE WORKFLOW (STORAGE CLEANUP + AUDIT LOG + REALTIME)
# ==============================================================================

@pytest.mark.asyncio
async def test_task_delete_service_flow():
    founder = create_mock_user(USER_FOUNDER_A_ID, "founder.a@acme.com", "Founder", COMPANY_A_ID, DEPT_A_ID)
    task_id = uuid.uuid4()
    parent_id = uuid.uuid4()
    
    mock_task = Task(
        id=task_id,
        title="Subtask to Delete",
        company_id=COMPANY_A_ID,
        department_id=DEPT_A_ID,
        created_by=USER_FOUNDER_A_ID,
        parent_task_id=parent_id,
    )
    mock_task.subtasks = []

    mock_db = AsyncMock()
    # 1st execute: select Task, 2nd execute: select TaskFile, 3rd execute: select TaskVoiceNote, 4th: delete Task
    mock_db.execute.side_effect = [
        MagicMock(scalar_one_or_none=lambda: mock_task),
        MagicMock(scalars=lambda: MagicMock(all=lambda: [TaskFile(task_id=task_id, storage_path="task_files/doc.pdf")])),
        MagicMock(scalars=lambda: MagicMock(all=lambda: [TaskVoiceNote(task_id=task_id, storage_path="audio/note.m4a")])),
        MagicMock(), # delete Task
        MagicMock(scalar_one_or_none=lambda: Task(id=parent_id, title="Parent", subtasks=[])), # recalculate parent
    ]

    with patch("app.services.storage_service.storage_service.delete_objects") as mock_storage_del, \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_company", new_callable=AsyncMock) as mock_broadcast:

        res = await TaskService.delete_task(mock_db, task_id, founder)

        assert res["status"] == "success"
        assert res["task_id"] == str(task_id)
        assert res["parent_task_id"] == str(parent_id)

        # Storage cleanup verified
        assert mock_storage_del.call_count == 2
        # Realtime broadcast verified
        mock_broadcast.assert_called_once()
        # DB commit called
        mock_db.commit.assert_called_once()
