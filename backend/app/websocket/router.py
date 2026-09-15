from uuid import UUID
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.user import User
from app.websocket.connection_manager import connection_manager
from app.core.logging import logger

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    # 1. Authenticate token
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id_str = payload.get("sub")
    if not user_id_str:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        user_uuid = UUID(user_id_str)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    async with AsyncSessionLocal() as db:
        stmt = (
            select(User)
            .options(selectinload(User.company))
            .where(User.id == user_uuid, User.is_active == True, User.is_deleted == False)
        )
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()

    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if user.role != "Super Admin" and user.company and user.company.status != "Active":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Register connection
    await connection_manager.connect(websocket, user)

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
                action = msg.get("action")
                if action == "join_channel" and msg.get("channel_id"):
                    connection_manager.join_channel(websocket, str(msg["channel_id"]))
                elif action == "leave_channel" and msg.get("channel_id"):
                    connection_manager.leave_channel(websocket, str(msg["channel_id"]))
                elif action == "ping":
                    await websocket.send_text(json.dumps({"action": "pong"}))
            except Exception as parse_err:
                logger.warning(f"Error handling WebSocket client message: {parse_err}")

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        connection_manager.disconnect(websocket)
