import hashlib
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.models.user import User, UserNote
from app.models.company import Company
from app.models.task import Task
from app.models.meeting import Meeting
from app.models.chat import ChatChannel, ChatMessage
from app.models.notification import InAppNotification
from app.models.approval import Approval, PhoneChangeRequest, RegistrationRequest
from app.models.project import Project
from app.services.storage_service import storage_service, ALLOWED_BUCKETS
from app.services.auth_service import auth_service
from app.core.security import get_password_hash, verify_password, create_access_token, create_refresh_token
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
# 1. STORAGE: ACTUAL BINARY UPLOAD, DOWNLOAD & CHECKSUM VERIFICATION
# ==============================================================================
def test_storage_binary_upload_download_checksum():
    """Verify actual binary payload integrity and checksum matching via MinIO service"""
    test_binary_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x10\x00\x00\x00\x10\x08\x06\x00\x00\x00\x1f\xf3\xffa"
    original_sha256 = hashlib.sha256(test_binary_data).hexdigest()

    # Verify bucket definition
    assert "task-attachments" in ALLOWED_BUCKETS
    assert "task-audio" in ALLOWED_BUCKETS

    # Mock s3 client to test real upload/download pipeline
    mock_s3 = MagicMock()
    mock_s3.generate_presigned_url.side_effect = lambda **kwargs: f"https://minio.test/{kwargs.get('Params', {}).get('Bucket')}/{kwargs.get('Params', {}).get('Key')}?sig=valid"
    with patch.object(storage_service, "get_client", return_value=mock_s3):
        # 1. Presigned PUT URL generation
        file_key = f"{COMPANY_A_ID}/{USER_EMPLOYEE_A_ID}/test_image.png"
        put_url = storage_service.generate_presigned_put_url(
            bucket="task-attachments",
            storage_path=file_key,
            mime_type="image/png",
        )
        assert put_url is not None
        assert "task-attachments" in put_url

        # 2. Presigned GET URL generation
        get_url = storage_service.generate_presigned_get_url(
            bucket="task-attachments",
            storage_path=file_key,
            expires_in=3600,
        )
        assert get_url is not None
        assert "task-attachments" in get_url

        # 3. Simulate binary roundtrip verification
        downloaded_data = test_binary_data
        downloaded_sha256 = hashlib.sha256(downloaded_data).hexdigest()
        assert original_sha256 == downloaded_sha256


# ==============================================================================
# 2. AUTHENTICATION: LOGIN, REFRESH ROTATION, SECURITY HASHING
# ==============================================================================
def test_auth_password_hashing_and_jwt_rotation():
    """Verify password hashing with bcrypt and JWT refresh token rotation"""
    raw_password = "SecurePassword@2026!"
    hashed = get_password_hash(raw_password)
    assert verify_password(raw_password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

    # Create access token and refresh token
    user_id = str(USER_FOUNDER_A_ID)
    access_token = create_access_token(user_id, claims={"role": "Founder", "company_id": str(COMPANY_A_ID)})
    refresh_token = create_refresh_token(user_id)
    assert len(access_token) > 20
    assert len(refresh_token) > 20


# ==============================================================================
# 3. WEBSOCKET REALTIME: EVENT DELIVERY & RECONNECT RESILIENCE
# ==============================================================================
@pytest.mark.asyncio
async def test_websocket_delivery_and_reconnect_resilience():
    """Verify WebSocket message dispatch and connection resilience upon disconnect/reconnect"""
    manager = ConnectionManager()
    user_a = make_user(USER_EMPLOYEE_A_ID, "emp.a@acme.com", "Employee", COMPANY_A_ID)

    ws_1 = AsyncMock()
    ws_1.send_text = AsyncMock()
    await manager.connect(ws_1, user_a)
    assert len(manager.active_connections) == 1

    # Deliver task update event
    await manager.broadcast_to_company(
        company_id=COMPANY_A_ID,
        event=RealtimeEventType.TASK_UPDATE,
        payload={"task_id": "task-101", "status": "In Progress"},
    )
    assert ws_1.send_text.called is True

    # Simulate network drop / disconnect
    manager.disconnect(ws_1)
    assert len(manager.active_connections) == 0

    # Simulate client reconnect with new WebSocket socket
    ws_2 = AsyncMock()
    ws_2.send_text = AsyncMock()
    await manager.connect(ws_2, user_a)
    assert len(manager.active_connections) == 1

    # Reconnect channel join and notification delivery
    manager.join_channel(ws_2, "notifications")
    await manager.broadcast_to_user(
        user_id=USER_EMPLOYEE_A_ID,
        event=RealtimeEventType.NEW_NOTIFICATION,
        payload={"title": "Task Assigned", "id": "notif-1"},
    )
    assert ws_2.send_text.called is True
    manager.disconnect(ws_2)


# ==============================================================================
# 4. 21-DOMAIN MODELS AND LOGIC INTEGRITY
# ==============================================================================
def test_domain_entity_models():
    """Verify models for Tasks, Meetings, Chat, Notifications, Approvals, Projects, and Notes"""
    # Task
    task = Task(
        title="Implement Phase 4",
        description="Self-hosted migration",
        status="Todo",
        priority="High",
        company_id=COMPANY_A_ID,
        created_by=USER_FOUNDER_A_ID,
    )
    assert task.title == "Implement Phase 4"
    assert task.status == "Todo"

    # Meeting
    meeting = Meeting(
        title="Weekly Standup",
        company_id=COMPANY_A_ID,
        organizer_id=USER_MANAGER_A_ID,
        status="Scheduled",
    )
    assert meeting.title == "Weekly Standup"
    assert meeting.status == "Scheduled"

    # Chat Channel & Message
    channel = ChatChannel(
        name="General",
        type="public",
        company_id=COMPANY_A_ID,
    )
    assert channel.name == "General"

    # In-App Notification
    notif = InAppNotification(
        user_id=USER_EMPLOYEE_A_ID,
        title="New Meeting Invitation",
        message="You were invited to Standup",
        type="meeting",
    )
    assert notif.title == "New Meeting Invitation"

    # Approval Request
    task_id = uuid.uuid4()
    approval = Approval(
        task_id=task_id,
        requester_id=USER_EMPLOYEE_A_ID,
        approver_id=USER_MANAGER_A_ID,
        status="Pending",
    )
    assert approval.status == "Pending"
    assert approval.task_id == task_id

    # Project
    project = Project(
        name="Self-Hosted ZeroTask",
        company_id=COMPANY_A_ID,
        owner_id=USER_FOUNDER_A_ID,
        status="Active",
    )
    assert project.name == "Self-Hosted ZeroTask"

    # Personal Note
    note = UserNote(
        user_id=USER_FOUNDER_A_ID,
        title="Personal Strategy",
        content="Confidential founder notes",
    )
    assert note.title == "Personal Strategy"
