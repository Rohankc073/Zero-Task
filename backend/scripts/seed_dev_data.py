"""
Seed Development Environment Script
Seeds two companies (Acme Corp and Beta Global), Super Admin, Founders,
Department Heads, Managers, Employees, Tasks, and Meetings.
Demonstrates multi-tenant isolation.
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.company import Company
from app.models.user import Department, Designation, User, UserCredential
from app.models.task import Task, TaskAssignee
from app.models.meeting import Meeting, MeetingParticipant
from app.models.chat import ChatChannel
from app.core.logging import logger


async def seed_data():
    logger.info("Starting safe local development database seed...")
    password_hash = get_password_hash("Test@123")

    async with AsyncSessionLocal() as db:
        # 1. Super Admin
        sa_stmt = text("SELECT id FROM public.users WHERE email = 'superadmin@zerotask.internal'")
        sa_res = await db.execute(sa_stmt)
        if not sa_res.scalar():
            sa_user = User(
                email="superadmin@zerotask.internal",
                name="Super Administrator",
                full_name="Super Administrator",
                role="Super Admin",
                is_approved=True,
                is_active=True,
            )
            db.add(sa_user)
            await db.flush()
            db.add(UserCredential(user_id=sa_user.id, password_hash=password_hash))
            logger.info(f"Seeded Super Admin: {sa_user.email}")

        # 2. Company A (Acme Corp)
        c_a = Company(name="Acme Corp", code="ACME", industry="Technology")
        db.add(c_a)
        await db.flush()

        dept_a_eng = Department(name="Engineering", company_id=c_a.id)
        dept_a_ops = Department(name="Operations", company_id=c_a.id)
        db.add_all([dept_a_eng, dept_a_ops])
        await db.flush()

        founder_a = User(
            email="founder.a@acme.com", full_name="Alice Founder", role="Founder",
            company_id=c_a.id, department_id=dept_a_eng.id, is_approved=True, is_active=True
        )
        manager_a = User(
            email="manager.a@acme.com", full_name="Mark Manager", role="Manager",
            company_id=c_a.id, department_id=dept_a_eng.id, is_approved=True, is_active=True
        )
        emp_a = User(
            email="employee.a@acme.com", full_name="Eve Employee", role="Employee",
            company_id=c_a.id, department_id=dept_a_eng.id, is_approved=True, is_active=True
        )
        db.add_all([founder_a, manager_a, emp_a])
        await db.flush()

        for u in [founder_a, manager_a, emp_a]:
            db.add(UserCredential(user_id=u.id, password_hash=password_hash))

        # Tasks for Company A
        task_a1 = Task(
            title="Design System Architecture",
            description="Acme cloud infrastructure design",
            status="In Progress",
            priority="High",
            due_date=datetime.now(timezone.utc) + timedelta(days=5),
            user_id=emp_a.id,
            created_by=manager_a.id,
            department_id=dept_a_eng.id,
            company_id=c_a.id,
            progress=40,
        )
        db.add(task_a1)
        await db.flush()
        db.add(TaskAssignee(task_id=task_a1.id, user_id=emp_a.id))

        # Meeting for Company A
        meet_a = Meeting(
            title="Acme Sprint Sync",
            agenda="Review weekly progress",
            start_time=datetime.now(timezone.utc) + timedelta(days=1),
            end_time=datetime.now(timezone.utc) + timedelta(days=1, hours=1),
            organizer_id=manager_a.id,
            company_id=c_a.id,
            status="Scheduled",
        )
        db.add(meet_a)
        await db.flush()
        db.add(MeetingParticipant(meeting_id=meet_a.id, user_id=emp_a.id))

        # 3. Company B (Beta Global)
        c_b = Company(name="Beta Global", code="BETA", industry="Finance")
        db.add(c_b)
        await db.flush()

        dept_b_fin = Department(name="Finance", company_id=c_b.id)
        db.add(dept_b_fin)
        await db.flush()

        founder_b = User(
            email="founder.b@beta.com", full_name="Bob Founder", role="Founder",
            company_id=c_b.id, department_id=dept_b_fin.id, is_approved=True, is_active=True
        )
        emp_b = User(
            email="employee.b@beta.com", full_name="Ben Employee", role="Employee",
            company_id=c_b.id, department_id=dept_b_fin.id, is_approved=True, is_active=True
        )
        db.add_all([founder_b, emp_b])
        await db.flush()

        for u in [founder_b, emp_b]:
            db.add(UserCredential(user_id=u.id, password_hash=password_hash))

        # Task for Company B
        task_b1 = Task(
            title="Beta Financial Audit",
            description="Q3 corporate financial audit",
            status="To Do",
            priority="High",
            due_date=datetime.now(timezone.utc) + timedelta(days=10),
            user_id=emp_b.id,
            created_by=founder_b.id,
            department_id=dept_b_fin.id,
            company_id=c_b.id,
        )
        db.add(task_b1)
        await db.flush()
        db.add(TaskAssignee(task_id=task_b1.id, user_id=emp_b.id))

        await db.commit()
        logger.info("Dev seed completed successfully! Company A and Company B created with isolated data.")


if __name__ == "__main__":
    asyncio.run(seed_data())
