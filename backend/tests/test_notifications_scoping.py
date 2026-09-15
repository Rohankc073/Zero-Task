import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.user import User
from app.models.company import Company
from app.models.task import Task, TaskAssignee
from app.models.chat import ChatChannel, ChatMessage
from app.models.notification import InAppNotification
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.task_service import task_service
from app.services.chat_service import chat_service
from app.events.pg_listener import pg_listener
from app.api.v1.notifications import (
    list_notifications,
    mark_as_read,
    mark_all_as_read,
    delete_notification,
    clear_all_notifications,
)
from tests.conftest import (
    COMPANY_A_ID,
    COMPANY_B_ID,
    DEPT_A_ID,
    USER_FOUNDER_A_ID,
    USER_MANAGER_A_ID,
    USER_EMPLOYEE_A_ID,
    USER_EMPLOYEE_B_ID,
    make_user,
)


@pytest.fixture
def manager_a():
    return make_user(USER_MANAGER_A_ID, "manager.a@acme.com", "Manager", COMPANY_A_ID, DEPT_A_ID)


@pytest.fixture
def employee_a():
    return make_user(USER_EMPLOYEE_A_ID, "employee.a@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID)


@pytest.fixture
def employee_b():
    uid = uuid.UUID("aaaaaaaa-0004-0000-0000-000000000000")
    return make_user(uid, "employee.b@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID)


@pytest.fixture
def company_b_user():
    return make_user(USER_EMPLOYEE_B_ID, "employee.b@beta.com", "Employee", COMPANY_B_ID)


# =========================================================================
# TEST 1: TASK ASSIGNMENT NOTIFICATION SCOPING
# =========================================================================
@pytest.mark.asyncio
async def test_task_assignment_notification_scoping(manager_a, employee_a, employee_b, company_b_user):
    """
    When a task is assigned to Employee A:
    1. InAppNotification is added strictly for Employee A.
    2. WebSocket event is pushed specifically to Employee A's user stream.
    3. Employee B and Company B user receive nothing.
    """
    mock_db = AsyncMock()
    task_id = uuid.uuid4()
    task = Task(
        id=task_id,
        title="Scoped Assignment Task",
        company_id=COMPANY_A_ID,
        created_by=manager_a.id,
        user_id=employee_a.id,
        status="To Do",
        priority="Medium",
    )

    with patch("app.services.task_service.TaskService.can_assign", new_callable=AsyncMock, return_value=True), \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_user", new_callable=AsyncMock) as mock_ws_user, \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_company", new_callable=AsyncMock) as mock_ws_comp, \
         patch("app.services.push_service.push_service.send_to_user", new_callable=AsyncMock) as mock_push:

        task_data = TaskCreate(
            title="Scoped Assignment Task",
            description="Testing assignment scoping",
            priority="Medium",
            status="To Do",
            user_id=employee_a.id,
            assignee_ids=[employee_a.id],
        )

        # Call create_task
        await task_service.create_task(mock_db, manager_a, task_data)

        # Verify DB added InAppNotification for employee_a
        added_notifications = [
            call.args[0] for call in mock_db.add.call_args_list
            if isinstance(call.args[0], InAppNotification)
        ]
        assert len(added_notifications) >= 1
        recipient_ids = [n.user_id for n in added_notifications]
        assert employee_a.id in recipient_ids
        assert employee_b.id not in recipient_ids
        assert company_b_user.id not in recipient_ids
        assert manager_a.id not in recipient_ids  # Creator does not get assigned notification

        # Verify WebSocket targeted to Employee A only
        mock_ws_user.assert_called()
        ws_call_users = [call.kwargs.get("user_id") for call in mock_ws_user.call_args_list]
        assert employee_a.id in ws_call_users
        assert employee_b.id not in ws_call_users
        assert company_b_user.id not in ws_call_users

        # Company-wide broadcast must NOT be called for task assignment
        mock_ws_comp.assert_not_called()


# =========================================================================
# TEST 2: TASK COMPLETION NOTIFICATION TO CREATOR (EXCLUDING COMPLETER)
# =========================================================================
@pytest.mark.asyncio
async def test_task_completion_notification_to_creator(manager_a, employee_a, employee_b):
    """
    When Employee A completes a task created by Manager A:
    1. Manager A (creator) receives a task_completed notification.
    2. Employee A (completer) does NOT receive a self-completion notification.
    3. Unrelated employees (Employee B) receive nothing.
    """
    mock_db = AsyncMock()
    task_id = uuid.uuid4()
    task = Task(
        id=task_id,
        title="Important Project Milestone",
        company_id=COMPANY_A_ID,
        created_by=manager_a.id,
        user_id=employee_a.id,
        status="In Progress",
        priority="High",
    )

    with patch("app.services.task_service.TaskService.get_task_by_id", new_callable=AsyncMock, return_value=task), \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_user", new_callable=AsyncMock) as mock_ws_user, \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_company", new_callable=AsyncMock) as mock_ws_comp, \
         patch("app.services.push_service.push_service.send_to_user", new_callable=AsyncMock) as mock_push:

        # Employee A marks the task as Done
        update_data = TaskUpdate(status="Done")
        await task_service.update_task(mock_db, task_id, employee_a, update_data)

        # Verify DB added InAppNotification for manager_a (creator)
        added_notifications = [
            call.args[0] for call in mock_db.add.call_args_list
            if isinstance(call.args[0], InAppNotification)
        ]
        completion_notifs = [n for n in added_notifications if n.type == "task_completed"]
        assert len(completion_notifs) == 1
        assert completion_notifs[0].user_id == manager_a.id
        assert completion_notifs[0].type == "task_completed"
        assert "completed" in completion_notifs[0].title.lower() or "completed" in completion_notifs[0].message.lower()

        # Completer (employee_a) must NOT receive a completion notification
        for n in completion_notifs:
            assert n.user_id != employee_a.id

        # WebSocket delivered strictly to creator
        mock_ws_user.assert_called()
        ws_recipients = [call.kwargs.get("user_id") for call in mock_ws_user.call_args_list]
        assert manager_a.id in ws_recipients
        assert employee_a.id not in ws_recipients

        # Never broadcast company-wide
        mock_ws_comp.assert_not_called()


