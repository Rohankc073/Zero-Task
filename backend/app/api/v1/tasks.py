from typing import List, Optional
from uuid import UUID
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_, and_
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.task import Task, TaskAssignee, ExecutionActivity, TaskFile, TaskVoiceNote
from app.schemas.user import UserResponse
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskSegregateRequest,
    ExecutionActivityCreate,
    ExecutionActivityResponse,
    TaskFileCreate,
    TaskFileResponse,
    TaskVoiceNoteCreate,
    TaskVoiceNoteResponse,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
)
from app.services.task_service import task_service

router = APIRouter()


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    department_id: Optional[UUID] = None,
    project_id: Optional[UUID] = None,
    top_level_only: Optional[bool] = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns tasks scoped to caller's company with proper authorization and assignment visibility.
    Universal Assignment Rule:
    If user X is assigned to task Y (in task.user_id OR task_assignees) or created task Y,
    user X can retrieve task Y within their company.
    """
    stmt = (
        select(Task)
        .options(
            selectinload(Task.assignee),
            selectinload(Task.creator),
            selectinload(Task.department),
            selectinload(Task.assignees).selectinload(TaskAssignee.user),
            selectinload(Task.files),
            selectinload(Task.voice_notes),
            selectinload(Task.subtasks).selectinload(Task.assignee),
            selectinload(Task.subtasks).selectinload(Task.creator),
            selectinload(Task.subtasks).selectinload(Task.department),
            selectinload(Task.subtasks).selectinload(Task.assignees).selectinload(TaskAssignee.user),
            selectinload(Task.subtasks).selectinload(Task.files),
            selectinload(Task.subtasks).selectinload(Task.voice_notes),
            # Level 3 Subtasks (Grandchildren e.g. Phase 1 of 2)
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignee),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.creator),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignees).selectinload(TaskAssignee.user),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.files),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.voice_notes),
            # Level 4 Subtasks (e.g. Phase X of 1)
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignee),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.creator),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignees).selectinload(TaskAssignee.user),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.files),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.voice_notes),
            # Level 5 Subtasks
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignee),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.creator),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignees).selectinload(TaskAssignee.user),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.files),
            selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.voice_notes),
        )
    )

    # 1. Universal Assignment / Creator Clause
    assignee_subquery = select(TaskAssignee.task_id).where(TaskAssignee.user_id == current_user.id)
    is_assigned_or_created = or_(
        Task.user_id == current_user.id,
        Task.id.in_(assignee_subquery),
        Task.created_by == current_user.id,
    )

    # 2. Strict Company Isolation
    if current_user.role != "Super Admin":
        # Non-SuperAdmin sees only tasks belonging to their own company
        company_scope = or_(
            Task.company_id == current_user.company_id,
            and_(Task.company_id.is_(None), is_assigned_or_created),
        )
        stmt = stmt.where(company_scope)

    # 3. Personal Task Hierarchy & Authoritative Assignment Visibility
    # Subqueries for role classification within caller's company
    employee_subquery = select(User.id).where(
        User.company_id == current_user.company_id,
        User.role.in_(["Employee", "Execution Team"]),
        User.is_deleted == False,
    )
    manager_subquery = select(User.id).where(
        User.company_id == current_user.company_id,
        User.role == "Manager",
        User.is_deleted == False,
    )
    dh_subquery = select(User.id).where(
        User.company_id == current_user.company_id,
        User.role == "Department Head",
        User.is_deleted == False,
    )
    superadmin_subquery = select(User.id).where(
        User.role == "Super Admin",
        User.is_deleted == False,
    )

    # A task is personal if created by user for self (created_by == user_id or is_private)
    is_personal_task = or_(
        Task.created_by == Task.user_id,
        Task.is_private == True,
    )

    # Subtask direct involvement
    subtask_involvement = select(Task.parent_task_id).where(
        or_(
            Task.user_id == current_user.id,
            Task.created_by == current_user.id,
            Task.id.in_(assignee_subquery),
        )
    )

    if current_user.role in ["Employee", "Execution Team"]:
        # Employees: Strictly tasks they created or are assigned to, or tasks where they are assigned a subtask
        visibility_condition = or_(
            is_assigned_or_created,
            Task.id.in_(subtask_involvement),
        )
    elif current_user.role == "Manager":
        # Managers: Assigned/created + subordinate employee personal tasks + department tasks
        manager_conditions = [
            is_assigned_or_created,
            and_(is_personal_task, Task.created_by.in_(employee_subquery)),
        ]
        if current_user.department_id is not None:
            manager_conditions.append(and_(Task.department_id == current_user.department_id, Task.department_id.is_not(None)))
        visibility_condition = or_(*manager_conditions)
    elif current_user.role == "Department Head":
        # Department Heads: Assigned/created + employee & manager personal tasks + department tasks
        dh_conditions = [
            is_assigned_or_created,
            and_(is_personal_task, or_(Task.created_by.in_(employee_subquery), Task.created_by.in_(manager_subquery))),
        ]
        if current_user.department_id is not None:
            dh_conditions.append(and_(Task.department_id == current_user.department_id, Task.department_id.is_not(None)))
        visibility_condition = or_(*dh_conditions)
    elif current_user.role == "Founder":
        # Founders:
        # - Any task they created or are assigned to
        # - Any non-personal company task (assigned to company employees)
        # - Subordinate personal tasks (Employee, Manager, Department Head)
        # - BUT NOT other Founders' or Super Admin's personal tasks!
        subordinate_personal = and_(
            is_personal_task,
            or_(
                Task.created_by.in_(employee_subquery),
                Task.created_by.in_(manager_subquery),
                Task.created_by.in_(dh_subquery),
            ),
        )
        non_personal_company_task = and_(
            Task.is_private == False,
            Task.user_id != Task.created_by,
        )
        visibility_condition = or_(
            is_assigned_or_created,
            non_personal_company_task,
            subordinate_personal,
        )
    elif current_user.role == "Super Admin":
        # Super Admin: All tasks except personal tasks created by other Super Admins
        other_superadmin_personal = and_(
            is_personal_task,
            Task.created_by.in_(superadmin_subquery),
            Task.created_by != current_user.id,
        )
        visibility_condition = ~other_superadmin_personal
    else:
        visibility_condition = is_assigned_or_created

    stmt = stmt.where(visibility_condition)

    # 4. Optional Explicit Query Filters
    if top_level_only:
        stmt = stmt.where(Task.parent_task_id.is_(None))
    if department_id:
        stmt = stmt.where(Task.department_id == department_id)
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if priority_filter:
        stmt = stmt.where(Task.priority == priority_filter)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)

    stmt = stmt.order_by(Task.created_at.desc())
    res = await db.execute(stmt)
    tasks = list(res.scalars().unique().all())

    def sanitize_task_tree(item, cur_depth=1):
        i_dict = getattr(item, "__dict__", {})
        if "files" not in i_dict:
            i_dict["files"] = []
        if "voice_notes" not in i_dict:
            i_dict["voice_notes"] = []
        if "assignees" not in i_dict:
            i_dict["assignees"] = []
        if "assignee" not in i_dict:
            i_dict["assignee"] = None
        if "creator" not in i_dict:
            i_dict["creator"] = None
        if "attachments" not in i_dict:
            i_dict["attachments"] = []
        if "department" not in i_dict:
            i_dict["department"] = None

        raw_subs = i_dict.get("subtasks") or []
        visible_subs = [s for s in raw_subs if task_service.can_view_task(s, current_user)]
        for s in visible_subs:
            setattr(s, "depth", cur_depth + 1)
            sanitize_task_tree(s, cur_depth + 1)
        i_dict["subtasks"] = visible_subs
        setattr(item, "child_count", len(visible_subs))
        setattr(item, "has_children", len(visible_subs) > 0)

    for t in tasks:
        sanitize_task_tree(t, 1)

    return tasks


@router.get("/eligible-assignees", response_model=List[UserResponse])
async def get_eligible_assignees(
    parent_task_id: Optional[UUID] = None,
    company_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns authoritative list of users eligible to be assigned a task or subtask."""
    return await task_service.get_eligible_assignees(
        db, current_user, parent_task_id=parent_task_id, company_id=company_id
    )


