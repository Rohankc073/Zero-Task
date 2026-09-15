import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User, Department
from app.models.company import Company
from app.models.task import Task, TaskAssignee, TaskFile, TaskVoiceNote
from app.models.chat import ChatChannel, ChatMessage
from app.models.notification import InAppNotification
from app.services.chat_service import chat_service
from app.services.task_service import task_service
from app.schemas.task import TaskCreate, TaskFileCreate, TaskVoiceNoteCreate


from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from app.core.config import settings


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_chat_direct_message_notification(db):
    # Setup Company & Users
    rnd = uuid.uuid4().hex[:6]
    company_id = uuid.uuid4()
    company = Company(id=company_id, name=f"Chat Test Corp {rnd}")
    db.add(company)

    user_a = User(
        id=uuid.uuid4(),
        email=f"founder_chat_{rnd}@test.com",
        full_name="Founder A",
        role="Founder",
        company_id=company_id,
        is_active=True,
        is_approved=True,
    )
    user_b = User(
        id=uuid.uuid4(),
        email=f"manager_chat_{rnd}@test.com",
        full_name="Manager B",
        role="Manager",
        company_id=company_id,
        is_active=True,
        is_approved=True,
    )
    db.add_all([user_a, user_b])
    await db.commit()

    # Get/Create Direct Channel
    direct_info = await chat_service.get_or_create_direct_channel(db, user_a, user_b.id)
    channel_id = direct_info["channel_id"]

    # User A sends direct message to User B
    msg = await chat_service.create_message(
        db=db,
        current_user=user_a,
        channel_id=channel_id,
        content="Hello Manager B, please check the roadmap.",
    )
    assert msg.id is not None

    # Verify InAppNotification was persisted for User B
    stmt_b = select(InAppNotification).where(
        InAppNotification.user_id == user_b.id,
        InAppNotification.type == "chat"
    )
    res_b = await db.execute(stmt_b)
    notif_b = res_b.scalar_one_or_none()
    assert notif_b is not None
    assert "Founder A" in notif_b.title
    assert "roadmap" in notif_b.message
    assert notif_b.is_read is False

    # Verify User A (sender) received NO notification for their own message
    stmt_a = select(InAppNotification).where(
        InAppNotification.user_id == user_a.id,
        InAppNotification.type == "chat"
    )
    res_a = await db.execute(stmt_a)
    notif_a = res_a.scalar_one_or_none()
    assert notif_a is None


@pytest.mark.asyncio
async def test_assigned_task_visibility_end_to_end(db):
    # Setup Company & Departments
    company_a_id = uuid.uuid4()
    company_b_id = uuid.uuid4()

    comp_a = Company(id=company_a_id, name="Company A")
    comp_b = Company(id=company_b_id, name="Company B")
    db.add_all([comp_a, comp_b])

    dept_mgmt = Department(id=uuid.uuid4(), name="Management", company_id=company_a_id)
    dept_eng = Department(id=uuid.uuid4(), name="Engineering", company_id=company_a_id)
    db.add_all([dept_mgmt, dept_eng])

    # Users
    rnd = uuid.uuid4().hex[:6]
    founder = User(
        id=uuid.uuid4(),
        email=f"founder_vis_{rnd}@test.com",
        full_name="Founder Vis",
        role="Founder",
        company_id=company_a_id,
        department_id=dept_mgmt.id,
        is_active=True,
        is_approved=True,
    )
    manager = User(
        id=uuid.uuid4(),
        email=f"manager_vis_{rnd}@test.com",
        full_name="Manager Eng",
        role="Manager",
        company_id=company_a_id,
        department_id=dept_eng.id,
        is_active=True,
        is_approved=True,
    )
    employee_1 = User(
        id=uuid.uuid4(),
        email=f"emp1_vis_{rnd}@test.com",
        full_name="Employee 1",
        role="Employee",
        company_id=company_a_id,
        department_id=dept_eng.id,
        is_active=True,
        is_approved=True,
    )
    cross_company_user = User(
        id=uuid.uuid4(),
        email=f"other_comp_{rnd}@test.com",
        full_name="Other Corp User",
        role="Manager",
        company_id=company_b_id,
        is_active=True,
        is_approved=True,
    )
    db.add_all([founder, manager, employee_1, cross_company_user])
    await db.commit()

    # Case 1 & 5: Founder creates task assigned to Manager and Employee 1 (multi-assignee)
    task_data = TaskCreate(
        title="Critical Multi-Assignee Task with Media",
        description="Task containing voice note and attachment.",
        priority="High",
        status="To Do",
        user_id=manager.id,
        assignee_ids=[manager.id, employee_1.id],
        department_id=dept_mgmt.id,
    )
    created_task = await task_service.create_task(db, founder, task_data)
    assert created_task.id is not None

    # Attach file & voice note
    file_record = TaskFile(
        task_id=created_task.id,
        user_id=founder.id,
        file_url="/storage/download?bucket=task_attachments&storage_path=spec.pdf",
        file_name="spec.pdf",
        file_size=1024,
        mime_type="application/pdf",
        storage_path="spec.pdf",
    )
    voice_record = TaskVoiceNote(
        task_id=created_task.id,
        creator_id=founder.id,
        storage_path="audio_123.m4a",
        display_name="Voice Note 1",
        note_number=1,
        duration_seconds=15.5,
        mime_type="audio/m4a",
    )
    db.add_all([file_record, voice_record])
    await db.commit()

    # Verification as Manager (assigned across department boundaries)
    fetched_by_manager = await task_service.get_task_by_id(db, created_task.id, manager)
    assert fetched_by_manager is not None
    assert fetched_by_manager.title == "Critical Multi-Assignee Task with Media"
    assert len(fetched_by_manager.assignees) == 2
    assert len(fetched_by_manager.files) == 1
    assert len(fetched_by_manager.voice_notes) == 1

    # Verification as Employee 1 (multi-assignee)
    fetched_by_emp1 = await task_service.get_task_by_id(db, created_task.id, employee_1)
    assert fetched_by_emp1 is not None

    # Verification as Cross-Company User (MUST be denied with 403)
    with pytest.raises(Exception):
        await task_service.get_task_by_id(db, created_task.id, cross_company_user)
