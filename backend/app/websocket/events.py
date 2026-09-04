from enum import Enum
from typing import Dict, Any, Optional
from pydantic import BaseModel


class RealtimeEventType(str, Enum):
    TASK_UPDATE = "TASK_UPDATE"
    MEETING_UPDATE = "MEETING_UPDATE"
    NEW_MESSAGE = "NEW_MESSAGE"
    NEW_NOTIFICATION = "NEW_NOTIFICATION"
    APPROVAL_UPDATE = "APPROVAL_UPDATE"
    BADGE_COUNT_UPDATE = "BADGE_COUNT_UPDATE"
    AUDIT_LOG_INSERT = "AUDIT_LOG_INSERT"
    REPORT_REFRESH = "REPORT_REFRESH"
    SYSTEM_ALERT = "SYSTEM_ALERT"


class RealtimeMessage(BaseModel):
    event: RealtimeEventType
    payload: Dict[str, Any]
    channel_id: Optional[str] = None
