from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, model_validator
from app.schemas.user import UserSummary


class MeetingBase(BaseModel):
    title: str
    agenda: Optional[str] = None
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    project_id: Optional[UUID] = None
    meeting_link: Optional[str] = None
    meeting_url: Optional[str] = None
    is_private: bool = False

    @model_validator(mode="before")
    @classmethod
    def unify_meeting_link(cls, data: Any) -> Any:
        if isinstance(data, dict):
            url = data.get("meeting_link") or data.get("meeting_url")
            if url and isinstance(url, str):
                cleaned = url.strip()
                if cleaned and not cleaned.startswith(("http://", "https://")):
                    cleaned = f"https://{cleaned}"
                data["meeting_link"] = cleaned
                data["meeting_url"] = cleaned
        return data


class MeetingCreate(MeetingBase):
    participant_ids: Optional[List[UUID]] = []
    participants: Optional[List[UUID]] = []
    company_id: Optional[UUID] = None

    @model_validator(mode="before")
    @classmethod
    def unify_participants(cls, data: Any) -> Any:
        if isinstance(data, dict):
            p_ids = data.get("participant_ids") or data.get("participants") or []
            data["participant_ids"] = p_ids
            url = data.get("meeting_link") or data.get("meeting_url")
            if url and isinstance(url, str):
                cleaned = url.strip()
                if cleaned and not cleaned.startswith(("http://", "https://")):
                    cleaned = f"https://{cleaned}"
                data["meeting_link"] = cleaned
                data["meeting_url"] = cleaned
        return data


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    agenda: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    meeting_link: Optional[str] = None
    meeting_url: Optional[str] = None
    status: Optional[str] = None
    is_private: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def unify_update_meeting_link(cls, data: Any) -> Any:
        if isinstance(data, dict):
            url = data.get("meeting_link") or data.get("meeting_url")
            if url and isinstance(url, str):
                cleaned = url.strip()
                if cleaned and not cleaned.startswith(("http://", "https://")):
                    cleaned = f"https://{cleaned}"
                data["meeting_link"] = cleaned
                data["meeting_url"] = cleaned
        return data


class MeetingProcessApprovalRequest(BaseModel):
    approval_id: Optional[Any] = None
    meeting_id: Optional[Any] = None
    action: str = "Approved"  # Approved, Rejected, Postponed, Preponed
    reason: Optional[str] = None
    decision_reason: Optional[str] = None
    new_start_time: Optional[datetime] = None
    new_end_time: Optional[datetime] = None


class MeetingFileCreate(BaseModel):
    meeting_id: Optional[UUID] = None
    file_url: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    user_id: Optional[UUID] = None
    uploaded_by: Optional[UUID] = None


class MeetingFileResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    user_id: Optional[UUID] = None
    file_url: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MeetingParticipantResponse(BaseModel):
    user_id: UUID
    role: Optional[str] = "attendee"
    status: Optional[str] = "accepted"
    user: Optional[UserSummary] = None

    class Config:
        from_attributes = True


class MeetingSummary(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None
    meeting_link: Optional[str] = None
    meeting_url: Optional[str] = None
    organizer_id: Optional[UUID] = None
    organizer: Optional[UserSummary] = None

    class Config:
        from_attributes = True


class MeetingApprovalResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    approver_id: UUID
    requester_id: UUID
    status: str
    decision_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    approver: Optional[UserSummary] = None
    requester: Optional[UserSummary] = None
    meeting: Optional[MeetingSummary] = None

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
    approvals: Optional[List[MeetingApprovalResponse]] = []
    files: Optional[List[MeetingFileResponse]] = []

    class Config:
        from_attributes = True


class MeetingApprovalAction(BaseModel):
    action: str  # Approved, Rejected, Postponed, Preponed
    reason: Optional[str] = None
    decision_reason: Optional[str] = None
    new_start_time: Optional[datetime] = None
    new_end_time: Optional[datetime] = None


