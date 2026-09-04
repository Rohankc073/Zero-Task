import pytest
from unittest.mock import AsyncMock
from app.websocket.connection_manager import ConnectionManager
from app.websocket.events import RealtimeEventType
from tests.conftest import (
    COMPANY_A_ID,
    COMPANY_B_ID,
    make_user,
    USER_EMPLOYEE_A_ID,
    USER_EMPLOYEE_B_ID,
)


@pytest.mark.asyncio
async def test_realtime_company_isolation():
    manager = ConnectionManager()

    # User in Company A
    user_a = make_user(USER_EMPLOYEE_A_ID, "emp.a@acme.com", "Employee", COMPANY_A_ID)
    ws_a = AsyncMock()
    ws_a.send_text = AsyncMock()
    await manager.connect(ws_a, user_a)

    # User in Company B
    user_b = make_user(USER_EMPLOYEE_B_ID, "emp.b@beta.com", "Employee", COMPANY_B_ID)
    ws_b = AsyncMock()
    ws_b.send_text = AsyncMock()
    await manager.connect(ws_b, user_b)

    # Broadcast to Company A
    await manager.broadcast_to_company(
        company_id=COMPANY_A_ID,
        event=RealtimeEventType.TASK_UPDATE,
        payload={"task_id": "test-task", "status": "Done"},
    )

    # Verification: Only ws_a received message; ws_b received zero messages!
    assert ws_a.send_text.called is True
    assert ws_b.send_text.called is False

    # Disconnect
    manager.disconnect(ws_a)
    manager.disconnect(ws_b)
    assert len(manager.active_connections) == 0


@pytest.mark.asyncio
async def test_realtime_channel_subscriptions():
    manager = ConnectionManager()
    user_a = make_user(USER_EMPLOYEE_A_ID, "emp.a@acme.com", "Employee", COMPANY_A_ID)
    ws_a = AsyncMock()
    ws_a.send_text = AsyncMock()
    await manager.connect(ws_a, user_a)

    channel_id = "chat_123"
    manager.join_channel(ws_a, channel_id)
    assert channel_id in manager.active_connections[ws_a]["channels"]

    await manager.broadcast_to_channel(
        channel_id=channel_id,
        event=RealtimeEventType.NEW_MESSAGE,
        payload={"content": "Hello Channel"},
    )
    assert ws_a.send_text.called is True

    manager.leave_channel(ws_a, channel_id)
    assert channel_id not in manager.active_connections[ws_a]["channels"]
    manager.disconnect(ws_a)
