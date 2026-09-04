from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.task import Task, TaskAssignee
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskSegregateRequest,
)
from app.services.task_service import task_service

router = APIRouter()


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    department_id: Optional[UUID] = None,
    project_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns tasks scoped to caller's company.
    Hierarchical filtering: Employees see public or assigned tasks;
    Managers/Dept Heads see department tasks; Founders see all company tasks.
    """
    stmt = (
        select(Task)
        .options(
            selectinload(Task.assignee),
            selectinload(Task.creator),
            selectinload(Task.assignees).selectinload(TaskAssignee.user),
            selectinload(Task.files),
            selectinload(Task.voice_notes),
        )
    )

    if current_user.role != "Super Admin":
        stmt = stmt.where(Task.company_id == current_user.company_id)

    # Department filter
    if department_id:
        stmt = stmt.where(Task.department_id == department_id)
    elif current_user.role in ["Manager", "Employee", "Execution Team"]:
        # Scoped to own department
        if current_user.department_id:
            stmt = stmt.where(Task.department_id == current_user.department_id)

    # Status / Priority
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if priority_filter:
        stmt = stmt.where(Task.priority == priority_filter)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)

    # Private tasks filter
    if current_user.role not in ["Super Admin", "Founder"]:
        stmt = stmt.where((Task.is_private == False) | (Task.created_by == current_user.id))

    stmt = stmt.order_by(Task.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_new_task(
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.create_task(db, current_user, data)
    # Refetch with loaded relationships
    return await task_service.get_task_by_id(db, task.id, current_user)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task_details(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task_details(
    task_id: UUID,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await task_service.update_task(db, task_id, current_user, data)
    return await task_service.get_task_by_id(db, task_id, current_user)


@router.post("/{task_id}/segregate")
async def segregate_parent_task(
    task_id: UUID,
    data: TaskSegregateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.segregate_task(db, task_id, current_user, data.child_tasks)


@router.delete("/{task_id}")
async def delete_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if current_user.role not in ["Founder", "Super Admin", "Department Head"] and task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this task")

    await db.execute(delete(Task).where(Task.id == task_id))
    await db.commit()
    return {"message": "Task deleted successfully"}
