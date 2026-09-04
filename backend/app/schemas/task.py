from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.user import UserSummary


class TaskBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    status: str = "To Do"
    priority: str = "Medium"
    due_date: Optional[datetime] = None
    department_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    parent_task_id: Optional[UUID] = None
    milestone_id: Optional[UUID] = None
    progress: int = 0
    execution_classification: Optional[str] = None
    is_private: bool = False


class TaskCreate(TaskBase):
    user_id: Optional[UUID] = None
    assignee_ids: Optional[List[UUID]] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    user_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    progress: Optional[int] = None
    execution_classification: Optional[str] = None
    is_private: Optional[bool] = None


class TaskAssigneeResponse(BaseModel):
    user: UserSummary

    class Config:
        from_attributes = True


class TaskFileResponse(BaseModel):
    id: UUID
    task_id: UUID
    file_url: str
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TaskVoiceNoteResponse(BaseModel):
    id: UUID
    task_id: UUID
    storage_path: str
    display_name: str
    note_number: int
    duration_seconds: float
    file_size: int
    created_at: datetime

    class Config:
        from_attributes = True


class TaskResponse(TaskBase):
    id: UUID
    company_id: UUID
    user_id: Optional[UUID] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    assignee: Optional[UserSummary] = None
    creator: Optional[UserSummary] = None
    assignees: Optional[List[TaskAssigneeResponse]] = []
    files: Optional[List[TaskFileResponse]] = []
    voice_notes: Optional[List[TaskVoiceNoteResponse]] = []

    class Config:
        from_attributes = True


class SubtaskCreateItem(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "Medium"
    due_date: Optional[datetime] = None
    assignee_id: UUID


class TaskSegregateRequest(BaseModel):
    child_tasks: List[SubtaskCreateItem]
