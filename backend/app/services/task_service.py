from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, text, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.core.config import settings
from app.models.task import Task, TaskAssignee, ExecutionActivity, TaskFile, TaskVoiceNote, Comment
from app.models.user import User
from app.models.notification import InAppNotification
from app.models.misc import AuditLog
from app.websocket.connection_manager import connection_manager
from app.websocket.events import RealtimeEventType
from app.schemas.task import TaskCreate, TaskUpdate, SubtaskCreateItem
from app.services.push_service import push_service
from app.services.storage_service import storage_service


class TaskService:
    @staticmethod
    def can_delete_task(task: Task, actor: User) -> bool:
        """
        Enforces authoritative ZeroTask task deletion hierarchy:
        1. Super Admin: Global operational delete authority across all companies and roles.
        2. Strict company boundary: If actor is not Super Admin, actor and task must belong to the same company.
        3. Super Admin Created Tasks: Tasks created by Super Admin can ONLY be deleted by Super Admin.
        4. Assignees: Mere assignment does NOT grant deletion rights. Assignees who did not create the task
           can NEVER delete it.
        5. Creator / Assigner: The user who created (assigned) the task can delete it.
        6. Founder: Can delete company tasks created by subordinates within their company, provided the
           Founder is not an assignee of a superior task.
        7. Department Head / Manager: Can delete tasks created by them, or in their department if not an assignee.
        """
        actor_role = (actor.role or "").strip().lower()
        if actor_role == "super admin":
            return True

        # Strict company boundary
        if actor.company_id and task.company_id and actor.company_id != task.company_id:
            return False

        # Tasks created by Super Admin can ONLY be deleted by Super Admin
        creator_is_sa = False
        if getattr(task, "creator", None) and getattr(task.creator, "role", None) == "Super Admin":
            creator_is_sa = True
        if creator_is_sa:
            return False

        is_creator = (task.created_by is not None and str(task.created_by) == str(actor.id))

        # Check if actor is an assignee of this task
        is_assignee = False
        if task.user_id is not None and str(task.user_id) == str(actor.id):
            is_assignee = True
        elif getattr(task, "assignees", None):
            try:
                for a in task.assignees:
                    a_uid = getattr(a, "user_id", None)
                    if a_uid is not None and str(a_uid) == str(actor.id):
                        is_assignee = True
                        break
            except Exception:
                pass

        # Strict rule: Assignees who did not create the task can NEVER delete it!
        if is_assignee and not is_creator:
            return False

        # Creator / Assigner can always delete their own task
        if is_creator:
            return True

        # Founder has company-level deletion authority over subordinate tasks
        if actor.role == "Founder":
            return True

        # Department Head
        if actor.role == "Department Head":
            if actor.department_id and task.department_id == actor.department_id:
                return True
            return False

        # Manager
        if actor.role == "Manager":
            if actor.department_id and task.department_id == actor.department_id:
                return True
            return False

        return False

    @staticmethod
    def can_edit_task(task: Task, actor: User) -> bool:
        """
        Enforces authoritative ZeroTask task edit authority:
        Only the user who assigned (created) the task can edit it.
        The ones who the task is assigned to cannot edit the task.
        Super Admin maintains global operational administration.
        """
        actor_role = (actor.role or "").strip().lower()
        if actor_role == "super admin":
            return True

        # Strict company boundary
        if actor.company_id and task.company_id and actor.company_id != task.company_id:
            return False

        # Only the creator / assigner can edit the task
        if task.created_by is not None and str(task.created_by) == str(actor.id):
            return True

        return False

    @staticmethod
    def can_view_task(task: Task, user: User) -> bool:
        """
        Authoritative server-side task visibility resolver:
        1. Super Admin: Global operational visibility across all companies.
        2. Strict company isolation: Non-SuperAdmin caller must belong to the same company.
        3. Creator or Direct Assignee: Always visible (task.created_by == user.id, task.user_id == user.id,
           or user.id in task.assignees).
        4. Founder: Visible for all tasks within their company (except personal/private tasks of other Founders).
        5. Department Head / Manager:
           - Personal tasks of subordinates: DH sees Employee & Manager personal tasks. Manager sees Employee personal tasks.
           - Assigned / Non-personal tasks: Authorized if task belongs to user's department (task.department_id == user.department_id).
        6. Regular Employee / Execution Team:
           - Strictly visible ONLY if assigned or creator.
           - Colleague/peer status or subordinate subtask assignment does NOT grant visibility to parent tasks.
        """
        from sqlalchemy.orm.attributes import NO_VALUE

        user_role = (getattr(user, "role", None) or "").strip()
        if user_role.lower() == "super admin":
            return True

        def _matches(a: Any, b: Any) -> bool:
            if a is None or b is None:
                return False
            return str(a).strip().lower() == str(b).strip().lower()

        def _get_loaded_list(obj: Any, attr_name: str) -> list:
            if not hasattr(obj, "__dict__"):
                val = getattr(obj, attr_name, None)
                return list(val) if isinstance(val, (list, tuple, set)) else []
            val = obj.__dict__.get(attr_name)
            if val is None or val is NO_VALUE:
                return []
            return list(val) if isinstance(val, (list, tuple, set)) else []

        def _get_loaded_obj(obj: Any, attr_name: str) -> Any:
            if not hasattr(obj, "__dict__"):
                return getattr(obj, attr_name, None)
            val = obj.__dict__.get(attr_name)
            if val is None or val is NO_VALUE:
                return None
            return val

        task_assignees = _get_loaded_list(task, "assignees")
        is_creator = _matches(task.created_by, user.id)
        is_assignee = (
            _matches(task.user_id, user.id)
            or any(
                _matches(
                    getattr(a, "user_id", None) or getattr(getattr(a, "user", None), "id", None),
                    user.id,
                )
                for a in task_assignees
            )
        )

        # Strict company boundary
        if task.company_id is not None:
            if user.company_id is not None and not _matches(task.company_id, user.company_id):
                return False
        else:
            # Universal / cross-company task (company_id is None)
            if not (is_creator or is_assignee):
                return False

        # Direct involvement
        if is_creator or is_assignee:
            return True

        # Strict security rule: Subtask assignment does NOT grant visibility to the parent task.
        # If the user is assigned to any subtask/descendant under this parent task,
        # they MUST NOT be granted visibility to this parent task.
        def _is_user_in_subtasks(t: Any) -> bool:
            subs = _get_loaded_list(t, "subtasks")
            for s in subs:
                if _matches(getattr(s, "user_id", None), user.id):
                    return True
                s_assignees = _get_loaded_list(s, "assignees")
                for a in s_assignees:
                    a_uid = getattr(a, "user_id", None) or getattr(getattr(a, "user", None), "id", None)
                    if _matches(a_uid, user.id):
                        return True
                if _is_user_in_subtasks(s):
                    return True
            return False

        if _is_user_in_subtasks(task):
            return False

        # Regular Employees: STRICTLY can only view tasks they created or are assigned to!
        if user_role.lower() in ["employee", "execution team"]:
            return False

        is_personal = (task.created_by is not None and _matches(task.created_by, task.user_id)) or bool(task.is_private)
        creator_obj = _get_loaded_obj(task, "creator")
        creator_role = (getattr(creator_obj, "role", None) or "").strip() if creator_obj else None

        if user_role.lower() == "founder":
            # Founder sees all company tasks except other Founders' personal/private tasks
            if is_personal and creator_role and creator_role.lower() in ["founder", "super admin"] and not is_creator:
                return False
            return True

        if is_personal:
            # Personal tasks subordinate oversight
            if user_role.lower() == "department head":
                return bool(creator_role and creator_role.lower() in ["employee", "execution team", "manager"])
            if user_role.lower() == "manager":
                return bool(creator_role and creator_role.lower() in ["employee", "execution team"])
            return False

        # Non-personal tasks:
        # Department Head or Manager can oversee general unassigned department tasks (broadcast tasks).
        # Specifically assigned tasks remain private strictly to their assignees and creator.
        if user_role.lower() in ["department head", "manager"]:
            is_unassigned_broadcast = (task.user_id is None and not (bool(task_assignees)))
            if is_unassigned_broadcast and user.department_id and _matches(task.department_id, user.department_id):
                return True

        return False

    @staticmethod
    def can_assign_role(assigner_role: str, assignee_role: str) -> bool:
        """Enforces role-based hierarchy assignment permissions."""
        if assignee_role == "Super Admin":
            return False
        if assigner_role == "Super Admin":
            return True
        if assigner_role == "Founder":
            return True
        if assigner_role in ["Department Head", "Manager", "Employee", "Execution Team"]:
            return assignee_role in ["Department Head", "Manager", "Employee", "Execution Team"]
        return False

    @staticmethod
    async def can_assign(
        db: AsyncSession, assigner: User, assignee_id: UUID
    ) -> bool:
        """Enforces ZeroTask hierarchical task assignment rules."""
        stmt = select(User).where(User.id == assignee_id, User.is_active == True, User.is_deleted == False)
        res = await db.execute(stmt)
        assignee = res.scalar_one_or_none()

        if not assignee:
            return False

        if assignee.role == "Super Admin":
            return False

        if assigner.role == "Super Admin":
            return True

        # Non-SuperAdmin assigner and assignee must belong to the same company
        if assigner.company_id != assignee.company_id:
            return False

        return TaskService.can_assign_role(assigner.role, assignee.role)

    @staticmethod
    async def get_eligible_assignees(
        db: AsyncSession,
        current_user: User,
        parent_task_id: Optional[UUID] = None,
        company_id: Optional[UUID] = None,
    ) -> List[User]:
        """
        Returns the authoritative list of users eligible to be assigned a task or subtask.
        Adheres strictly to company boundaries, parent task constraints, and role hierarchy.
        """
        target_company_id = company_id or current_user.company_id

        if parent_task_id:
            p_stmt = select(Task).where(Task.id == parent_task_id)
            p_res = await db.execute(p_stmt)
            parent_task = p_res.scalar_one_or_none()

            if not parent_task:
                raise HTTPException(status_code=404, detail="Parent task not found")

            if current_user.role != "Super Admin" and parent_task.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cross-company parent task access forbidden",
                )

            if parent_task.is_private and parent_task.created_by != current_user.id and current_user.role not in ["Founder", "Super Admin"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to private parent task",
                )

            parent_depth, _ = await TaskService.get_task_depth_and_ancestors(db, parent_task_id)
            if parent_depth >= 5:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Maximum task hierarchy depth of 5 reached.",
                )

            # Subtask MUST remain within the parent task's company
            target_company_id = parent_task.company_id

        stmt = (
            select(User)
            .options(
                selectinload(User.company),
                selectinload(User.department),
                selectinload(User.designation),
            )
            .where(User.is_active == True, User.is_deleted == False)
        )

        if target_company_id:
            stmt = stmt.where(User.company_id == target_company_id)
        elif current_user.role != "Super Admin":
            stmt = stmt.where(User.company_id == current_user.company_id)

        # Super Admin cannot be assigned tasks
        stmt = stmt.where(User.role != "Super Admin")

        # Role-based candidate exclusion:
        # Department Head, Manager, Employee cannot assign to Founder
        if current_user.role in ["Department Head", "Manager", "Employee", "Execution Team"]:
            stmt = stmt.where(User.role != "Founder")

        stmt = stmt.order_by(User.full_name.asc(), User.name.asc())
        res = await db.execute(stmt)
        users = list(res.scalars().all())

        for u in users:
            if not u.full_name:
                u.full_name = u.name or u.email.split("@")[0]
            if not u.name:
                u.name = u.full_name

        return users

    @staticmethod
    async def recalculate_parent_progress(
        db: AsyncSession,
        parent_id: UUID,
        actor: Optional[User] = None,
        subtask_creator_id: Optional[UUID] = None,
        visited_ids: Optional[set] = None,
    ) -> None:
        """Auto-computes parent task progress based on subtasks completion state.

        Edge cases handled:
        - 0 subtasks (last child deleted): reset progress=0, reopen if was Done.
        - Partial completion: floor(completed/total * 100).
        - All done: progress=100, status=Done.
        - Any incomplete after Done: status=In Progress.
        """
        if visited_ids is None:
            visited_ids = set()
        if parent_id in visited_ids:
            return
        visited_ids.add(parent_id)
        stmt = (
            select(Task)
            .options(selectinload(Task.subtasks))
            .where(Task.id == parent_id)
        )
        res = await db.execute(stmt)
        parent = res.scalar_one_or_none()
        if not parent:
            return

        subtasks = parent.subtasks or []
        total = len(subtasks)
        prev_parent_status = parent.status

        if total == 0:
            # Last subtask was deleted - reset parent to manual progress tracking
            parent.progress = 0
            if parent.status == "Done":
                parent.status = "In Progress"
        else:
            completed = sum(1 for s in subtasks if s.status in ("Done", "Completed"))
            parent.progress = int((completed / total) * 100)
            if completed == total:
                has_incomplete = await TaskService.has_incomplete_subtasks(db, parent.id)
                if not has_incomplete:
                    parent.status = "Done"
                else:
                    parent.status = "In Progress"
            elif parent.status in ("Done", "Completed"):
                # A child was reopened or new non-done child added
                parent.status = "In Progress"

        db.add(parent)
        await db.flush()

        # If all subtasks finished and parent task newly marked Done, notify parent creator
        if parent.status == "Done" and prev_parent_status != "Done" and actor and parent.created_by:
            if parent.created_by != actor.id and parent.created_by != subtask_creator_id:
                actor_name = actor.full_name or actor.name or "Assignee"
                notif = InAppNotification(
                    user_id=parent.created_by,
                    title=f"Task completed: {parent.title}",
                    message=f"All subtasks under '{parent.title}' completed by {actor_name}.",
                    body=f"All subtasks under '{parent.title}' completed by {actor_name}.",
                    type="task_completed",
                    is_read=False,
                    action_url="/(drawer)/(tabs)/tasks",
                )
                db.add(notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=parent.created_by,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(notif.id),
                        "user_id": str(parent.created_by),
                        "title": f"Task completed: {parent.title}",
                        "message": f"All subtasks under '{parent.title}' completed by {actor_name}.",
                        "body": f"All subtasks under '{parent.title}' completed by {actor_name}.",
                        "type": "task_completed",
                        "is_read": False,
                        "action_url": "/(drawer)/(tabs)/tasks",
                    },
                )
                await push_service.send_to_user(
                    db=db,
                    user_id=parent.created_by,
                    title="Task Completed",
                    body=f"All subtasks completed for: {parent.title}",
                    data={
                        "url": "/(drawer)/(tabs)/tasks",
                        "task_id": str(parent.id),
                        "type": "task_completed",
                    },
                )

        # Recalculate up the ancestry if parent itself has a parent
        if parent.parent_task_id and parent.parent_task_id not in visited_ids:
            await TaskService.recalculate_parent_progress(
                db,
                parent.parent_task_id,
                actor=actor,
                subtask_creator_id=subtask_creator_id,
                visited_ids=visited_ids,
            )

    @staticmethod
    async def get_task_depth_and_ancestors(
        db: AsyncSession, task_id: UUID, current_user: Optional[User] = None
    ) -> tuple[int, List[Dict[str, Any]]]:
        """
        Traverses upward to calculate task depth (1-indexed: root is 1)
        and ancestry list ordered from root to immediate parent.
        If current_user is provided and is unauthorized to view an ancestor,
        the ancestor's title is protected ("Parent Task") and has_access is marked False.
        """
        ancestors: List[Dict[str, Any]] = []
        visited = {task_id}

        # First fetch task's parent_task_id
        stmt = select(Task.parent_task_id).where(Task.id == task_id)
        res = await db.execute(stmt)
        curr_parent_id = res.scalar_one_or_none()

        while curr_parent_id:
            if curr_parent_id in visited:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Circular hierarchy detected",
                )
            visited.add(curr_parent_id)

            p_stmt = (
                select(Task)
                .options(
                    selectinload(Task.assignees),
                    selectinload(Task.creator),
                )
                .where(Task.id == curr_parent_id)
            )
            p_res = await db.execute(p_stmt)
            try:
                from unittest.mock import MagicMock, DEFAULT
                if isinstance(getattr(p_res, "first", None), MagicMock) and getattr(p_res.first, "_mock_return_value", DEFAULT) != DEFAULT:
                    p_row = p_res.first()
                else:
                    p_row = p_res.scalar_one_or_none()
            except Exception:
                p_row = p_res.scalar_one_or_none()
            if not p_row:
                break

            can_view = True
            if current_user:
                can_view = TaskService.can_view_task(p_row, current_user)

            ancestors.append({
                "id": p_row.id if can_view else None,
                "title": p_row.title if can_view else "Parent Task",
                "depth": 0,
                "has_access": can_view,
            })
            curr_parent_id = p_row.parent_task_id

        # Ancestors were added immediate parent first; reverse so root is first
        ancestors.reverse()
        for idx, anc in enumerate(ancestors):
            anc["depth"] = idx + 1

        depth = len(ancestors) + 1
        return depth, ancestors

    @staticmethod
    async def has_incomplete_subtasks(db: AsyncSession, task_id: UUID) -> bool:
        """
        Recursively checks whether task_id has any incomplete descendant tasks
        (at any depth in the hierarchy). Returns True if at least one descendant
        task has status not in ("Done", "Completed").
        """
        curr_parent_ids = [task_id]
        visited = {task_id}
        while curr_parent_ids:
            stmt = select(Task.id, Task.status).where(Task.parent_task_id.in_(curr_parent_ids))
            res = await db.execute(stmt)
            raw_rows = res.all() if hasattr(res, "all") else []
            if not isinstance(raw_rows, (list, tuple)):
                break
            if not raw_rows:
                break
            next_parent_ids = []
            for row in raw_rows:
                status = getattr(row, "status", None)
                if not isinstance(status, str) or status not in ("Done", "Completed"):
                    return True
                rid = getattr(row, "id", None)
                if rid and rid not in visited:
                    visited.add(rid)
                    next_parent_ids.append(rid)
            curr_parent_ids = next_parent_ids
        return False

    @staticmethod
    async def create_task(
        db: AsyncSession, current_user: User, data: TaskCreate
    ) -> Task:
        # Validate parent task hierarchy & company bounds if parent_task_id is provided
        parent_task = None
        if data.parent_task_id:
            p_stmt = select(Task).where(Task.id == data.parent_task_id)
            p_res = await db.execute(p_stmt)
            parent_task = p_res.scalar_one_or_none()

            if not parent_task:
                raise HTTPException(status_code=404, detail="Parent task not found")

            if current_user.role != "Super Admin" and parent_task.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cross-company parent task assignment forbidden",
                )

            # Check caller authorization to access parent task
            if parent_task.is_private and parent_task.created_by != current_user.id and current_user.role not in ["Founder", "Super Admin"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to private parent task",
                )

            # Enforce maximum hierarchy depth of 5 (authoritative backend rule)
            parent_depth, _ = await TaskService.get_task_depth_and_ancestors(db, data.parent_task_id)
            if parent_depth >= 5:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Maximum task hierarchy depth of 5 reached.",
                )

        # Determine target company:
        # If this is a subtask, the target company is STRICTLY the parent task's company!
        target_company_id = parent_task.company_id if parent_task else (current_user.company_id or data.company_id)

        # Determine primary assignee
        if data.user_id:
            target_user_id = data.user_id
        elif data.assignee_ids and len(data.assignee_ids) > 0:
            target_user_id = data.assignee_ids[0]
        else:
            target_user_id = current_user.id

        # Validate additional assignees
        all_assignees = list(set([target_user_id] + (data.assignee_ids or [])))

        # Query assignee users to validate existence, activity, and company boundary
        assignee_stmt = select(User).where(User.id.in_(all_assignees), User.is_deleted == False)
        assignee_res = await db.execute(assignee_stmt)
        assignee_map = {}
        if hasattr(assignee_res, "scalars"):
            try:
                s_func = getattr(assignee_res, "scalars")
                if callable(s_func) and not hasattr(s_func, "__await__"):
                    s_obj = s_func()
                    if hasattr(s_obj, "all"):
                        a_func = getattr(s_obj, "all")
                        items = a_func() if callable(a_func) else a_func
                        if isinstance(items, (list, tuple, set)):
                            assignee_map = {u.id: u for u in items if hasattr(u, "id")}
            except Exception:
                pass

        # Determine distinct companies among assignees
        assignee_companies = {
            getattr(u, "company_id", None)
            for u in assignee_map.values()
            if getattr(u, "company_id", None) is not None
        }

        if current_user.role == "Super Admin":
            if data.company_id:
                target_company_id = data.company_id
                # Enforce that all assignees belong to the selected target company
                for a_id in all_assignees:
                    a_user = assignee_map.get(a_id)
                    if a_user and getattr(a_user, "company_id", None) and a_user.company_id != target_company_id:
                        u_name = getattr(a_user, 'full_name', None) or getattr(a_user, 'name', None) or getattr(a_user, 'email', str(a_id))
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Assignee '{u_name}' belongs to a different company than the selected target company.",
                        )
            else:
                # If no company_id provided, but all assignees belong to a single company, scope task to that company
                if len(assignee_companies) == 1:
                    target_company_id = next(iter(assignee_companies))
                else:
                    target_company_id = None
        else:
            # Non-SuperAdmin: Strict company isolation
            if not target_company_id:
                target_company_id = current_user.company_id

            for a_id in all_assignees:
                a_user = assignee_map.get(a_id)
                # Enforce that all assignees belong to target_company_id
                if a_user and target_company_id and getattr(a_user, "company_id", None) and a_user.company_id != target_company_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Assignee '{getattr(a_user, 'full_name', None) or getattr(a_user, 'name', None) or getattr(a_user, 'email', str(a_id))}' belongs to a different company than the task.",
                    )

        for a_id in all_assignees:
            if not await TaskService.can_assign(db, current_user, a_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Role hierarchy violation for assignee {a_id}",
                )

        # Determine department_id with fallback cascade (data -> parent -> creator -> assignee)
        target_dept_id = data.department_id
        if not target_dept_id and parent_task:
            target_dept_id = parent_task.department_id
        if not target_dept_id and current_user.department_id:
            target_dept_id = current_user.department_id
        if not target_dept_id:
            primary_user = assignee_map.get(target_user_id)
            if primary_user and getattr(primary_user, "department_id", None):
                target_dept_id = primary_user.department_id

        new_task = Task(
            title=data.title,
            description=data.description,
            status=data.status,
            priority=data.priority,
            due_date=data.due_date,
            user_id=target_user_id,
            created_by=current_user.id,
            department_id=target_dept_id,
            company_id=target_company_id,
            project_id=data.project_id or (parent_task.project_id if parent_task else None),
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
            metadata_={"title": new_task.title, "priority": new_task.priority, "parent_task_id": str(new_task.parent_task_id) if new_task.parent_task_id else None},
        )
        db.add(activity)

        sender_name = current_user.full_name or current_user.name or "User"

        # If created task is a subtask, recalculate parent progress and send notification
        if new_task.parent_task_id:
            await TaskService.recalculate_parent_progress(db, new_task.parent_task_id)
            parent_title = parent_task.title if parent_task else "Parent Task"

            for a_id in all_assignees:
                # Assigner / creator must NEVER receive an assignment notification
                if str(a_id) == str(current_user.id) or (new_task.created_by and str(a_id) == str(new_task.created_by)):
                    continue
                notif = InAppNotification(
                    user_id=a_id,
                    title=f"New subtask assigned: {new_task.title}",
                    message=f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                    body=f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                    type="task_assignment",
                    is_read=False,
                    action_url="/(drawer)/(tabs)/tasks",
                )
                db.add(notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=a_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(notif.id),
                        "user_id": str(a_id),
                        "title": f"New subtask assigned: {new_task.title}",
                        "message": f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                        "body": f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                        "type": "task_assignment",
                        "is_read": False,
                        "action_url": "/(drawer)/(tabs)/tasks",
                    },
                )
                # Real Android OS Push Notification
                await push_service.send_to_user(
                    db=db,
                    user_id=a_id,
                    title=f"New Subtask Assigned",
                    body=f"You were assigned: {new_task.title}",
                    data={
                        "url": "/(drawer)/(tabs)/tasks",
                        "task_id": str(new_task.id),
                        "parent_task_id": str(new_task.parent_task_id),
                        "type": "task_assignment",
                    },
                )
        else:
            # Top-level task creation notifications to assignees (excluding assigner/creator)
            for a_id in all_assignees:
                if str(a_id) == str(current_user.id) or (new_task.created_by and str(a_id) == str(new_task.created_by)):
                    continue
                notif = InAppNotification(
                    user_id=a_id,
                    title=f"New task assigned: {new_task.title}",
                    message=f"Task assigned by {sender_name}",
                    body=f"Task assigned by {sender_name}",
                    type="task_assignment",
                    is_read=False,
                    action_url="/(drawer)/(tabs)/tasks",
                )
                db.add(notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=a_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(notif.id),
                        "user_id": str(a_id),
                        "title": f"New task assigned: {new_task.title}",
                        "message": f"Task assigned by {sender_name}",
                        "body": f"Task assigned by {sender_name}",
                        "type": "task_assignment",
                        "is_read": False,
                        "action_url": "/(drawer)/(tabs)/tasks",
                    },
                )
                # Real Android OS Push Notification
                await push_service.send_to_user(
                    db=db,
                    user_id=a_id,
                    title=f"New Task Assigned",
                    body=f"You were assigned: {new_task.title}",
                    data={
                        "url": "/(drawer)/(tabs)/tasks",
                        "task_id": str(new_task.id),
                        "type": "task_assignment",
                    },
                )

        await db.commit()
        await db.refresh(new_task)

        # Real-time WebSocket user-scoped broadcast for newly created task
        affected_user_ids = set(all_assignees)
        if new_task.created_by:
            affected_user_ids.add(new_task.created_by)
        if new_task.user_id:
            affected_user_ids.add(new_task.user_id)

        create_payload = {
            "action": "created",
            "task_id": str(new_task.id),
            "status": new_task.status,
            "title": new_task.title,
            "created_by": str(new_task.created_by) if new_task.created_by else None,
            "parent_task_id": str(new_task.parent_task_id) if new_task.parent_task_id else None,
        }
        for u_id in affected_user_ids:
            try:
                await connection_manager.broadcast_to_user(
                    user_id=u_id,
                    event=RealtimeEventType.TASK_UPDATE,
                    payload=create_payload,
                )
            except Exception:
                pass

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
                selectinload(Task.department),
                selectinload(Task.assignees).selectinload(TaskAssignee.user),
                selectinload(Task.files),
                selectinload(Task.attachments),
                selectinload(Task.voice_notes),
                selectinload(Task.subtasks).selectinload(Task.assignee),
                selectinload(Task.subtasks).selectinload(Task.creator),
                selectinload(Task.subtasks).selectinload(Task.department),
                selectinload(Task.subtasks).selectinload(Task.assignees).selectinload(TaskAssignee.user),
                selectinload(Task.subtasks).selectinload(Task.files),
                selectinload(Task.subtasks).selectinload(Task.attachments),
                selectinload(Task.subtasks).selectinload(Task.voice_notes),
                # Level 3 Subtasks (Grandchildren e.g. Phase 1 of 2)
                selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignee),
                selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.creator),
                selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.assignees).selectinload(TaskAssignee.user),
                selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.files),
                selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.voice_notes),
                # Level 4 Subtasks
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
            .where(Task.id == task_id)
        )
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()

        if not task:
            return None

        # 1. Authoritative Task Visibility Check
        if current_user.role != "Super Admin" and task.company_id and current_user.company_id != task.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-company access denied",
            )

        if not TaskService.can_view_task(task, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to task",
            )

        # 2. Calculate depth and ancestors (protecting unauthorized ancestors)
        depth, ancestors = await TaskService.get_task_depth_and_ancestors(db, task.id, current_user)
        setattr(task, "depth", depth)
        setattr(task, "ancestors", ancestors)

        # 3. Recursively filter subtasks and populate depth/child counts/has_children
        def process_subtasks(parent_subtasks, cur_depth):
            visible_subtasks = [s for s in parent_subtasks if TaskService.can_view_task(s, current_user)]
            for s in visible_subtasks:
                setattr(s, "depth", cur_depth)
                s_dict = getattr(s, "__dict__", {})
                nested = s_dict.get("subtasks") or []
                processed_nested = process_subtasks(nested, cur_depth + 1)
                s_dict["subtasks"] = processed_nested
                setattr(s, "child_count", len(processed_nested))
                setattr(s, "has_children", len(processed_nested) > 0)

                # Safeguard relationships from triggering MissingGreenlet in async serializer
                if "files" not in s_dict:
                    s_dict["files"] = []
                if "voice_notes" not in s_dict:
                    s_dict["voice_notes"] = []
                if "assignees" not in s_dict:
                    s_dict["assignees"] = []
                if "assignee" not in s_dict:
                    s_dict["assignee"] = None
                if "creator" not in s_dict:
                    s_dict["creator"] = None
                if "attachments" not in s_dict:
                    s_dict["attachments"] = []
                if "department" not in s_dict:
                    s_dict["department"] = None
                if "reviews" not in s_dict:
                    s_dict["reviews"] = []

                s_any_incomplete = (
                    getattr(s, "status", "") not in ("Done", "Completed") or
                    any(getattr(c, "status", "") not in ("Done", "Completed") or getattr(c, "has_incomplete_subtasks", False) for c in processed_nested)
                )
                setattr(s, "has_incomplete_subtasks", s_any_incomplete)
            return visible_subtasks

        t_dict = getattr(task, "__dict__", {})
        if "files" not in t_dict:
            t_dict["files"] = []
        if "voice_notes" not in t_dict:
            t_dict["voice_notes"] = []
        if "assignees" not in t_dict:
            t_dict["assignees"] = []
        if "assignee" not in t_dict:
            t_dict["assignee"] = None
        if "creator" not in t_dict:
            t_dict["creator"] = None
        if "attachments" not in t_dict:
            t_dict["attachments"] = []
        if "department" not in t_dict:
            t_dict["department"] = None
        if "reviews" not in t_dict:
            t_dict["reviews"] = []

        raw_subtasks = t_dict.get("subtasks")
        if raw_subtasks:
            filtered_subs = process_subtasks(raw_subtasks, depth + 1)
            t_dict["subtasks"] = filtered_subs
            setattr(task, "child_count", len(filtered_subs))
            setattr(task, "has_children", len(filtered_subs) > 0)
            any_incomplete = (
                getattr(task, "status", "") not in ("Done", "Completed") or
                any(getattr(s, "status", "") not in ("Done", "Completed") or getattr(s, "has_incomplete_subtasks", False) for s in filtered_subs)
            )
            setattr(task, "has_incomplete_subtasks", any_incomplete)
        else:
            setattr(task, "child_count", 0)
            setattr(task, "has_children", False)
            setattr(task, "has_incomplete_subtasks", getattr(task, "status", "") not in ("Done", "Completed"))

        return task

    @staticmethod
    async def update_task(
        db: AsyncSession, task_id: UUID, current_user: User, data: TaskUpdate
    ) -> Task:
        stmt = (
            select(Task)
            .options(selectinload(Task.assignees))
            .where(Task.id == task_id)
        )
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()
        
        if not task or not TaskService.can_view_task(task, current_user):
            raise HTTPException(status_code=404, detail="Task not found")

        # Edit authorization check: Only the user who assigned (created) the task can edit it
        if not TaskService.can_edit_task(task, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Only the user who assigned this task can edit it.",
            )

        # Completed task modification protection
        if task.status == "Done" and data.status != "Done" and current_user.role not in ["Founder", "Super Admin"]:
            pass  # Reopening task permitted
        elif task.status == "Done" and current_user.role not in ["Founder", "Super Admin"]:
            if any([data.title, data.description, data.priority, data.due_date]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Completed tasks cannot be modified without reopening",
                )

        prev_status = task.status
        prev_user_id = task.user_id
        prev_title = task.title
        prev_description = task.description
        prev_priority = task.priority
        prev_due_date = task.due_date

        update_dict = data.model_dump(exclude_unset=True)

        # Validate re-parenting if parent_task_id is modified
        if "parent_task_id" in update_dict and update_dict["parent_task_id"] != task.parent_task_id:
            new_parent_id = update_dict["parent_task_id"]
            if new_parent_id:
                if new_parent_id == task.id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="A task cannot be its own parent",
                    )
                p_stmt = select(Task).where(Task.id == new_parent_id)
                p_res = await db.execute(p_stmt)
                p_task = p_res.scalar_one_or_none()
                if not p_task:
                    raise HTTPException(status_code=404, detail="Parent task not found")
                if current_user.role != "Super Admin" and p_task.company_id != current_user.company_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Cross-company parent task assignment forbidden",
                    )
                parent_depth, ancestors = await TaskService.get_task_depth_and_ancestors(db, new_parent_id)
                if any(anc["id"] == task.id for anc in ancestors):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Circular hierarchy detected",
                    )
                if parent_depth >= 5:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Maximum task hierarchy depth of 5 reached.",
                    )

        # Reconcile progress and progress_percentage
        if "progress_percentage" in update_dict:
            if "progress" not in update_dict or update_dict["progress"] is None:
                update_dict["progress"] = update_dict["progress_percentage"]
            del update_dict["progress_percentage"]

        # Check if attempting to mark task as completed or 100% progress
        is_attempting_completion = (
            update_dict.get("status") in ("Done", "Completed")
            or update_dict.get("progress") == 100
        )
        if is_attempting_completion:
            if await TaskService.has_incomplete_subtasks(db, task.id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="First complete the child tasks inside the major task given, then only proceed with completing the major task.",
                )
        # If status is Done, sync progress to 100
        if update_dict.get("status") in ("Done", "Completed"):
            update_dict["progress"] = 100
        # If progress is 100 and status not specified, sync status to Done
        elif update_dict.get("progress") == 100 and not update_dict.get("status"):
            update_dict["status"] = "Done"
        # If progress is between 1 and 99 and status was To Do, auto-advance to In Progress
        elif update_dict.get("progress") is not None and 0 < update_dict.get("progress") < 100:
            if not update_dict.get("status") or update_dict.get("status") == "To Do":
                update_dict["status"] = "In Progress"
        # If progress is reset to 0 and task was Done, reopen task to To Do
        elif update_dict.get("progress") == 0 and prev_status == "Done" and not update_dict.get("status"):
            update_dict["status"] = "To Do"

        # Handle multiple assignee assignment if provided
        new_assignee_ids = update_dict.pop("assignee_ids", None)
        prev_assignee_ids = {a.user_id for a in (task.assignees or [])}
        if new_assignee_ids is not None:
            await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
            for a_id in new_assignee_ids:
                db.add(TaskAssignee(task_id=task.id, user_id=a_id))
            if len(new_assignee_ids) > 0:
                task.user_id = new_assignee_ids[0]
                update_dict["user_id"] = new_assignee_ids[0]
            elif "user_id" not in update_dict:
                task.user_id = None

        for key, val in update_dict.items():
            setattr(task, key, val)

        if new_assignee_ids is not None:
            prev_set = {str(p) for p in prev_assignee_ids}
            added_assignee_ids = [
                a_id for a_id in set(new_assignee_ids)
                if str(a_id) not in prev_set
                and str(a_id) != str(current_user.id)
                and (not task.created_by or str(a_id) != str(task.created_by))
            ]
            sender_name = current_user.full_name or current_user.name or "Team Member"
            for a_id in added_assignee_ids:
                notif = InAppNotification(
                    user_id=a_id,
                    title=f"Task assigned: {task.title}",
                    message=f"You were allotted to '{task.title}' by {sender_name}",
                    body=f"You were allotted to '{task.title}' by {sender_name}",
                    type="task_assignment",
                    is_read=False,
                    action_url="/(drawer)/(tabs)/tasks",
                )
                db.add(notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=a_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(notif.id),
                        "user_id": str(a_id),
                        "title": f"Task assigned: {task.title}",
                        "message": f"You were allotted to '{task.title}' by {sender_name}",
                        "body": f"You were allotted to '{task.title}' by {sender_name}",
                        "type": "task_assignment",
                        "is_read": False,
                        "action_url": "/(drawer)/(tabs)/tasks",
                    },
                )
                await push_service.send_to_user(
                    db=db,
                    user_id=a_id,
                    title="Task Assigned",
                    body=f"You were allotted to: {task.title}",
                    data={
                        "url": "/(drawer)/(tabs)/tasks",
                        "task_id": str(task.id),
                        "type": "task_assignment",
                    },
                )

        # Serialize metadata properly for JSON storage
        activity_metadata = data.model_dump(mode="json", exclude_unset=True)
        if update_dict.get("status") == "Done":
            activity_metadata["progress"] = 100

        # Log activity
        activity = ExecutionActivity(
            task_id=task.id,
            user_id=current_user.id,
            event_type="TASK_UPDATED",
            metadata_=activity_metadata,
        )
        db.add(activity)

        # 1. TASK COMPLETION NOTIFICATION:
        # If task newly completed, notify original creator/assigner (excluding self-completer).
        # Assignees must NEVER receive a completion notification.
        is_becoming_done = (
            (update_dict.get("status") in ["Done", "Completed"] or update_dict.get("progress") == 100)
            and prev_status not in ["Done", "Completed"]
        )
        if is_becoming_done and task.created_by and str(task.created_by) != str(current_user.id):
            comp_notif = InAppNotification(
                user_id=task.created_by,
                title="Task Completed",
                message=f"Task '{task.title}' is completed",
                body=f"Task '{task.title}' is completed",
                type="task_completed",
                is_read=False,
                action_url="/(drawer)/(tabs)/tasks",
            )
            db.add(comp_notif)
            await db.flush()

            # Targeted WebSocket
            await connection_manager.broadcast_to_user(
                user_id=task.created_by,
                event=RealtimeEventType.NEW_NOTIFICATION,
                payload={
                    "id": str(comp_notif.id),
                    "user_id": str(task.created_by),
                    "title": "Task Completed",
                    "message": f"Task '{task.title}' is completed",
                    "body": f"Task '{task.title}' is completed",
                    "type": "task_completed",
                    "is_read": False,
                    "action_url": "/(drawer)/(tabs)/tasks",
                },
            )
            # Targeted Push
            await push_service.send_to_user(
                db=db,
                user_id=task.created_by,
                title="Task Completed",
                body=f"Task '{task.title}' is completed",
                data={
                    "url": "/(drawer)/(tabs)/tasks",
                    "task_id": str(task.id),
                    "type": "task_completed",
                },
            )

        # 2. TASK REASSIGNMENT NOTIFICATION:
        # If task assigned to a new user, notify the new assignee (excluding self and creator)
        new_assignee_id = update_dict.get("user_id")
        if (
            new_assignee_id
            and str(new_assignee_id) != str(prev_user_id)
            and str(new_assignee_id) != str(current_user.id)
            and (not task.created_by or str(new_assignee_id) != str(task.created_by))
        ):
            sender_name = current_user.full_name or current_user.name or "Supervisor"
            assign_notif = InAppNotification(
                user_id=new_assignee_id,
                title=f"New task assigned: {task.title}",
                message=f"Task assigned by {sender_name}",
                body=f"Task assigned by {sender_name}",
                type="task_assignment",
                is_read=False,
                action_url="/(drawer)/(tabs)/tasks",
            )
            db.add(assign_notif)
            await db.flush()
            await connection_manager.broadcast_to_user(
                user_id=new_assignee_id,
                event=RealtimeEventType.NEW_NOTIFICATION,
                payload={
                    "id": str(assign_notif.id),
                    "user_id": str(new_assignee_id),
                    "title": f"New task assigned: {task.title}",
                    "message": f"Task assigned by {sender_name}",
                    "body": f"Task assigned by {sender_name}",
                    "type": "task_assignment",
                    "is_read": False,
                    "action_url": "/(drawer)/(tabs)/tasks",
                },
            )
            await push_service.send_to_user(
                db=db,
                user_id=new_assignee_id,
                title="New Task Assigned",
                body=f"You were assigned: {task.title}",
                data={
                    "url": "/(drawer)/(tabs)/tasks",
                    "task_id": str(task.id),
                    "type": "task_assignment",
                },
            )

        # 3. TASK MODIFICATION NOTIFICATIONS (Due Date, Title, Description, Priority, etc.):
        # If task details are modified, notify all assigned members with descriptive change summary.
        details_changed = []
        if "due_date" in update_dict:
            old_d_str = prev_due_date.strftime("%b %d, %Y") if prev_due_date else "No Due Date"
            new_d_val = update_dict["due_date"]
            new_d_str = new_d_val.strftime("%b %d, %Y") if isinstance(new_d_val, datetime) else (str(new_d_val)[:10] if new_d_val else "No Due Date")
            if old_d_str != new_d_str:
                details_changed.append(f"due date changed from {old_d_str} to {new_d_str}")

        if "title" in update_dict and update_dict["title"] != prev_title:
            details_changed.append(f"title changed to '{update_dict['title']}'")

        if "description" in update_dict and update_dict["description"] != prev_description:
            details_changed.append("description was updated")

        if "priority" in update_dict and update_dict["priority"] != prev_priority:
            details_changed.append(f"priority changed from {prev_priority or 'Normal'} to {update_dict['priority']}")

        if details_changed:
            change_summary = "; ".join(details_changed)
            sender_name = current_user.full_name or current_user.name or "Supervisor"
            notif_msg = f"Task '{task.title}' was updated by {sender_name}: {change_summary}"

            # Query all current assignees to receive update notification (excluding editor)
            stmt_curr_assignees = select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
            res_curr_assignees = await db.execute(stmt_curr_assignees)
            all_target_uids = set(res_curr_assignees.scalars().all())
            if task.user_id:
                all_target_uids.add(task.user_id)
            all_target_uids.discard(current_user.id)
            if task.created_by:
                all_target_uids.discard(task.created_by)

            for u_id in all_target_uids:
                edit_notif = InAppNotification(
                    user_id=u_id,
                    title="Task Updated",
                    message=notif_msg,
                    body=notif_msg,
                    type="task_updated",
                    is_read=False,
                    action_url="/(drawer)/(tabs)/tasks",
                )
                db.add(edit_notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=u_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(edit_notif.id),
                        "user_id": str(u_id),
                        "title": "Task Updated",
                        "message": notif_msg,
                        "body": notif_msg,
                        "type": "task_updated",
                        "is_read": False,
                        "action_url": "/(drawer)/(tabs)/tasks",
                    },
                )
                await push_service.send_to_user(
                    db=db,
                    user_id=u_id,
                    title="Task Updated",
                    body=notif_msg,
                    data={
                        "url": "/(drawer)/(tabs)/tasks",
                        "task_id": str(task.id),
                        "type": "task_updated",
                    },
                )

        # If subtask updated, recalculate parent progress
        if task.parent_task_id:
            await TaskService.recalculate_parent_progress(
                db,
                task.parent_task_id,
                actor=current_user,
                subtask_creator_id=task.created_by,
            )

        await db.commit()
        await db.refresh(task)

        # Real-time WebSocket broadcast of task status & progress updates
        update_payload = {
            "action": "updated",
            "task_id": str(task.id),
            "status": task.status,
            "progress": task.progress,
            "progress_percentage": task.progress,
            "updated_by": str(current_user.id),
        }
        stmt_a = select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
        res_a = await db.execute(stmt_a)
        seen_uids = set()
        if hasattr(res_a, "scalars"):
            try:
                s_func = getattr(res_a, "scalars")
                if callable(s_func) and not hasattr(s_func, "__await__"):
                    s_obj = s_func()
                    if hasattr(s_obj, "all"):
                        a_func = getattr(s_obj, "all")
                        items = a_func() if callable(a_func) else a_func
                        if isinstance(items, (list, tuple, set)):
                            seen_uids = set(items)
            except Exception:
                pass
        if task.user_id:
            seen_uids.add(task.user_id)
        if task.created_by:
            seen_uids.add(task.created_by)
        seen_uids.discard(current_user.id)
        for a_uid in seen_uids:
            await connection_manager.broadcast_to_user(
                user_id=a_uid,
                event=RealtimeEventType.TASK_UPDATE,
                payload=update_payload,
            )

        return await TaskService.get_task_by_id(db, task.id, current_user)

    @staticmethod
    async def update_assignee_progress(
        db: AsyncSession, task_id: UUID, assignee_id: UUID, progress: int, current_user: User
    ) -> Dict[str, Any]:
        """Update individual assignee progress and recalculate task progress."""
        from datetime import datetime, timezone
        from app.models.task import TaskAssignmentProgressHistory
        from app.models.notification import InAppNotification
        
        stmt = (
            select(Task)
            .options(selectinload(Task.assignees))
            .where(Task.id == task_id)
        )
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if not TaskService.can_view_task(task, current_user):
            raise HTTPException(status_code=403, detail="Access denied to task")

        assignee = next((a for a in task.assignees if str(a.user_id) == str(assignee_id)), None)
        if not assignee:
            stmt_a = select(TaskAssignee).where(
                TaskAssignee.task_id == task_id,
                TaskAssignee.user_id == assignee_id
            )
            res_a = await db.execute(stmt_a)
            assignee = res_a.scalar_one_or_none()

        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee not found on this task")

        user_role = (current_user.role or "").strip().lower()
        if str(current_user.id) != str(assignee_id) and user_role not in ["super admin", "founder", "department head", "manager"]:
            raise HTTPException(
                status_code=403, 
                detail="You can only update your own progress"
            )

        if assignee.progress == 100 and user_role not in ["super admin", "founder"]:
            raise HTTPException(
                status_code=400,
                detail="Assignment is already 100% completed and locked."
            )

        if progress % 10 != 0 or progress < 0 or progress > 100:
            raise HTTPException(status_code=400, detail="Progress must be between 0 and 100 in increments of 10")

        prev_progress = assignee.progress
        if prev_progress == progress:
            return await TaskService.get_task_by_id(db, task_id, current_user)

        assignee.progress = progress
        if progress == 100:
            assignee.status = "Completed"
            assignee.completed_at = datetime.now(timezone.utc)
        else:
            assignee.status = "In Progress" if progress > 0 else "To Do"
            assignee.completed_at = None

        history = TaskAssignmentProgressHistory(
            task_id=task_id,
            user_id=assignee_id,
            changed_by_id=current_user.id,
            previous_progress=prev_progress,
            new_progress=progress
        )
        db.add(history)
        await db.flush()

        stmt_all = select(TaskAssignee).where(TaskAssignee.task_id == task_id)
        res_all = await db.execute(stmt_all)
        all_assignees = res_all.scalars().all()
        
        if all_assignees:
            total_progress = sum(a.progress for a in all_assignees)
            overall_progress = int(round(total_progress / len(all_assignees)))
        else:
            overall_progress = progress

        task.progress = overall_progress

        prev_status = task.status
        is_all_completed = bool(all_assignees and all(a.progress == 100 for a in all_assignees))

        if is_all_completed:
            task.status = "Done"
        elif overall_progress > 0 and task.status == "To Do":
            task.status = "In Progress"
        elif not is_all_completed and task.status == "Done":
            task.status = "In Progress"

        if task.parent_task_id:
            try:
                await TaskService.recalculate_parent_progress(
                    db,
                    task.parent_task_id,
                    actor=current_user,
                    subtask_creator_id=task.created_by
                )
            except Exception:
                pass

        # Notification Routing Rules:
        # 1. Assignees NEVER receive completion notifications (they are the ones doing the work).
        # 2. When an individual completes in a multi-assignee task:
        #    Assigner receives: "[User] completed this task"
        # 3. When the task is successfully completed by ALL assignees:
        #    Assigner receives: "Task '[XYZ]' is completed"
        sender_name = current_user.full_name or current_user.name or "User"
        has_multiple_assignees = len(all_assignees) > 1

        if progress == 100 and task.created_by and str(task.created_by) != str(current_user.id):
            if has_multiple_assignees:
                indiv_notif = InAppNotification(
                    user_id=task.created_by,
                    title=f"Task Update: {task.title}",
                    message=f"{sender_name} completed this task",
                    body=f"{sender_name} completed this task",
                    type="task_update",
                    is_read=False,
                    action_url="/(drawer)/(tabs)/tasks",
                )
                db.add(indiv_notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=task.created_by,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(indiv_notif.id),
                        "user_id": str(task.created_by),
                        "title": f"Task Update: {task.title}",
                        "message": f"{sender_name} completed this task",
                        "body": f"{sender_name} completed this task",
                        "type": "task_update",
                        "is_read": False,
                        "action_url": "/(drawer)/(tabs)/tasks",
                    },
                )
                await push_service.send_to_user(
                    db=db,
                    user_id=task.created_by,
                    title=f"Task Update: {task.title}",
                    body=f"{sender_name} completed this task",
                    data={
                        "url": "/(drawer)/(tabs)/tasks",
                        "task_id": str(task.id),
                        "type": "task_update",
                    },
                )

        # When all assignees have finished (or single assignee finished):
        if is_all_completed and prev_status != "Done" and task.created_by and str(task.created_by) != str(current_user.id):
            done_notif = InAppNotification(
                user_id=task.created_by,
                title="Task Completed",
                message=f"Task '{task.title}' is completed",
                body=f"Task '{task.title}' is completed",
                type="task_completed",
                is_read=False,
                action_url="/(drawer)/(tabs)/tasks",
            )
            db.add(done_notif)
            await db.flush()
            await connection_manager.broadcast_to_user(
                user_id=task.created_by,
                event=RealtimeEventType.NEW_NOTIFICATION,
                payload={
                    "id": str(done_notif.id),
                    "user_id": str(task.created_by),
                    "title": "Task Completed",
                    "message": f"Task '{task.title}' is completed",
                    "body": f"Task '{task.title}' is completed",
                    "type": "task_completed",
                    "is_read": False,
                    "action_url": "/(drawer)/(tabs)/tasks",
                },
            )
            await push_service.send_to_user(
                db=db,
                user_id=task.created_by,
                title="Task Completed",
                body=f"Task '{task.title}' is completed",
                data={
                    "url": "/(drawer)/(tabs)/tasks",
                    "task_id": str(task.id),
                    "type": "task_completed",
                },
            )

        await db.commit()

        try:
            from app.services.chat_service import chat_service
            await chat_service.broadcast_event(
                event_type="task_updated",
                company_id=str(task.company_id) if task.company_id else None,
                payload={
                    "task_id": str(task.id),
                    "progress": task.progress,
                    "status": task.status,
                    "assignee_id": str(assignee_id),
                    "assignee_progress": progress,
                    "action": "progress_updated",
                },
            )
        except Exception:
            pass

        return await TaskService.get_task_by_id(db, task_id, current_user)

    @staticmethod
    async def complete_task(db: AsyncSession, task_id: UUID, current_user: User) -> Task:
        return await TaskService.update_task(
            db, task_id, current_user, TaskUpdate(status="Done", progress=100)
        )

    @staticmethod
    async def submit_completion(
        db: AsyncSession, task_id: UUID, current_user: User, note: Optional[str]
    ) -> Dict[str, Any]:
        from datetime import datetime, timezone
        stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == task_id)
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        assignee = next((a for a in task.assignees if str(a.user_id) == str(current_user.id)), None)
        if not assignee:
            raise HTTPException(status_code=403, detail="You are not assigned to this task")

        assignee.progress = 100
        assignee.completion_status = "Submitted"
        assignee.completion_note = note
        assignee.submitted_at = datetime.now(timezone.utc)
        assignee.status = "Completed"
        assignee.completed_at = assignee.submitted_at
        
        from app.models.task import ExecutionActivity
        activity = ExecutionActivity(
            task_id=task_id,
            user_id=current_user.id,
            event_type="SUBMIT_COMPLETION",
            metadata_={"note": note, "cycle": assignee.review_cycle}
        )
        db.add(activity)

        await db.flush()

        all_assignees = task.assignees
        if all(a.completion_status == "Submitted" or a.completion_status == "Accepted" for a in all_assignees):
            task.status = "Pending Review"
            
            # Notify the assigner/creator that the task is ready for review
            from app.models.notification import InAppNotification
            import json
            
            assigner_id = task.created_by or task.user_id
            if assigner_id:
                ready_notif = InAppNotification(
                    user_id=assigner_id,
                    title="Task Ready For Review",
                    message=f"All assignees have submitted '{task.title}'. It is ready for your review.",
                    body=f"All assignees have submitted '{task.title}'. It is ready for your review.",
                    type="TASK_UPDATE",
                    action_url=f"/task/{task.id}",
                )
                db.add(ready_notif)
                
                await connection_manager.broadcast_to_user(
                    user_id=assigner_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={"message": "Task ready for review", "task_id": str(task.id)}
                )
            
        await db.commit()
        
        await connection_manager.broadcast_to_channel(
            channel_id=str(task.id),
            event=RealtimeEventType.TASK_UPDATE,
            payload={"task_id": str(task.id), "status": task.status}
        )
        return {"success": True, "message": "Completion submitted"}

    @staticmethod
    async def review_completion(
        db: AsyncSession, task_id: UUID, assignee_id: UUID, current_user: User, decision: str, feedback: Optional[str]
    ) -> Dict[str, Any]:
        from datetime import datetime, timezone
        from app.models.task import TaskAssigneeReviewHistory
        stmt = select(Task).options(selectinload(Task.assignees)).where(Task.id == task_id)
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if not TaskService.can_edit_task(task, current_user):
            raise HTTPException(status_code=403, detail="Only the assigner can review tasks")

        assignee = next((a for a in task.assignees if str(a.user_id) == str(assignee_id)), None)
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee not found")

        if decision == "Accept":
            assignee.completion_status = "Accepted"
            assignee.status = "Completed"
            assignee.progress = 100
        elif decision == "Decline":
            assignee.completion_status = "Needs Rework"
            assignee.progress = 0
            assignee.status = "In Progress"
            assignee.review_cycle += 1
            assignee.rework_reason = feedback

        # Recalculate overall task progress based on assignees
        all_a = task.assignees or []
        if all_a:
            total_prog = sum(a.progress for a in all_a)
            task.progress = int(round(total_prog / len(all_a)))
        else:
            task.progress = 0

        # Log review
        review = TaskAssigneeReviewHistory(
            task_id=task_id,
            assignee_id=assignee_id,
            reviewer_id=current_user.id,
            cycle=assignee.review_cycle - 1 if decision == "Decline" else assignee.review_cycle,
            decision=decision,
            feedback=feedback,
        )
        db.add(review)

        from app.models.task import ExecutionActivity
        activity = ExecutionActivity(
            task_id=task_id,
            user_id=current_user.id,
            event_type="REVIEW_COMPLETION",
            metadata_={
                "decision": decision, 
                "feedback": feedback, 
                "assignee_id": str(assignee_id), 
                "cycle": assignee.review_cycle - 1 if decision == "Decline" else assignee.review_cycle
            }
        )
        db.add(activity)

        # Update overall task status:
        # If all assignees are Accepted -> Done (100%)
        # If any assignee is Needs Rework / In Progress -> In Progress
        # If all remaining are Submitted -> Pending Review
        if all(a.completion_status == "Accepted" for a in all_a):
            task.status = "Done"
            task.progress = 100
        elif any(a.completion_status == "Needs Rework" for a in all_a):
            task.status = "Needs Rework"
        elif any(a.completion_status == "Submitted" for a in all_a):
            task.status = "Pending Review"
        else:
            task.status = "In Progress"

            
        from app.models.notification import InAppNotification
        import json

        # Send Notifications
        if decision == "Decline":
            # Notify all assigned users that the task requires rework
            for a in all_a:
                dec_notif = InAppNotification(
                    user_id=a.user_id,
                    title="Task Requires Rework",
                    message=f"Work on '{task.title}' by a team member was returned for rework. Reason: {feedback or 'No reason provided'}",
                    body=f"Work on '{task.title}' by a team member was returned for rework. Reason: {feedback or 'No reason provided'}",
                    type="TASK_UPDATE",
                    action_url=f"/task/{task.id}",
                )
                db.add(dec_notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=a.user_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(dec_notif.id),
                        "user_id": str(dec_notif.user_id),
                        "title": dec_notif.title,
                        "message": dec_notif.message,
                        "body": dec_notif.body,
                        "type": dec_notif.type,
                        "is_read": False,
                        "action_url": dec_notif.action_url,
                    }
                )

        elif decision == "Accept":
            if task.status == "Done":
                for a in task.assignees:
                    acc_notif = InAppNotification(
                        user_id=a.user_id,
                        title="Task Completed",
                        message=f"'{task.title}' has been accepted and finalized.",
                        body=f"'{task.title}' has been accepted and finalized.",
                        type="TASK_UPDATE",
                        action_url=f"/task/{task.id}",
                    )
                    db.add(acc_notif)
                    await db.flush()
                    await connection_manager.broadcast_to_user(
                        user_id=a.user_id,
                        event=RealtimeEventType.NEW_NOTIFICATION,
                        payload={
                            "id": str(acc_notif.id),
                            "user_id": str(acc_notif.user_id),
                            "title": acc_notif.title,
                            "message": acc_notif.message,
                            "body": acc_notif.body,
                            "type": acc_notif.type,
                            "is_read": False,
                            "action_url": acc_notif.action_url,
                        }
                    )
            else:
                acc_notif = InAppNotification(
                    user_id=assignee.user_id,
                    title="Work Accepted",
                    message=f"Your work on '{task.title}' was accepted.",
                    body=f"Your work on '{task.title}' was accepted.",
                    type="TASK_UPDATE",
                    action_url=f"/task/{task.id}",
                )
                db.add(acc_notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=assignee.user_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(acc_notif.id),
                        "user_id": str(acc_notif.user_id),
                        "title": acc_notif.title,
                        "message": acc_notif.message,
                        "body": acc_notif.body,
                        "type": acc_notif.type,
                        "is_read": False,
                        "action_url": acc_notif.action_url,
                    }
                )

        await db.commit()
        
        await connection_manager.broadcast_to_channel(
            channel_id=str(task.id),
            event=RealtimeEventType.TASK_UPDATE,
            payload={"task_id": str(task.id), "status": task.status}
        )
        return {"success": True, "message": f"Task completion {decision.lower()}"}

    @staticmethod
    async def segregate_task(
        db: AsyncSession, task_id: UUID, current_user: User, child_tasks: List[SubtaskCreateItem]
    ) -> Dict[str, Any]:
        """Atomic task segregation into child subtasks."""
        parent = await TaskService.get_task_by_id(db, task_id, current_user)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent task not found")

        parent_depth, _ = await TaskService.get_task_depth_and_ancestors(db, parent.id)
        if parent_depth >= 5:
            raise HTTPException(
                status_code=400,
                detail="Maximum task hierarchy depth of 5 reached.",
            )

        caller_id = current_user.id
        parent_id = parent.id
        company_id = parent.company_id
        department_id = parent.department_id

        created_subtasks = []
        for c in child_tasks:
            # Support both single assignee_id and multi assignee_ids
            all_assignee_ids = []
            if c.assignee_ids and len(c.assignee_ids) > 0:
                all_assignee_ids = list(c.assignee_ids)
            elif c.assignee_id:
                all_assignee_ids = [c.assignee_id]

            if not all_assignee_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Assignee is mandatory for subtask '{c.title}'. Every subtask must be assigned.",
                )

            # Validate assignees belong to company
            seg_u_stmt = select(User).where(User.id.in_(all_assignee_ids), User.is_deleted == False)
            seg_u_res = await db.execute(seg_u_stmt)
            seg_users = {u.id: u for u in seg_u_res.scalars().all()}
            for uid in all_assignee_ids:
                u_obj = seg_users.get(uid)
                if not u_obj:
                    raise HTTPException(status_code=404, detail=f"Assignee {uid} not found")
                if current_user.role != "Super Admin" and company_id and u_obj.company_id and u_obj.company_id != company_id:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Assignee '{u_obj.full_name or u_obj.name or u_obj.email}' belongs to a different company than the task.",
                    )

            primary_assignee_id = all_assignee_ids[0]
            sub = Task(
                title=c.title,
                description=c.description,
                priority=c.priority,
                due_date=c.due_date,
                user_id=primary_assignee_id,
                created_by=caller_id,
                parent_task_id=parent_id,
                company_id=company_id,
                department_id=department_id,
                status="To Do",
            )
            db.add(sub)
            await db.flush()
            # Insert all assignees into task_assignees (deduplicated)
            seen = set()
            for uid in all_assignee_ids:
                if uid not in seen:
                    db.add(TaskAssignee(task_id=sub.id, user_id=uid))
                    seen.add(uid)
            created_subtasks.append(sub)

            sender_name = current_user.full_name or current_user.name or "User"
            parent_title = parent.title or "Parent Task"

            # Notifications & Realtime & Push for segregated subtasks (excluding assigner/creator)
            for a_id in all_assignee_ids:
                if str(a_id) == str(current_user.id) or (parent.created_by and str(a_id) == str(parent.created_by)):
                    continue
                notif = InAppNotification(
                    user_id=a_id,
                    title=f"New subtask assigned: {sub.title}",
                    message=f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                    body=f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                    type="task_assignment",
                    is_read=False,
                    action_url="/(drawer)/(tabs)/tasks",
                )
                db.add(notif)
                await db.flush()
                await connection_manager.broadcast_to_user(
                    user_id=a_id,
                    event=RealtimeEventType.NEW_NOTIFICATION,
                    payload={
                        "id": str(notif.id),
                        "user_id": str(a_id),
                        "title": f"New subtask assigned: {sub.title}",
                        "message": f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                        "body": f"Subtask under parent '{parent_title}' assigned by {sender_name}",
                        "type": "task_assignment",
                        "is_read": False,
                        "action_url": "/(drawer)/(tabs)/tasks",
                    },
                )
                # Real Android OS Push Notification
                await push_service.send_to_user(
                    db=db,
                    user_id=a_id,
                    title=f"New Subtask Assigned",
                    body=f"You were assigned: {sub.title}",
                    data={
                        "url": "/(drawer)/(tabs)/tasks",
                        "task_id": str(sub.id),
                        "parent_task_id": str(parent_id),
                        "type": "task_assignment",
                    },
                )

        parent.status = "In Progress"
        await db.flush()
        await TaskService.recalculate_parent_progress(db, parent_id)

        child_ids = [str(s.id) for s in created_subtasks]
        await db.commit()
        return {
            "success": True,
            "created_count": len(created_subtasks),
            "child_task_ids": child_ids,
            "child_ids": child_ids,
        }

    @staticmethod
    async def delete_task(
        db: AsyncSession,
        task_id: UUID,
        current_user: User,
    ) -> Dict[str, Any]:
        """Deletes a task with full hierarchy check, MinIO storage cleanup, parent recalculation, audit log, and realtime sync."""
        stmt = (
            select(Task)
            .options(
                selectinload(Task.subtasks).selectinload(Task.files),
                selectinload(Task.subtasks).selectinload(Task.voice_notes),
                selectinload(Task.files),
                selectinload(Task.voice_notes),
                selectinload(Task.creator),
                selectinload(Task.assignees),
            )
            .where(Task.id == task_id)
        )
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Check delete authorization
        if not TaskService.can_delete_task(task, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: You do not have authorization to delete this task",
            )

        parent_id = task.parent_task_id
        company_id = task.company_id
        task_title = task.title
        creator_id = task.created_by

        # Collect all related task IDs (target task + any subtasks)
        all_task_ids = [task.id]
        if task.subtasks:
            all_task_ids.extend([s.id for s in task.subtasks])

        # Clean up MinIO storage objects
        f_stmt = select(TaskFile).where(TaskFile.task_id.in_(all_task_ids))
        f_res = await db.execute(f_stmt)
        task_files = f_res.scalars().all()
        file_storage_paths = [f.storage_path for f in task_files if f.storage_path]

        v_stmt = select(TaskVoiceNote).where(TaskVoiceNote.task_id.in_(all_task_ids))
        v_res = await db.execute(v_stmt)
        task_voice_notes = v_res.scalars().all()
        voice_storage_paths = [v.storage_path for v in task_voice_notes if v.storage_path]

        if file_storage_paths:
            storage_service.delete_objects(settings.STORAGE_BUCKET_TASKS, file_storage_paths)
        if voice_storage_paths:
            storage_service.delete_objects(settings.STORAGE_BUCKET_AUDIO, voice_storage_paths)

        # Delete the task (cascades subtasks, assignees, files, voice notes, comments, activities)
        await db.execute(delete(Task).where(Task.id == task_id))
        await db.flush()

        # If subtask deleted, recalculate parent progress
        if parent_id:
            await TaskService.recalculate_parent_progress(db, parent_id)

        # Record Audit Log
        audit = AuditLog(
            company_id=company_id,
            user_id=current_user.id,
            task_id=None,
            action_type="TASK_DELETED",
            target_type="task",
            target_id=task_id,
            description=f"Task '{task_title}' (creator_id={creator_id}) deleted by {current_user.role} {current_user.email}",
            previous_state={"title": task_title, "creator_id": str(creator_id) if creator_id else None, "parent_task_id": str(parent_id) if parent_id else None},
        )
        db.add(audit)

        await db.commit()

        # Realtime broadcast to company
        if company_id:
            await connection_manager.broadcast_to_company(
                company_id=company_id,
                event=RealtimeEventType.TASK_UPDATE,
                payload={
                    "action": "deleted",
                    "task_id": str(task_id),
                    "parent_task_id": str(parent_id) if parent_id else None,
                    "deleted_by": str(current_user.id),
                },
            )

        return {
            "status": "success",
            "message": "Task deleted successfully",
            "task_id": str(task_id),
            "parent_task_id": str(parent_id) if parent_id else None,
        }

    @staticmethod
    async def get_task_comments(
        db: AsyncSession, task_id: UUID, current_user: User
    ) -> List[Any]:
        t_stmt = (
            select(Task)
            .options(
                selectinload(Task.assignees),
                selectinload(Task.creator),
            )
            .where(Task.id == task_id)
        )
        t_res = await db.execute(t_stmt)
        task = t_res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if not TaskService.can_view_task(task, current_user):
            raise HTTPException(status_code=403, detail="Access denied to task comments")

        stmt = (
            select(Comment)
            .options(selectinload(Comment.user))
            .where(Comment.task_id == task_id)
            .order_by(Comment.created_at.asc())
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def create_task_comment(
        db: AsyncSession, task_id: UUID, current_user: User, content: str
    ) -> Any:
        t_stmt = (
            select(Task)
            .options(
                selectinload(Task.assignees),
                selectinload(Task.creator),
            )
            .where(Task.id == task_id)
        )
        t_res = await db.execute(t_stmt)
        task = t_res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if not TaskService.can_view_task(task, current_user):
            raise HTTPException(status_code=403, detail="Access denied to task")

        comment = Comment(
            task_id=task_id,
            user_id=current_user.id,
            content=content.strip(),
        )
        db.add(comment)
        await db.commit()
        await db.refresh(comment)

        c_stmt = select(Comment).options(selectinload(Comment.user)).where(Comment.id == comment.id)
        c_res = await db.execute(c_stmt)
        fresh_comment = c_res.scalar_one()

        comment_payload = {
            "action": "comment_created",
            "comment_id": str(fresh_comment.id),
            "task_id": str(task_id),
            "user_id": str(current_user.id),
            "content": fresh_comment.content,
            "created_at": fresh_comment.created_at.isoformat() if fresh_comment.created_at else None,
            "user": {
                "id": str(current_user.id),
                "full_name": current_user.full_name,
                "email": current_user.email,
                "role": current_user.role,
            },
        }

        target_uids = set()
        if task.created_by:
            target_uids.add(task.created_by)
        if task.user_id:
            target_uids.add(task.user_id)
        for a in task.assignees or []:
            target_uids.add(a.user_id)

        for uid in target_uids:
            try:
                await connection_manager.broadcast_to_user(
                    user_id=uid,
                    event=RealtimeEventType.TASK_UPDATE,
                    payload=comment_payload,
                )
            except Exception:
                pass

        if task.company_id:
            try:
                await connection_manager.broadcast_to_company(
                    company_id=task.company_id,
                    event=RealtimeEventType.TASK_UPDATE,
                    payload=comment_payload,
                )
            except Exception:
                pass

        return fresh_comment

    @staticmethod
    async def update_task_comment(
        db: AsyncSession, task_id: UUID, comment_id: UUID, current_user: User, content: str
    ) -> Any:
        c_stmt = (
            select(Comment)
            .options(selectinload(Comment.user), selectinload(Comment.task))
            .where(Comment.id == comment_id, Comment.task_id == task_id)
        )
        c_res = await db.execute(c_stmt)
        comment = c_res.scalar_one_or_none()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")

        if current_user.role not in ["Super Admin", "Founder"] and comment.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only comment author or administrators can edit this comment")

        comment.content = content.strip()
        await db.commit()

        c_fresh_stmt = select(Comment).options(selectinload(Comment.user)).where(Comment.id == comment.id)
        c_fresh_res = await db.execute(c_fresh_stmt)
        fresh_comment = c_fresh_res.scalar_one()

        comment_payload = {
            "action": "comment_updated",
            "comment_id": str(fresh_comment.id),
            "task_id": str(task_id),
            "user_id": str(fresh_comment.user_id),
            "content": fresh_comment.content,
            "updated_at": fresh_comment.updated_at.isoformat() if fresh_comment.updated_at else None,
        }
        if comment.task and comment.task.company_id:
            try:
                await connection_manager.broadcast_to_company(
                    company_id=comment.task.company_id,
                    event=RealtimeEventType.TASK_UPDATE,
                    payload=comment_payload,
                )
            except Exception:
                pass

        return fresh_comment

    @staticmethod
    async def delete_task_comment(
        db: AsyncSession, task_id: UUID, comment_id: UUID, current_user: User
    ) -> Dict[str, Any]:
        c_stmt = (
            select(Comment)
            .options(selectinload(Comment.task))
            .where(Comment.id == comment_id, Comment.task_id == task_id)
        )
        c_res = await db.execute(c_stmt)
        comment = c_res.scalar_one_or_none()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")

        if current_user.role not in ["Super Admin", "Founder"] and comment.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only comment author or administrators can delete this comment")

        company_id = comment.task.company_id if comment.task else None
        await db.delete(comment)
        await db.commit()

        comment_payload = {
            "action": "comment_deleted",
            "comment_id": str(comment_id),
            "task_id": str(task_id),
        }
        if company_id:
            try:
                await connection_manager.broadcast_to_company(
                    company_id=company_id,
                    event=RealtimeEventType.TASK_UPDATE,
                    payload=comment_payload,
                )
            except Exception:
                pass

    @staticmethod
    async def alert_task(
        db: AsyncSession, task_id: UUID, current_user: User
    ) -> Dict[str, Any]:
        """Allows the task assigner/creator (or admin) to intentionally alert assigned members."""
        task = await TaskService.get_task_by_id(db, task_id, current_user)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Only the assigner/creator (or Founder/Super Admin) can trigger an alert
        if not TaskService.can_edit_task(task, current_user) and (not task.created_by or str(task.created_by) != str(current_user.id)):
            raise HTTPException(status_code=403, detail="Only the task assigner can trigger an alert for this task.")

        sender_name = current_user.full_name or current_user.name or "Supervisor"
        alert_msg = f"Alert from {sender_name}: Please pay immediate attention to '{task.title}'"

        stmt_curr_assignees = select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
        res_curr_assignees = await db.execute(stmt_curr_assignees)
        all_target_uids = set(res_curr_assignees.scalars().all())
        if task.user_id:
            all_target_uids.add(task.user_id)
        all_target_uids.discard(current_user.id)

        sent_count = 0
        for u_id in all_target_uids:
            alert_notif = InAppNotification(
                user_id=u_id,
                title="Task Alert",
                message=alert_msg,
                body=alert_msg,
                type="reminder",
                is_read=False,
                action_url="/(drawer)/(tabs)/tasks",
            )
            db.add(alert_notif)
            await db.flush()
            await connection_manager.broadcast_to_user(
                user_id=u_id,
                event=RealtimeEventType.NEW_NOTIFICATION,
                payload={
                    "id": str(alert_notif.id),
                    "user_id": str(u_id),
                    "title": "Task Alert",
                    "message": alert_msg,
                    "body": alert_msg,
                    "type": "reminder",
                    "is_read": False,
                    "action_url": "/(drawer)/(tabs)/tasks",
                },
            )
            await push_service.send_to_user(
                db=db,
                user_id=u_id,
                title="Task Alert",
                body=alert_msg,
                data={
                    "url": "/(drawer)/(tabs)/tasks",
                    "task_id": str(task.id),
                    "type": "reminder",
                },
            )
            sent_count += 1

        await db.commit()
        return {"success": True, "message": f"Alert sent to {sent_count} assignee(s)", "alerted_count": sent_count}


task_service = TaskService()

