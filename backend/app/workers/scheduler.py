from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, update, or_
from app.core.database import AsyncSessionLocal
from app.core.logging import logger
from app.models.task import Task, TaskAssignee
from app.models.meeting import Meeting
from app.models.notification import Notification, InAppNotification
from app.models.user import User
from app.services.meeting_service import meeting_service
from app.services.push_service import push_service
from app.websocket.connection_manager import connection_manager
from app.websocket.events import RealtimeEventType


class JobScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()

    def start(self):
        self.scheduler.add_job(
            self.check_overdue_tasks,
            "interval",
            minutes=15,
            id="check_overdue_tasks",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self.cleanup_meetings,
            "interval",
            hours=1,
            id="cleanup_meetings",
            replace_existing=True,
        )
        self.scheduler.start()
        logger.info("APScheduler started with jobs: check_overdue_tasks, cleanup_meetings")

    def shutdown(self):
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("APScheduler stopped")

    async def check_overdue_tasks(self):
        """Idempotently identifies tasks due today or overdue and dispatches individual notifications to assignees."""
        logger.info("Running scheduled due date & overdue tasks check")
        try:
            async with AsyncSessionLocal() as db:
                now = datetime.now(timezone.utc)
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

                # Fetch active tasks with due dates up to the end of today
                stmt = select(Task).where(
                    Task.due_date <= today_end,
                    Task.status.notin_(["Done", "Completed"]),
                    or_(Task.progress.is_(None), Task.progress < 100),
                )
                res = await db.execute(stmt)
                due_or_overdue_tasks = res.scalars().all()

                for task in due_or_overdue_tasks:
                    # Query joint assignees
                    a_stmt = (
                        select(TaskAssignee, User)
                        .join(User, TaskAssignee.user_id == User.id)
                        .where(TaskAssignee.task_id == task.id)
                    )
                    a_res = await db.execute(a_stmt)
                    assignee_pairs = a_res.all()

                    # Fallback to task.user_id if no TaskAssignee entries
                    if not assignee_pairs and task.user_id:
                        u_stmt = select(User).where(User.id == task.user_id)
                        u_res = await db.execute(u_stmt)
                        u_obj = u_res.scalar_one_or_none()
                        if u_obj:
                            mock_assignee = type("AssigneeProgress", (), {"progress": task.progress or 0, "user_id": task.user_id})()
                            assignee_pairs = [(mock_assignee, u_obj)]

                    is_past_due = task.due_date and task.due_date < now
                    is_due_today = task.due_date and today_start <= task.due_date <= today_end

                    for assignee_rel, user in assignee_pairs:
                        # If this specific assignee already reached 100%, skip
                        if (assignee_rel.progress or 0) >= 100:
                            continue

                        # Never notify creator/assigner as an assignee
                        if task.created_by and str(task.created_by) == str(user.id):
                            continue

                        if is_due_today:
                            notif_title = "Task Due Today"
                            assignee_msg = f"Your task '{task.title}' is due today"
                        elif is_past_due:
                            notif_title = "Task Overdue"
                            assignee_msg = f"Your task '{task.title}' is overdue"
                        else:
                            continue

                        # 24-hour deduplication check per assignee and task
                        chk_stmt = select(InAppNotification).where(
                            InAppNotification.user_id == user.id,
                            InAppNotification.type.in_(["reminder", "due_today"]),
                            InAppNotification.created_at >= today_start,
                            InAppNotification.message.like(f"%{task.title}%"),
                        )
                        chk_res = await db.execute(chk_stmt)
                        if not chk_res.scalar_one_or_none():
                            notif = InAppNotification(
                                user_id=user.id,
                                title=notif_title,
                                message=assignee_msg,
                                body=assignee_msg,
                                type="reminder",
                                is_read=False,
                                action_url="/(drawer)/(tabs)/tasks",
                            )
                            db.add(notif)
                            await db.flush()
                            await connection_manager.broadcast_to_user(
                                user_id=user.id,
                                event=RealtimeEventType.NEW_NOTIFICATION,
                                payload={
                                    "id": str(notif.id),
                                    "user_id": str(user.id),
                                    "title": notif_title,
                                    "message": assignee_msg,
                                    "body": assignee_msg,
                                    "type": "reminder",
                                    "is_read": False,
                                    "action_url": "/(drawer)/(tabs)/tasks",
                                },
                            )
                            await push_service.send_to_user(
                                db=db,
                                user_id=user.id,
                                title=notif_title,
                                body=assignee_msg,
                                data={"url": "/(drawer)/(tabs)/tasks", "type": "reminder", "taskId": str(task.id)},
                            )

                await db.commit()
        except Exception as e:
            logger.error(f"Error executing due date task scheduler: {e}")

    async def cleanup_meetings(self):
        """Auto-completes past scheduled meetings."""
        logger.info("Running scheduled meeting cleanup")
        try:
            async with AsyncSessionLocal() as db:
                await meeting_service.cleanup_completed_meetings(db)
        except Exception as e:
            logger.error(f"Error executing meeting cleanup scheduler: {e}")


job_scheduler = JobScheduler()
