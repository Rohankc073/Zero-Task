from typing import Dict, Set, Optional, List, Any
from uuid import UUID
import json
from fastapi import WebSocket
from app.models.user import User
from app.websocket.events import RealtimeEventType
from app.core.logging import logger


class ConnectionManager:
    def __init__(self):
        # socket -> metadata dict
        self.active_connections: Dict[WebSocket, Dict[str, Any]] = {}
        # user_id -> Set[WebSocket]
        self.user_connections: Dict[UUID, Set[WebSocket]] = {}
        # company_id -> Set[WebSocket]
        self.company_connections: Dict[UUID, Set[WebSocket]] = {}
        # channel_id -> Set[WebSocket]
        self.channel_subscribers: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user: User) -> None:
        await websocket.accept()
        metadata = {
            "user_id": user.id,
            "company_id": user.company_id,
            "department_id": user.department_id,
            "role": user.role,
            "channels": set(),
        }
        self.active_connections[websocket] = metadata

        # Map user
        if user.id not in self.user_connections:
            self.user_connections[user.id] = set()
        self.user_connections[user.id].add(websocket)

        # Map company
        if user.company_id:
            if user.company_id not in self.company_connections:
                self.company_connections[user.company_id] = set()
            self.company_connections[user.company_id].add(websocket)

        logger.info(f"WebSocket client connected: user={user.id}, company={user.company_id}")

    def disconnect(self, websocket: WebSocket) -> None:
        metadata = self.active_connections.pop(websocket, None)
        if metadata:
            user_id = metadata["user_id"]
            company_id = metadata["company_id"]

            # Remove from user mapping
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]

            # Remove from company mapping
            if company_id and company_id in self.company_connections:
                self.company_connections[company_id].discard(websocket)
                if not self.company_connections[company_id]:
                    del self.company_connections[company_id]

            # Remove from channel subscriptions
            for ch in metadata.get("channels", []):
                if ch in self.channel_subscribers:
                    self.channel_subscribers[ch].discard(websocket)

        logger.info("WebSocket client disconnected")

    def join_channel(self, websocket: WebSocket, channel_id: str) -> None:
        if websocket in self.active_connections:
            self.active_connections[websocket]["channels"].add(channel_id)
            if channel_id not in self.channel_subscribers:
                self.channel_subscribers[channel_id] = set()
            self.channel_subscribers[channel_id].add(websocket)

    def leave_channel(self, websocket: WebSocket, channel_id: str) -> None:
        if websocket in self.active_connections:
            self.active_connections[websocket]["channels"].discard(channel_id)
        if channel_id in self.channel_subscribers:
            self.channel_subscribers[channel_id].discard(websocket)

    async def broadcast_to_user(
        self, user_id: UUID, event: RealtimeEventType, payload: Dict[str, Any]
    ) -> None:
        sockets = self.user_connections.get(user_id, set()).copy()
        msg_str = json.dumps({"event": event.value, "payload": payload})
        for ws in sockets:
            try:
                await ws.send_text(msg_str)
            except Exception:
                self.disconnect(ws)

    async def broadcast_to_company(
        self,
        company_id: UUID,
        event: RealtimeEventType,
        payload: Dict[str, Any],
        exclude_user_id: Optional[UUID] = None,
    ) -> None:
        """Strict Company Isolation: Only sends to sockets belonging to the target company."""
        sockets = self.company_connections.get(company_id, set()).copy()
        msg_str = json.dumps({"event": event.value, "payload": payload})
        for ws in sockets:
            if exclude_user_id and self.active_connections.get(ws, {}).get("user_id") == exclude_user_id:
                continue
            try:
                await ws.send_text(msg_str)
            except Exception:
                self.disconnect(ws)

    async def broadcast_to_channel(
        self,
        channel_id: str,
        event: RealtimeEventType,
        payload: Dict[str, Any],
        exclude_user_id: Optional[UUID] = None,
    ) -> None:
        sockets = self.channel_subscribers.get(channel_id, set()).copy()
        msg_str = json.dumps({"event": event.value, "payload": payload, "channel_id": channel_id})
        for ws in sockets:
            if exclude_user_id and self.active_connections.get(ws, {}).get("user_id") == exclude_user_id:
                continue
            try:
                await ws.send_text(msg_str)
            except Exception:
                self.disconnect(ws)


connection_manager = ConnectionManager()
