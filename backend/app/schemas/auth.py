from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserSummary(BaseModel):
    id: UUID
    email: str
    name: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    company_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    designation_id: Optional[UUID] = None
    is_approved: bool
    is_active: bool
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserSummary


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr
    reason: Optional[str] = None


class PasswordResetRequestResponse(BaseModel):
    status: str
    message: str
    target_role: Optional[str] = None
    approver_role: Optional[str] = None
    request_id: Optional[UUID] = None
    created_at: Optional[str] = None


class PasswordResetItemResponse(BaseModel):
    id: UUID
    email: str
    requester_id: Optional[UUID] = None
    requester_name: Optional[str] = None
    requester_role: Optional[str] = None
    approver_id: Optional[UUID] = None
    approver_name: Optional[str] = None
    company_id: Optional[UUID] = None
    company_name: Optional[str] = None
    department_name: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    created_at: str
    approved_at: Optional[str] = None
    completed_at: Optional[str] = None
    expires_at: Optional[str] = None


class PasswordResetRejectRequest(BaseModel):
    reason: Optional[str] = None


class PasswordResetCompleteRequest(BaseModel):
    new_password: str


class AuthStatusResponse(BaseModel):
    is_approved: bool
    role: str
    onboarding_completed: bool
