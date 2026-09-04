from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.logging import logger
from app.models.user import UserIntegration
from app.models.task import Task


class GoogleCalendarService:
    @staticmethod
    async def sync_task_event(
        db: AsyncSession, task_id: UUID, user_id: UUID
    ) -> Dict[str, Any]:
        """Creates or updates a Google Calendar event for a task deadline."""
        # Query task
        t_stmt = select(Task).where(Task.id == task_id)
        t_res = await db.execute(t_stmt)
        task = t_res.scalar_one_or_none()

        if not task:
            return {"success": False, "error": "Task not found"}

        # Query user Google integration token
        i_stmt = select(UserIntegration).where(UserIntegration.user_id == user_id)
        i_res = await db.execute(i_stmt)
        integration = i_res.scalar_one_or_none()

        if not integration or not integration.gcal_access_token:
            return {"success": False, "error": "Google Calendar not connected"}

        event_payload = {
            "summary": f"[ZeroTask] {task.title}",
            "description": task.description or "Synced securely from ZeroTask.",
            "start": {"dateTime": datetime.now(timezone.utc).isoformat(), "timeZone": "UTC"},
            "end": {
                "dateTime": task.due_date.isoformat() if task.due_date else datetime.now(timezone.utc).isoformat(),
                "timeZone": "UTC",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                    headers={
                        "Authorization": f"Bearer {integration.gcal_access_token}",
                        "Content-Type": "application/json",
                    },
                    json=event_payload,
                )
                if resp.is_success:
                    return {"success": True, "event": resp.json()}
                else:
                    return {"success": False, "error": resp.text}
        except Exception as e:
            logger.error(f"Google Calendar sync error: {e}")
            return {"success": False, "error": str(e)}


calendar_service = GoogleCalendarService()