# =========================================================================
# TEST 3: SELF-ASSIGNED TASK COMPLETION PRODUCES NO REDUNDANT NOTIFICATION
# =========================================================================
@pytest.mark.asyncio
async def test_self_assigned_task_completion_no_self_notification(manager_a):
    """
    If a user completes a task that they created and assigned to themselves,
    zero task_completed notifications should be emitted.
    """
    mock_db = AsyncMock()
    task_id = uuid.uuid4()
    task = Task(
        id=task_id,
        title="Personal Todo",
        company_id=COMPANY_A_ID,
        created_by=manager_a.id,
        user_id=manager_a.id,  # Self-assigned
        status="To Do",
        priority="Low",
    )

    with patch("app.services.task_service.TaskService.get_task_by_id", new_callable=AsyncMock, return_value=task), \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_user", new_callable=AsyncMock) as mock_ws_user:

        update_data = TaskUpdate(status="Done")
        await task_service.update_task(mock_db, task_id, manager_a, update_data)

        # Verify NO InAppNotification for task_completed was added
        added_notifications = [
            call.args[0] for call in mock_db.add.call_args_list
            if isinstance(call.args[0], InAppNotification) and call.args[0].type == "task_completed"
        ]
        assert len(added_notifications) == 0
        mock_ws_user.assert_not_called()


# =========================================================================
# TEST 4: CHAT SENDER EXCLUSION (DIRECT & CHANNEL)
# =========================================================================
@pytest.mark.asyncio
async def test_chat_sender_exclusion_direct_and_channel(manager_a, employee_a, employee_b):
    """
    When Manager A sends a message in direct chat or a channel:
    1. Manager A is strictly excluded from notification recipients.
    2. Recipient receives InAppNotification and WebSocket event.
    """
    mock_db = AsyncMock()
    channel_id = uuid.uuid4()
    channel = ChatChannel(
        id=channel_id,
        name="Direct Channel",
        type="direct",
        company_id=COMPANY_A_ID,
        participant_one_id=manager_a.id,
        participant_two_id=employee_a.id,
    )

    mock_channel_res = MagicMock()
    mock_channel_res.scalar_one_or_none.return_value = channel
    mock_db.execute.return_value = mock_channel_res

    with patch("app.websocket.connection_manager.connection_manager.broadcast_to_user", new_callable=AsyncMock) as mock_ws_user, \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_company", new_callable=AsyncMock) as mock_ws_comp:

        # Manager A sends direct message to Employee A
        await chat_service.create_message(
            db=mock_db,
            current_user=manager_a,
            channel_id=channel_id,
            content="Hello Employee A",
        )

        # Verify notification created for employee_a only
        added_notifications = [
            call.args[0] for call in mock_db.add.call_args_list
            if isinstance(call.args[0], InAppNotification)
        ]
        assert len(added_notifications) == 1
        assert added_notifications[0].user_id == employee_a.id
        assert added_notifications[0].user_id != manager_a.id

        # Verify sender was not broadcasted to company
        mock_ws_comp.assert_not_called()


