from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import UserSummary


class MeetingBase(BaseModel):
    title: str
    agenda: Optional[str] = None
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    project_id: Optional[UUID] = None
    meeting_link: Optional[str] = None
    is_private: bool = False


class MeetingCreate(MeetingBase):
    participant_ids: Optional[List[UUID]] = []


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    agenda: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    meeting_link: Optional[str] = None
    status: Optional[str] = None
    is_private: Optional[bool] = None


class MeetingParticipantResponse(BaseModel):
    user_id: UUID
    role: Optional[str] = "attendee"
    status: Optional[str] = "accepted"
    user: Optional[UserSummary] = None

    class Config:
        from_attributes = True


class MeetingResponse(MeetingBase):
    id: UUID
    company_id: UUID
    organizer_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime

    organizer: Optional[UserSummary] = None
    participants: Optional[List[MeetingParticipantResponse]] = []

    class Config:
        from_attributes = True


class MeetingApprovalAction(BaseModel):
    action: str  # Approved, Rejected
    reason: Optional[str] = None
