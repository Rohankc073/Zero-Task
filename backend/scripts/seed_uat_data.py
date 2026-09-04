"""
UAT Seeding Script for Phase 4 Real Mobile End-to-End Verification.
Seeds:
- Super Admin
- Company A (Acme Corp): Founder, Dept Head, Manager, Employee
- Company B (Beta Global): Founder, Dept Head, Manager, Employee
- Operational Data:
  - Standard tasks, multi-assignee tasks, segregated child tasks, overdue tasks
  - Task attachments, task voice notes, task comments
  - Meetings, meeting participants, meeting approval requests
  - Phone change approval requests, password reset requests
  - Projects and project milestones
  - Company chat channels, direct 1:1 chat channels and messages
  - In-app notifications
  - Personal user notes
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import text, select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.company import Company
from app.models.user import Department, Designation, User, UserCredential, UserNote
from app.models.task import Task, TaskAssignee, TaskAttachment, TaskVoiceNote, Comment
from app.models.meeting import Meeting, MeetingParticipant, MeetingApproval, MeetingRequest
from app.models.approval import Approval, PasswordReset, PhoneChangeRequest
from app.models.project import Project, ProjectMilestone, ProjectMember
from app.models.chat import ChatChannel, ChatMessage
from app.models.notification import InAppNotification
from app.core.logging import logger


async def seed_uat_data():
    logger.info("Initializing Phase 4 UAT Database Seeding...")
    password_hash = get_password_hash("Test@123")

    async with AsyncSessionLocal() as db:
        # ----------------------------------------------------
        # 1. SUPER ADMIN
        # ----------------------------------------------------
        res = await db.execute(select(User).where(User.email == "superadmin@zerotask.internal"))
        sa_user = res.scalar_one_or_none()
        if not sa_user:
            sa_user = User(
                email="superadmin@zerotask.internal",
                name="Platform Super Admin",
                full_name="Platform Super Admin",
                role="Super Admin",
                is_approved=True,
                is_active=True,
            )
            db.add(sa_user)
            await db.flush()
            db.add(UserCredential(user_id=sa_user.id, password_hash=password_hash))
        else:
            sa_user.is_active = True
            sa_user.is_approved = True

        # ----------------------------------------------------
        # 2. COMPANY A (Acme Technologies)
        # ----------------------------------------------------
        c_a_res = await db.execute(select(Company).where(Company.code == "ACME_UAT"))
        comp_a = c_a_res.scalar_one_or_none()
        if not comp_a:
            comp_a = Company(name="Acme Technologies", code="ACME_UAT", industry="Software Engineering", status="Active")
            db.add(comp_a)
            await db.flush()

        # Departments & Designations A
        dept_a_eng = (await db.execute(select(Department).where(Department.company_id == comp_a.id, Department.name == "Engineering"))).scalar_one_or_none()
        if not dept_a_eng:
            dept_a_eng = Department(name="Engineering", description="Core Platform & Engineering", company_id=comp_a.id)
            db.add(dept_a_eng)
            await db.flush()

        dept_a_qa = (await db.execute(select(Department).where(Department.company_id == comp_a.id, Department.name == "Quality Assurance"))).scalar_one_or_none()
        if not dept_a_qa:
            dept_a_qa = Department(name="Quality Assurance", description="QA and Reliability", company_id=comp_a.id)
            db.add(dept_a_qa)
            await db.flush()

        desig_a_lead = (await db.execute(select(Designation).where(Designation.company_id == comp_a.id, Designation.name == "Lead Architect"))).scalar_one_or_none()
        if not desig_a_lead:
            desig_a_lead = Designation(name="Lead Architect", base_role="Department Head", company_id=comp_a.id)
            db.add(desig_a_lead)
            await db.flush()

        # Users Company A: Founder, Dept Head, Manager, Employee
        users_a_specs = [
            ("founder.a@acme.com", "Alice Founder", "Founder", dept_a_eng.id, None),
            ("depthead.a@acme.com", "David Head", "Department Head", dept_a_eng.id, desig_a_lead.id),
            ("manager.a@acme.com", "Mark Manager", "Manager", dept_a_eng.id, None),
            ("employee.a@acme.com", "Eve Employee", "Employee", dept_a_eng.id, None),
        ]
        users_a = {}
        for email, full_name, role, dept_id, desig_id in users_a_specs:
            u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if not u:
                u = User(
                    email=email,
                    name=full_name,
                    full_name=full_name,
                    role=role,
                    company_id=comp_a.id,
                    department_id=dept_id,
                    designation_id=desig_id,
                    phone_number="+1555010001",
                    is_approved=True,
                    is_active=True,
                    onboarding_completed=True,
                )
                db.add(u)
                await db.flush()
                db.add(UserCredential(user_id=u.id, password_hash=password_hash))
            else:
                u.company_id = comp_a.id
                u.role = role
                u.is_active = True
                u.is_approved = True
            users_a[role] = u

        # ----------------------------------------------------
        # 3. COMPANY B (Beta Global Financial)
        # ----------------------------------------------------
        c_b_res = await db.execute(select(Company).where(Company.code == "BETA_UAT"))
        comp_b = c_b_res.scalar_one_or_none()
        if not comp_b:
            comp_b = Company(name="Beta Global Financial", code="BETA_UAT", industry="Financial Services", status="Active")
            db.add(comp_b)
            await db.flush()

        dept_b_fin = (await db.execute(select(Department).where(Department.company_id == comp_b.id, Department.name == "Finance"))).scalar_one_or_none()
        if not dept_b_fin:
            dept_b_fin = Department(name="Finance", description="Corporate Finance & Auditing", company_id=comp_b.id)
            db.add(dept_b_fin)
            await db.flush()

        users_b_specs = [
            ("founder.b@beta.com", "Bob Founder", "Founder", dept_b_fin.id),
            ("depthead.b@beta.com", "Diana Head", "Department Head", dept_b_fin.id),
            ("manager.b@beta.com", "Michael Manager", "Manager", dept_b_fin.id),
            ("employee.b@beta.com", "Brian Employee", "Employee", dept_b_fin.id),
        ]
        users_b = {}
        for email, full_name, role, dept_id in users_b_specs:
            u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if not u:
                u = User(
                    email=email,
                    name=full_name,
                    full_name=full_name,
                    role=role,
                    company_id=comp_b.id,
                    department_id=dept_id,
                    phone_number="+1555020002",
                    is_approved=True,
                    is_active=True,
                    onboarding_completed=True,
                )
                db.add(u)
                await db.flush()
                db.add(UserCredential(user_id=u.id, password_hash=password_hash))
            else:
                u.company_id = comp_b.id
                u.role = role
                u.is_active = True
                u.is_approved = True
            users_b[role] = u

        # ----------------------------------------------------
        # 4. COMPANY A OPERATIONAL DATA
        # ----------------------------------------------------
        now = datetime.now(timezone.utc)

        # 4.1 Projects & Milestones
        proj_a = (await db.execute(select(Project).where(Project.company_id == comp_a.id, Project.name == "Self-Hosted Cloud Infrastructure"))).scalar_one_or_none()
        if not proj_a:
            proj_a = Project(
                name="Self-Hosted Cloud Infrastructure",
                description="Migration of core workloads to private VPS infrastructure",
                status="Active",
                owner_id=users_a["Founder"].id,
                department_id=dept_a_eng.id,
                company_id=comp_a.id,
                start_date=now - timedelta(days=10),
                end_date=now + timedelta(days=30),
            )
            db.add(proj_a)
            await db.flush()
            db.add(ProjectMember(project_id=proj_a.id, user_id=users_a["Manager"].id))
            db.add(ProjectMember(project_id=proj_a.id, user_id=users_a["Employee"].id))

            milestone_a1 = ProjectMilestone(
                project_id=proj_a.id,
                title="Phase 4 Acceptance Milestone",
                description="Final UAT validation and feature parity check",
                due_date=now + timedelta(days=7),
                status="In Progress",
                owner_id=users_a["Manager"].id,
                created_by=users_a["Founder"].id,
                progress=80,
            )
            db.add(milestone_a1)
            await db.flush()
        else:
            m_res = await db.execute(select(ProjectMilestone).where(ProjectMilestone.project_id == proj_a.id))
            milestone_a1 = m_res.scalars().first()

        # 4.2 Standard Task
        task_standard = Task(
            title="Deploy Microservices Container Cluster",
            description="Deploy and configure FastAPI backend nodes with SSL termination.",
            status="In Progress",
            priority="High",
            due_date=now + timedelta(days=3),
            user_id=users_a["Employee"].id,
            created_by=users_a["Manager"].id,
            department_id=dept_a_eng.id,
            company_id=comp_a.id,
            progress=50,
            milestone_id=milestone_a1.id if milestone_a1 else None,
        )
        db.add(task_standard)
        await db.flush()
        db.add(TaskAssignee(task_id=task_standard.id, user_id=users_a["Employee"].id))

        # Task Attachment & Voice Note
        db.add(TaskAttachment(
            task_id=task_standard.id,
            file_name="architecture_spec.pdf",
            file_url="http://localhost:8088/api/v1/storage/download-url?bucket=task_attachments&file_path=tasks/architecture_spec.pdf",
            file_size=1024 * 350,
            file_type="application/pdf",
            uploaded_by=users_a["Manager"].id,
        ))
        db.add(TaskVoiceNote(
            task_id=task_standard.id,
            creator_id=users_a["Manager"].id,
            storage_path="voice_notes/cluster_deployment_instructions.m4a",
            display_name="Deployment Architecture Audio Brief",
            note_number=1,
            duration_seconds=45.5,
            mime_type="audio/m4a",
            file_size=1024 * 128,
        ))
        db.add(Comment(
            task_id=task_standard.id,
            user_id=users_a["Employee"].id,
            content="Configuration files validated. Proceeding with deployment dry-run.",
        ))

        # 4.3 Multi-Assignee Task
        task_multi = Task(
            title="Security Audit and Hardening Review",
            description="Perform cross-service isolation penetration testing.",
            status="To Do",
            priority="High",
            due_date=now + timedelta(days=4),
            user_id=users_a["Manager"].id,
            created_by=users_a["Founder"].id,
            department_id=dept_a_eng.id,
            company_id=comp_a.id,
            progress=15,
        )
        db.add(task_multi)
        await db.flush()
        db.add(TaskAssignee(task_id=task_multi.id, user_id=users_a["Manager"].id))
        db.add(TaskAssignee(task_id=task_multi.id, user_id=users_a["Employee"].id))

        # 4.4 Segregated Task & Child Tasks
        task_parent = Task(
            title="Database Schema Migration Execution",
            description="Parent task overseeing table transitions and index rebuilding.",
            status="In Progress",
            priority="High",
            due_date=now + timedelta(days=2),
            user_id=users_a["Manager"].id,
            created_by=users_a["Founder"].id,
            department_id=dept_a_eng.id,
            company_id=comp_a.id,
            progress=30,
        )
        db.add(task_parent)
        await db.flush()

        task_child1 = Task(
            title="Rebuild Foreign Key Indexes",
            description="Subtask: verify constraints on users and companies tables.",
            status="Done",
            priority="Medium",
            due_date=now + timedelta(days=1),
            user_id=users_a["Employee"].id,
            created_by=users_a["Manager"].id,
            parent_task_id=task_parent.id,
            department_id=dept_a_eng.id,
            company_id=comp_a.id,
            progress=100,
        )
        task_child2 = Task(
            title="Validate Alembic Head Migrations",
            description="Subtask: run migration upgrade head verification.",
            status="In Progress",
            priority="High",
            due_date=now + timedelta(days=2),
            user_id=users_a["Manager"].id,
            created_by=users_a["Manager"].id,
            parent_task_id=task_parent.id,
            department_id=dept_a_eng.id,
            company_id=comp_a.id,
            progress=50,
        )
        db.add_all([task_child1, task_child2])
        await db.flush()
        db.add(TaskAssignee(task_id=task_child1.id, user_id=users_a["Employee"].id))
        db.add(TaskAssignee(task_id=task_child2.id, user_id=users_a["Manager"].id))

        # 4.5 Overdue Task
        task_overdue = Task(
            title="Review Legacy API Gateway Logs",
            description="Audit deprecated PostgREST query logs for remaining endpoints.",
            status="To Do",
            priority="Medium",
            due_date=now - timedelta(days=3),  # Intentionally overdue
            user_id=users_a["Employee"].id,
            created_by=users_a["Department Head"].id,
            department_id=dept_a_eng.id,
            company_id=comp_a.id,
            progress=0,
        )
        db.add(task_overdue)
        await db.flush()
        db.add(TaskAssignee(task_id=task_overdue.id, user_id=users_a["Employee"].id))

        # 4.6 Meetings & Multi-Level Approvals
        meeting_sync = Meeting(
            title="Acme Architecture Review",
            agenda="Sprint alignment on self-hosted service architecture",
            start_time=now + timedelta(days=1, hours=2),
            end_time=now + timedelta(days=1, hours=3),
            organizer_id=users_a["Manager"].id,
            company_id=comp_a.id,
            status="Scheduled",
        )
        db.add(meeting_sync)
        await db.flush()
        db.add(MeetingParticipant(meeting_id=meeting_sync.id, user_id=users_a["Founder"].id, role="attendee"))
        db.add(MeetingParticipant(meeting_id=meeting_sync.id, user_id=users_a["Department Head"].id, role="attendee"))
        db.add(MeetingParticipant(meeting_id=meeting_sync.id, user_id=users_a["Employee"].id, role="attendee"))

        meeting_approval_req = Meeting(
            title="External Vendor Integration Review",
            agenda="Requires multi-tier approval from Department Head and Founder",
            start_time=now + timedelta(days=3),
            end_time=now + timedelta(days=3, hours=1),
            organizer_id=users_a["Employee"].id,
            company_id=comp_a.id,
            status="Pending_Approval",
        )
        db.add(meeting_approval_req)
        await db.flush()
        db.add(MeetingApproval(
            meeting_id=meeting_approval_req.id,
            approver_id=users_a["Department Head"].id,
            requester_id=users_a["Employee"].id,
            status="Pending",
        ))
        db.add(MeetingApproval(
            meeting_id=meeting_approval_req.id,
            approver_id=users_a["Founder"].id,
            requester_id=users_a["Employee"].id,
            status="Pending",
        ))

        # 4.7 Other Operational Approvals (Phone & Password Reset)
        db.add(PhoneChangeRequest(
            user_id=users_a["Employee"].id,
            new_phone="+15559998888",
            old_phone="+1555010001",
            status="Pending",
        ))
        db.add(PasswordReset(
            email=users_a["Employee"].email,
            requester_id=users_a["Employee"].id,
            approver_id=users_a["Manager"].id,
            status="Pending",
        ))
        db.add(Approval(
            task_id=task_standard.id,
            requester_id=users_a["Employee"].id,
            approver_id=users_a["Manager"].id,
            status="pending",
            comments="Requesting sign-off on cluster configuration parameters.",
        ))

        # 4.8 Chat Channels (Company General & Direct 1:1)
        channel_gen_a = (await db.execute(select(ChatChannel).where(ChatChannel.company_id == comp_a.id, ChatChannel.name == "General"))).scalar_one_or_none()
        if not channel_gen_a:
            channel_gen_a = ChatChannel(
                name="General",
                type="public",
                company_id=comp_a.id,
                is_private=False,
            )
            db.add(channel_gen_a)
            await db.flush()

        db.add(ChatMessage(
            channel_id=channel_gen_a.id,
            user_id=users_a["Founder"].id,
            content="Welcome team to the self-hosted ZeroTask workspace!",
        ))
        db.add(ChatMessage(
            channel_id=channel_gen_a.id,
            user_id=users_a["Manager"].id,
            content="All systems operational on private infrastructure.",
        ))

        # Direct 1:1 Chat between Manager A and Employee A
        p1_id, p2_id = sorted([users_a["Manager"].id, users_a["Employee"].id])
        dm_channel_a = (await db.execute(select(ChatChannel).where(
            ChatChannel.company_id == comp_a.id,
            ChatChannel.type == "direct",
            ChatChannel.participant_one_id == p1_id,
            ChatChannel.participant_two_id == p2_id,
        ))).scalar_one_or_none()
        if not dm_channel_a:
            dm_channel_a = ChatChannel(
                name="Direct Chat",
                type="direct",
                company_id=comp_a.id,
                participant_one_id=p1_id,
                participant_two_id=p2_id,
                is_private=True,
            )
            db.add(dm_channel_a)
            await db.flush()

        db.add(ChatMessage(
            channel_id=dm_channel_a.id,
            user_id=users_a["Manager"].id,
            content="Hey Eve, please review the cluster deployment spec when ready.",
        ))
        db.add(ChatMessage(
            channel_id=dm_channel_a.id,
            user_id=users_a["Employee"].id,
            content="On it Mark, will test container health checks next.",
        ))

        # 4.9 In-App Notifications
        db.add(InAppNotification(
            user_id=users_a["Employee"].id,
            title="Task Assigned: Deploy Microservices Cluster",
            message="Mark Manager has assigned you to Deploy Microservices Container Cluster.",
            type="task_assignment",
            is_read=False,
        ))
        db.add(InAppNotification(
            user_id=users_a["Department Head"].id,
            title="Meeting Approval Required",
            message="Eve Employee has requested approval for External Vendor Integration Review.",
            type="meeting_approval",
            is_read=False,
        ))

        # 4.10 Personal User Notes
        db.add(UserNote(
            user_id=users_a["Founder"].id,
            title="Confidential Founder Strategic Objectives",
            content="Target zero reliance on 3rd-party BaaS platforms. Keep all client data private.",
        ))
        db.add(UserNote(
            user_id=users_a["Employee"].id,
            title="Daily Standup Notes",
            content="1. Finish cluster health checks\n2. Prepare UAT report\n3. Review direct chat messages",
        ))

        # ----------------------------------------------------
        # 5. COMPANY B OPERATIONAL DATA (ISOLATION TEST SUITE)
        # ----------------------------------------------------
        task_b = Task(
            title="Q3 Balance Sheet Reconciliation",
            description="Beta Global confidential internal financial audit.",
            status="In Progress",
            priority="High",
            due_date=now + timedelta(days=5),
            user_id=users_b["Employee"].id,
            created_by=users_b["Manager"].id,
            department_id=dept_b_fin.id,
            company_id=comp_b.id,
            progress=25,
        )
        db.add(task_b)
        await db.flush()
        db.add(TaskAssignee(task_id=task_b.id, user_id=users_b["Employee"].id))

        channel_gen_b = (await db.execute(select(ChatChannel).where(ChatChannel.company_id == comp_b.id, ChatChannel.name == "General"))).scalar_one_or_none()
        if not channel_gen_b:
            channel_gen_b = ChatChannel(
                name="General",
                type="public",
                company_id=comp_b.id,
                is_private=False,
            )
            db.add(channel_gen_b)
            await db.flush()

        db.add(ChatMessage(
            channel_id=channel_gen_b.id,
            user_id=users_b["Founder"].id,
            content="Beta Global team announcement: Q3 financial audit starts Monday.",
        ))

        db.add(UserNote(
            user_id=users_b["Founder"].id,
            title="Beta Private Financial Projections",
            content="Strictly confidential: Q4 enterprise budget projections.",
        ))

        await db.commit()
        logger.info("Phase 4 UAT Database Seeding Completed Successfully!")


if __name__ == "__main__":
    asyncio.run(seed_uat_data())
