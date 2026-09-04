from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class PushTokenRegister(BaseModel):
    token: str
    device_id: Optional[str] = None
    platform: Optional[str] = "android"


class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    body: str
    is_read: bool
    type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InAppNotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    message: Optional[str] = None
    body: Optional[str] = None
    is_read: bool
    type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SystemAlertResponse(BaseModel):
    id: UUID
    department_id: Optional[UUID] = None
    message: str
    type: str
    created_at: datetime

    class Config:
        from_attributes = True
