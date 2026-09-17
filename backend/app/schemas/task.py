from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field, model_validator
from app.schemas.user import UserSummary, DepartmentResponse


class TaskBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    status: str = "To Do"
    priority: str = "Medium"
    due_date: Optional[datetime] = None
    department_id: Optional[UUID] = None
    company_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    parent_task_id: Optional[UUID] = None
    milestone_id: Optional[UUID] = None
    progress: int = 0
    progress_percentage: Optional[int] = None
    execution_classification: Optional[str] = None
    is_private: bool = False

    @model_validator(mode="after")
    def sync_progress_percentage(self) -> "TaskBase":
        if self.progress_percentage is None:
            self.progress_percentage = self.progress
        return self


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
    assignee_ids: Optional[List[UUID]] = None
    department_id: Optional[UUID] = None
    progress: Optional[int] = None
    progress_percentage: Optional[int] = None
    execution_classification: Optional[str] = None
    is_private: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_progress(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if "progress_percentage" in values and values["progress_percentage"] is not None:
                if "progress" not in values or values["progress"] is None:
                    values["progress"] = values["progress_percentage"]
            elif "progress" in values and values["progress"] is not None:
                if "progress_percentage" not in values or values["progress_percentage"] is None:
                    values["progress_percentage"] = values["progress"]
        return values


class TaskAssigneeResponse(BaseModel):
    user: UserSummary

    class Config:
        from_attributes = True


class TaskFileCreate(BaseModel):
    task_id: Optional[UUID] = None
    file_url: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    storage_path: Optional[str] = None
    user_id: Optional[UUID] = None


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


class TaskVoiceNoteCreate(BaseModel):
    task_id: Optional[UUID] = None
    creator_id: Optional[UUID] = None
    storage_path: str
    display_name: str
    note_number: int = 1
    duration_seconds: float = 0.0
    file_size: Optional[int] = 0
    mime_type: Optional[str] = "audio/m4a"


class TaskVoiceNoteResponse(BaseModel):
    id: UUID
    task_id: UUID
    creator_id: Optional[UUID] = None
    storage_path: str
    display_name: str
    note_number: int
    duration_seconds: float
    file_size: int
    mime_type: Optional[str] = "audio/m4a"
    created_at: datetime

    class Config:
        from_attributes = True


class TaskBreadcrumbItem(BaseModel):
    id: UUID
    title: str
    depth: int
    has_access: bool = True

    class Config:
        from_attributes = True


class SubtaskSummaryResponse(BaseModel):
    """
    Flat subtask representation embedded inside a parent TaskResponse.
    Does NOT include its own `subtasks` field to prevent recursive serialization.
    Direct children only.
    """
    id: UUID
    title: str
    description: Optional[str] = None
    status: str = "To Do"
    priority: str = "Medium"
    due_date: Optional[datetime] = None
    progress: int = 0
    progress_percentage: Optional[int] = None
    parent_task_id: Optional[UUID] = None
    company_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    is_private: bool = False
    execution_classification: Optional[str] = None
    depth: int = 2
    has_children: bool = False
    child_count: int = 0
    has_incomplete_subtasks: bool = False

    assignee: Optional[UserSummary] = None
    creator: Optional[UserSummary] = None
    department: Optional[DepartmentResponse] = None
    assignees: Optional[List[TaskAssigneeResponse]] = []
    files: Optional[List[TaskFileResponse]] = []
    voice_notes: Optional[List[TaskVoiceNoteResponse]] = []
    subtasks: Optional[List["SubtaskSummaryResponse"]] = []

    @model_validator(mode="after")
    def sync_subtask_progress(self) -> "SubtaskSummaryResponse":
        if self.progress_percentage is None:
            self.progress_percentage = self.progress
        return self

    class Config:
        from_attributes = True


SubtaskSummaryResponse.model_rebuild()


class TaskResponse(TaskBase):
    id: UUID
    company_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    depth: int = 1
    has_children: bool = False
    child_count: int = 0
    has_incomplete_subtasks: bool = False
    ancestors: Optional[List[TaskBreadcrumbItem]] = []

    assignee: Optional[UserSummary] = None
    creator: Optional[UserSummary] = None
    department: Optional[DepartmentResponse] = None
    assignees: Optional[List[TaskAssigneeResponse]] = []
    files: Optional[List[TaskFileResponse]] = []
    voice_notes: Optional[List[TaskVoiceNoteResponse]] = []
    # Direct children list — flat, no recursion.
    subtasks: Optional[List[SubtaskSummaryResponse]] = []

    class Config:
        from_attributes = True


class SubtaskCreateItem(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "Medium"
    due_date: Optional[datetime] = None
    assignee_id: Optional[UUID] = None
    assignee_ids: Optional[List[UUID]] = None


class TaskSegregateRequest(BaseModel):
    child_tasks: List[SubtaskCreateItem]


class ExecutionActivityCreate(BaseModel):
    task_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    milestone_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    event_type: str
    metadata: Optional[Any] = None


class ExecutionActivityResponse(BaseModel):
    id: UUID
    task_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    milestone_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    event_type: str
    metadata: Optional[Any] = Field(default=None, validation_alias="metadata_")
    created_at: datetime
    user: Optional[UserSummary] = None

    class Config:
        from_attributes = True
        populate_by_name = True


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentResponse(BaseModel):
    id: UUID
    task_id: UUID
    user_id: UUID
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    user: Optional[UserSummary] = None

    class Config:
        from_attributes = True

