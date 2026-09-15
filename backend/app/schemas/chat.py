from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import UserSummary, CompanySummary, DepartmentResponse


class DirectChannelRequest(BaseModel):
    target_user_id: UUID


class ChatChannelCreate(BaseModel):
    name: str
    type: str = "public"  # public, department, management, direct, task
    department_id: Optional[UUID] = None
    task_id: Optional[UUID] = None


class ChatChannelResponse(BaseModel):
    id: UUID
    name: str
    type: str
    company_id: UUID
    department_id: Optional[UUID] = None
    task_id: Optional[UUID] = None
    participant_one_id: Optional[UUID] = None
    participant_two_id: Optional[UUID] = None
    is_private: bool
    created_at: datetime
    other_user: Optional[UserSummary] = None
    company: Optional[CompanySummary] = None
    department: Optional[DepartmentResponse] = None

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    channel_id: Optional[UUID] = None
    content: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: UUID
    channel_id: UUID
    user_id: UUID
    content: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    created_at: datetime
    user: Optional[UserSummary] = None

    class Config:
        from_attributes = True
