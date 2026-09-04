from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class EmployeeMetricsResponse(BaseModel):
    total_open_tasks: int
    tasks_due_this_week: int
    completion_percentage: float


class ManagerProjectMetric(BaseModel):
    project_id: UUID
    project_name: str
    total_tasks: int
    todo_tasks: int
    in_progress_tasks: int
    done_tasks: int


class TeamWorkloadMetric(BaseModel):
    user_id: UUID
    user_name: str
    assigned_tasks: int
    completed_tasks: Optional[int] = 0
