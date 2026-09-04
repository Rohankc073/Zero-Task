from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.schemas.user import UserSummary


class RegistrationRequestCreate(BaseModel):
    email: EmailStr
    requested_role: str


class RegistrationRequestResponse(BaseModel):
    id: UUID
    email: str
    requested_role: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PhoneChangeRequestCreate(BaseModel):
    new_phone: str


class PhoneChangeRequestResponse(BaseModel):
    id: UUID
    user_id: UUID
    new_phone: str
    old_phone: Optional[str] = None
    status: str
    created_at: datetime
    user: Optional[UserSummary] = None

    class Config:
        from_attributes = True


class PhoneApprovalAction(BaseModel):
    action: str = "Approved"  # Approved, Rejected
    decision: Optional[str] = None


class PasswordResetApprovalAction(BaseModel):
    new_password: str


class ApprovalResponse(BaseModel):
    id: UUID
    task_id: UUID
    requester_id: UUID
    approver_id: UUID
    status: str
    comments: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    requester: Optional[UserSummary] = None
    approver: Optional[UserSummary] = None

    class Config:
        from_attributes = True
