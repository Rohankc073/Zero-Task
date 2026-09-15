import asyncio
import json
from uuid import UUID
import asyncpg
from app.core.config import settings
from app.core.logging import logger
from app.websocket.connection_manager import connection_manager
from app.websocket.events import RealtimeEventType


class PostgreSQLListener:
    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._listen_loop())
        logger.info("PostgreSQL LISTEN/NOTIFY consumer started on channel 'app_events'")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("PostgreSQL LISTEN/NOTIFY consumer stopped")

    async def _listen_loop(self):
        while self._running:
            try:
                conn = await asyncpg.connect(
                    user=settings.POSTGRES_USER,
                    password=settings.POSTGRES_PASSWORD,
                    database=settings.POSTGRES_DB,
                    host=settings.POSTGRES_SERVER,
                    port=settings.POSTGRES_PORT,
                )
                await conn.add_listener("app_events", self._handle_notification)
                logger.info("Connected to PostgreSQL for LISTEN on 'app_events'")

                while self._running:
                    await asyncio.sleep(1)

                await conn.close()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"PostgreSQL listener error: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5)

    def _handle_notification(self, connection, pid, channel, payload):
        try:
            data = json.loads(payload)
            table = data.get("table")
            action = data.get("action")
            company_id_str = data.get("company_id")
            record = data.get("record", {})

            company_id = UUID(company_id_str) if company_id_str else None

            # 1. Targeted user notifications: NEVER broadcast to company
            if table in ["in_app_notifications", "notifications"]:
                recipient_uid_str = record.get("user_id")
                if recipient_uid_str:
                    try:
                        recipient_uid = UUID(str(recipient_uid_str))
                        asyncio.create_task(
                            connection_manager.broadcast_to_user(
                                user_id=recipient_uid,
                                event=RealtimeEventType.NEW_NOTIFICATION,
                                payload={"action": action, "record": record},
                            )
                        )
                    except Exception as e:
                        logger.error(f"Error targeting user notification: {e}")
                return

            # 2. Channel chat messages: broadcast ONLY to channel subscribers, EXCLUDING sender
            if table == "chat_messages":
                channel_id = record.get("channel_id")
                if channel_id:
                    sender_id = None
                    if record.get("user_id"):
                        try:
                            sender_id = UUID(str(record["user_id"]))
                        except Exception:
                            sender_id = None
                    asyncio.create_task(
                        connection_manager.broadcast_to_channel(
                            channel_id=str(channel_id),
                            event=RealtimeEventType.NEW_MESSAGE,
                            payload=record,
                            exclude_user_id=sender_id,
                        )
                    )
                return

            # 3. Company-scoped updates (tasks, meetings, approvals, system alerts, audit logs)
            event_type = RealtimeEventType.TASK_UPDATE
            if table == "tasks":
                event_type = RealtimeEventType.TASK_UPDATE
            elif table == "meetings":
                event_type = RealtimeEventType.MEETING_UPDATE
            elif table in ["meeting_approvals", "phone_change_requests", "approvals"]:
                event_type = RealtimeEventType.APPROVAL_UPDATE
            elif table == "audit_logs":
                event_type = RealtimeEventType.AUDIT_LOG_INSERT
            elif table == "system_alerts":
                event_type = RealtimeEventType.SYSTEM_ALERT

            if company_id:
                asyncio.create_task(
                    connection_manager.broadcast_to_company(
                        company_id=company_id,
                        event=event_type,
                        payload={"action": action, "record": record},
                    )
                )

        except Exception as e:
            logger.error(f"Error handling DB notification: {e}")


pg_listener = PostgreSQLListener()
