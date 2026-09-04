from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, text
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.task import Task, TaskAssignee, ExecutionActivity
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, SubtaskCreateItem


class TaskService:
    @staticmethod
    async def can_assign(
        db: AsyncSession, assigner: User, assignee_id: UUID
    ) -> bool:
        """Enforces ZeroTask hierarchical task assignment rules."""
        if assigner.role in ["Founder", "Super Admin"]:
            return True

        stmt = select(User).where(User.id == assignee_id, User.is_active == True)
        res = await db.execute(stmt)
        assignee = res.scalar_one_or_none()

        if not assignee:
            return False

        # Department Heads can assign to Managers and Employees in their department
        if assigner.role == "Department Head":
            return (
                assigner.department_id == assignee.department_id
                and assignee.role in ["Manager", "Employee", "Execution Team"]
            )

        # Managers can assign only to Employees/Execution Team in their department
        if assigner.role == "Manager":
            return (
                assigner.department_id == assignee.department_id
                and assignee.role in ["Employee", "Execution Team"]
            )

        # Employees can only assign to themselves (self-assign)
        if assigner.role in ["Employee", "Execution Team"]:
            return assigner.id == assignee_id

        return False

    @staticmethod
    async def create_task(
        db: AsyncSession, current_user: User, data: TaskCreate
    ) -> Task:
        # Validate primary assignee if provided
        target_user_id = data.user_id or current_user.id
        can_do = await TaskService.can_assign(db, current_user, target_user_id)
        if not can_do:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Role hierarchy violation: caller cannot assign task to target user",
            )

        # Validate additional assignees
        all_assignees = list(set([target_user_id] + (data.assignee_ids or [])))
        for a_id in all_assignees:
            if not await TaskService.can_assign(db, current_user, a_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Role hierarchy violation for assignee {a_id}",
                )

        new_task = Task(
            title=data.title,
            description=data.description,
            status=data.status,
            priority=data.priority,
            due_date=data.due_date,
            user_id=target_user_id,
            created_by=current_user.id,
            department_id=data.department_id or current_user.department_id,
            company_id=current_user.company_id,
            project_id=data.project_id,
            parent_task_id=data.parent_task_id,
            milestone_id=data.milestone_id,
            progress=data.progress,
            execution_classification=data.execution_classification,
            is_private=data.is_private,
        )
        db.add(new_task)
        await db.flush()

        # Insert joint assignees
        for a_id in all_assignees:
            db.add(TaskAssignee(task_id=new_task.id, user_id=a_id))

        # Log initial creation activity
        activity = ExecutionActivity(
            task_id=new_task.id,
            user_id=current_user.id,
            event_type="TASK_CREATED",
            metadata_={"title": new_task.title, "priority": new_task.priority},
        )
        db.add(activity)

        await db.commit()
        await db.refresh(new_task)
        return new_task

    @staticmethod
    async def get_task_by_id(
        db: AsyncSession, task_id: UUID, current_user: User
    ) -> Optional[Task]:
        stmt = (
            select(Task)
            .options(
                selectinload(Task.assignee),
                selectinload(Task.creator),
                selectinload(Task.assignees).selectinload(TaskAssignee.user),
                selectinload(Task.files),
                selectinload(Task.voice_notes),
            )
            .where(Task.id == task_id)
        )
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()

        if not task:
            return None

        # Enforce Company Isolation
        if current_user.role != "Super Admin" and task.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-company access denied",
            )

        # Enforce Private Task Visibility (Only creator, or super admin/founder if not private)
        if task.is_private and task.created_by != current_user.id and current_user.role != "Founder":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to private task",
            )

        return task

    @staticmethod
    async def update_task(
        db: AsyncSession, task_id: UUID, current_user: User, data: TaskUpdate
    ) -> Task:
        task = await TaskService.get_task_by_id(db, task_id, current_user)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Completed task modification protection
        if task.status == "Done" and data.status != "Done" and current_user.role not in ["Founder", "Super Admin"]:
            pass  # Reopening task permitted
        elif task.status == "Done" and current_user.role not in ["Founder", "Super Admin"]:
            # Updating other fields when already done is blocked
            if any([data.title, data.description, data.priority, data.due_date]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Completed tasks cannot be modified without reopening",
                )

        update_dict = data.model_dump(exclude_unset=True)

        # Auto-sync progress to 100 when marked Done
        if update_dict.get("status") == "Done":
            update_dict["progress"] = 100

        for key, val in update_dict.items():
            setattr(task, key, val)

        # Log activity
        activity = ExecutionActivity(
            task_id=task.id,
            user_id=current_user.id,
            event_type="TASK_UPDATED",
            metadata_=update_dict,
        )
        db.add(activity)

        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def segregate_task(
        db: AsyncSession, task_id: UUID, current_user: User, child_tasks: List[SubtaskCreateItem]
    ) -> Dict[str, Any]:
        """Atomic task segregation into child subtasks."""
        parent = await TaskService.get_task_by_id(db, task_id, current_user)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent task not found")

        caller_id = current_user.id
        parent_id = parent.id
        company_id = parent.company_id
        department_id = parent.department_id

        created_subtasks = []
        for c in child_tasks:
            sub = Task(
                title=c.title,
                description=c.description,
                priority=c.priority,
                due_date=c.due_date,
                user_id=c.assignee_id,
                created_by=caller_id,
                parent_task_id=parent_id,
                company_id=company_id,
                department_id=department_id,
                status="To Do",
            )
            db.add(sub)
            created_subtasks.append(sub)

        parent.status = "In Progress"
        await db.flush()

        child_ids = [str(s.id) for s in created_subtasks]
        await db.commit()
        return {
            "success": True,
            "created_count": len(created_subtasks),
            "child_task_ids": child_ids,
        }


task_service = TaskService()