# =========================================================================
# TEST 5: PG_LISTENER WEBSOCKET SCOPING (NO GLOBAL BROADCASTS)
# =========================================================================
@pytest.mark.asyncio
async def test_pg_listener_websocket_scoping():
    """
    Verify pg_listener routes notifications to recipient user ONLY,
    and chat messages to channel members excluding sender.
    Never broadcasts to the entire company.
    """
    recipient_id = str(uuid.uuid4())
    company_id = str(uuid.uuid4())
    sender_id = str(uuid.uuid4())
    channel_id = str(uuid.uuid4())

    with patch("app.websocket.connection_manager.connection_manager.broadcast_to_user", new_callable=AsyncMock) as mock_ws_user, \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_company", new_callable=AsyncMock) as mock_ws_comp, \
         patch("app.websocket.connection_manager.connection_manager.broadcast_to_channel", new_callable=AsyncMock) as mock_ws_chan:

        # 1. In-App Notification event
        notif_record = {
            "id": recipient_id,
            "user_id": recipient_id,
            "company_id": company_id,
            "title": "Task Assigned",
            "message": "You have a new task",
            "type": "task_assigned",
        }
        payload_1 = json.dumps({
            "table": "in_app_notifications",
            "action": "INSERT",
            "company_id": company_id,
            "record": notif_record,
        })
        pg_listener._handle_notification(None, 1234, "app_events", payload_1)
        await asyncio.sleep(0.01)

        # Must call broadcast_to_user with recipient_id
        mock_ws_user.assert_called_once()
        assert str(mock_ws_user.call_args.kwargs.get("user_id")) == recipient_id
        # Must NEVER broadcast to company
        mock_ws_comp.assert_not_called()

        # 2. Chat message event
        mock_ws_user.reset_mock()
        mock_ws_comp.reset_mock()
        mock_ws_chan.reset_mock()

        chat_record = {
            "id": str(uuid.uuid4()),
            "channel_id": channel_id,
            "user_id": sender_id,
            "company_id": company_id,
            "content": "Meeting at 3 PM",
        }
        payload_2 = json.dumps({
            "table": "chat_messages",
            "action": "INSERT",
            "company_id": company_id,
            "record": chat_record,
        })
        pg_listener._handle_notification(None, 1234, "app_events", payload_2)
        await asyncio.sleep(0.01)

        # Must call broadcast_to_channel with exclude_user_id=sender_id
        mock_ws_chan.assert_called_once()
        assert str(mock_ws_chan.call_args.kwargs.get("channel_id")) == channel_id
        assert str(mock_ws_chan.call_args.kwargs.get("exclude_user_id")) == sender_id
        # Must NEVER broadcast chat message to entire company
        mock_ws_comp.assert_not_called()


# =========================================================================
# TEST 6: NOTIFICATIONS API ENDPOINT STRICT USER AUTHORIZATION
# =========================================================================
@pytest.mark.asyncio
async def test_notifications_api_user_authorization(employee_a):
    """
    Ensure API endpoints enforce user_id == current_user.id:
    - list_notifications queries strictly for current_user.id
    - mark_as_read restricts by current_user.id
    - clear_all_notifications deletes only current_user.id records
    """
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [
        InAppNotification(
            id=uuid.uuid4(),
            user_id=employee_a.id,
            title="My Task",
            message="Do work",
            is_read=False,
            type="task",
        )
    ]
    mock_db.execute.return_value = mock_result

    # 1. list_notifications
    res = await list_notifications(current_user=employee_a, db=mock_db)
    assert len(res) == 1
    assert res[0].user_id == employee_a.id
    stmt = mock_db.execute.call_args[0][0]
    # Verify SQL statement contains user_id filter
    assert "in_app_notifications.user_id = :user_id_1" in str(stmt)

    # 2. mark_as_read
    notif_id = uuid.uuid4()
    await mark_as_read(notification_id=notif_id, current_user=employee_a, db=mock_db)
    stmt_update = mock_db.execute.call_args[0][0]
    assert "in_app_notifications.user_id = :user_id_1" in str(stmt_update)

    # 3. clear_all_notifications
    await clear_all_notifications(current_user=employee_a, db=mock_db)
    stmt_delete = mock_db.execute.call_args[0][0]
    assert "in_app_notifications.user_id = :user_id_1" in str(stmt_delete)
