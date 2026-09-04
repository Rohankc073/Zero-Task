from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.schemas.auth import UserSummary


class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None


class DepartmentCreate(DepartmentBase):
    company_id: Optional[UUID] = None


class DepartmentResponse(DepartmentBase):
    id: UUID
    company_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DesignationBase(BaseModel):
    name: str
    description: Optional[str] = None
    base_role: str = "Employee"


class DesignationCreate(DesignationBase):
    company_id: Optional[UUID] = None


class DesignationResponse(DesignationBase):
    id: UUID
    company_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    full_name: Optional[str] = None
    role: str = "Employee"
    department_id: Optional[UUID] = None
    designation_id: Optional[UUID] = None
    phone_number: Optional[str] = None
    avatar_url: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None


class UserCreate(UserBase):
    password: str
    company_id: Optional[UUID] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    department_id: Optional[UUID] = None
    designation_id: Optional[UUID] = None
    phone_number: Optional[str] = None
    avatar_url: Optional[str] = None
    is_approved: Optional[bool] = None
    is_active: Optional[bool] = None
    preferences: Optional[Dict[str, Any]] = None


class UserResponse(UserBase):
    id: UUID
    company_id: Optional[UUID] = None
    is_approved: bool
    is_active: bool
    is_deleted: bool
    onboarding_completed: bool
    organization_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    department: Optional[DepartmentResponse] = None
    designation: Optional[DesignationResponse] = None

    class Config:
        from_attributes = True
