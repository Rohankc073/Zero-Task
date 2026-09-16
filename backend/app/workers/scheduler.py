from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.core.logging import logger
from app.models.task import Task
from app.models.meeting import Meeting
from app.models.notification import Notification, InAppNotification
from app.models.user import User
from app.services.meeting_service import meeting_service
from app.services.push_service import push_service


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
        """Idempotently identifies overdue tasks and escalates notifications."""
        logger.info("Running scheduled overdue tasks escalation check")
        try:
            async with AsyncSessionLocal() as db:
                now = datetime.now(timezone.utc)
                stmt = select(Task).where(
                    Task.due_date < now,
                    Task.status.notin_(["Done", "Completed"]),
                    or_(Task.progress.is_(None), Task.progress < 100),
                )
                res = await db.execute(stmt)
                overdue_tasks = res.scalars().all()

                for task in overdue_tasks:
                    if not task.user_id:
                        continue

                    # Fetch assignee
                    u_stmt = select(User).where(User.id == task.user_id)
                    u_res = await db.execute(u_stmt)
                    user = u_res.scalar_one_or_none()
                    if not user:
                        continue

                    # Escalate according to ZeroTask organizational hierarchy:
                    # Employee -> Manager
                    # Manager -> Dept Head
                    # Dept Head -> Founder
                    notify_ids = []
                    if user.role == "Employee":
                        m_stmt = select(User.id).where(
                            User.department_id == user.department_id,
                            User.role == "Manager",
                            User.is_active == True,
                        )
                        m_res = await db.execute(m_stmt)
                        notify_ids = [r[0] for r in m_res.all()]
                    elif user.role == "Manager":
                        h_stmt = select(User.id).where(
                            User.department_id == user.department_id,
                            User.role == "Department Head",
                            User.is_active == True,
                        )
                        h_res = await db.execute(h_stmt)
                        notify_ids = [r[0] for r in h_res.all()]
                    elif user.role == "Department Head":
                        f_stmt = select(User.id).where(
                            User.company_id == user.company_id,
                            User.role == "Founder",
                            User.is_active == True,
                        )
                        f_res = await db.execute(f_stmt)
                        notify_ids = [r[0] for r in f_res.all()]

                    # Insert alerts idempotently and dispatch push notifications
                    for nid in notify_ids:
                        escalation_title = "Overdue Task Escalation"
                        escalation_body = f"Task '{task.title}' assigned to {user.full_name or user.name} is overdue."
                        alert = Notification(
                            user_id=nid,
                            title=escalation_title,
                            body=escalation_body,
                            is_read=False,
                            type="reminder",
                        )
                        db.add(alert)
                        in_app = InAppNotification(
                            user_id=nid,
                            title=escalation_title,
                            message=escalation_body,
                            body=escalation_body,
                            is_read=False,
                            type="reminder",
                            action_url="/(drawer)/(tabs)/tasks",
                        )
                        db.add(in_app)
                        await push_service.send_to_user(
                            db=db,
                            user_id=nid,
                            title=escalation_title,
                            body=escalation_body,
                            data={"url": "/(drawer)/(tabs)/tasks", "type": "reminder", "taskId": str(task.id)},
                        )

                await db.commit()
        except Exception as e:
            logger.error(f"Error executing overdue task scheduler: {e}")

    async def cleanup_meetings(self):
        """Auto-completes past scheduled meetings."""
        logger.info("Running scheduled meeting cleanup")
        try:
            async with AsyncSessionLocal() as db:
                await meeting_service.cleanup_completed_meetings(db)
        except Exception as e:
            logger.error(f"Error executing meeting cleanup scheduler: {e}")


job_scheduler = JobScheduler()