@router.get("/{task_id}/eligible-assignees", response_model=List[UserResponse])
async def get_task_eligible_assignees(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns authoritative list of users eligible to be assigned a subtask under task_id."""
    return await task_service.get_eligible_assignees(db, current_user, parent_task_id=task_id)


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


@router.api_route("/{task_id}", methods=["PATCH", "PUT"], response_model=TaskResponse)
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
    return await task_service.delete_task(db, task_id, current_user)



@router.post("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await task_service.complete_task(db, task_id, current_user)
    return await task_service.get_task_by_id(db, task_id, current_user)


@router.get("/{task_id}/activity", response_model=List[ExecutionActivityResponse])
async def get_task_activity(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    stmt = (
        select(ExecutionActivity)
        .options(selectinload(ExecutionActivity.user))
        .where(ExecutionActivity.task_id == task_id)
        .order_by(ExecutionActivity.created_at.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/{task_id}/activity", response_model=ExecutionActivityResponse, status_code=status.HTTP_201_CREATED)
async def log_task_activity(
    task_id: UUID,
    data: ExecutionActivityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    safe_metadata = data.metadata
    if hasattr(safe_metadata, "model_dump"):
        safe_metadata = safe_metadata.model_dump(mode="json")
    elif safe_metadata is not None:
        try:
            safe_metadata = json.loads(json.dumps(safe_metadata, default=str))
        except Exception:
            safe_metadata = {}

    activity = ExecutionActivity(
        task_id=task_id,
        project_id=data.project_id or task.project_id,
        milestone_id=data.milestone_id or task.milestone_id,
        user_id=current_user.id,
        event_type=data.event_type,
        metadata_=safe_metadata,
    )
    db.add(activity)
    await db.commit()

    stmt = (
        select(ExecutionActivity)
        .options(selectinload(ExecutionActivity.user))
        .where(ExecutionActivity.id == activity.id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


# --- Task Files Endpoints ---

@router.get("/{task_id}/files", response_model=List[TaskFileResponse])
async def list_task_files(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    stmt = (
        select(TaskFile)
        .where(TaskFile.task_id == task_id)
        .order_by(TaskFile.created_at.desc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/{task_id}/files", response_model=TaskFileResponse, status_code=status.HTTP_201_CREATED)
async def create_task_file(
    task_id: UUID,
    data: TaskFileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    tf = TaskFile(
        task_id=task_id,
        user_id=data.user_id or current_user.id,
        file_url=data.file_url,
        file_type=data.file_type,
        file_name=data.file_name,
        file_size=data.file_size,
        mime_type=data.mime_type,
        storage_path=data.storage_path,
    )
    db.add(tf)
    await db.commit()
    await db.refresh(tf)
    return tf


@router.delete("/files/{file_id}")
async def delete_task_file(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TaskFile).where(TaskFile.id == file_id)
    res = await db.execute(stmt)
    tf = res.scalar_one_or_none()
    if not tf:
        raise HTTPException(status_code=404, detail="File not found")
    await db.delete(tf)
    await db.commit()
    return {"message": "Task file deleted"}


# --- Task Voice Notes Endpoints ---

@router.get("/{task_id}/voice-notes", response_model=List[TaskVoiceNoteResponse])
async def list_task_voice_notes(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    stmt = (
        select(TaskVoiceNote)
        .where(TaskVoiceNote.task_id == task_id)
        .order_by(TaskVoiceNote.note_number.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/{task_id}/voice-notes", response_model=TaskVoiceNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_task_voice_note(
    task_id: UUID,
    data: TaskVoiceNoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_by_id(db, task_id, current_user)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    tvn = TaskVoiceNote(
        task_id=task_id,
        creator_id=data.creator_id or current_user.id,
        storage_path=data.storage_path,
        display_name=data.display_name,
        note_number=data.note_number,
        duration_seconds=data.duration_seconds,
        mime_type=data.mime_type or "audio/m4a",
        file_size=data.file_size or 0,
    )
    db.add(tvn)
    await db.commit()
    await db.refresh(tvn)
    return tvn


@router.delete("/voice-notes/{note_id}")
async def delete_task_voice_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TaskVoiceNote).where(TaskVoiceNote.id == note_id)
    res = await db.execute(stmt)
    tvn = res.scalar_one_or_none()
    if not tvn:
        raise HTTPException(status_code=404, detail="Voice note not found")

    # Authorize deletion: Creator of voice note, task creator, Founder, or Super Admin
    if current_user.role != "Super Admin":
        task = await task_service.get_task_by_id(db, tvn.task_id, current_user)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if tvn.creator_id != current_user.id and task.created_by != current_user.id and current_user.role != "Founder":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this voice note",
            )

    await db.delete(tvn)
    await db.commit()
    return {"message": "Task voice note deleted"}


# --- Task Comments Endpoints ---

@router.get("/{task_id}/comments", response_model=List[CommentResponse])
async def list_task_comments(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Authoritatively retrieves comments for an authorized task."""
    return await task_service.get_task_comments(db, task_id, current_user)


@router.post("/{task_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_task_comment(
    task_id: UUID,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new comment on an authorized task and broadcasts realtime update."""
    return await task_service.create_task_comment(db, task_id, current_user, data.content)


@router.api_route("/{task_id}/comments/{comment_id}", methods=["PATCH", "PUT"], response_model=CommentResponse)
async def update_task_comment(
    task_id: UUID,
    comment_id: UUID,
    data: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates an existing comment (comment author, Founder, or Super Admin)."""
    return await task_service.update_task_comment(db, task_id, comment_id, current_user, data.content)


@router.delete("/{task_id}/comments/{comment_id}")
async def delete_task_comment(
    task_id: UUID,
    comment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deletes an existing comment (comment author, Founder, or Super Admin)."""
    return await task_service.delete_task_comment(db, task_id, comment_id, current_user)



