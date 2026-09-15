import json
from typing import Dict, Any, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from fastapi import HTTPException, status
from app.models.company import Company
from app.models.user import User
from app.models.chat import ChatChannel
from app.core.logging import logger
from app.core.security import get_password_hash


class SuperAdminService:
    @staticmethod
    async def create_company_and_founder(
        db: AsyncSession,
        company_name: str,
        founder_name: str,
        founder_email: str,
        founder_phone: str = "",
        initial_password: str = "Test@123",
    ) -> Dict[str, Any]:
        """Atomically provisions a company, founder account, and default organization records."""
        clean_email = founder_email.lower().strip()
        clean_company = company_name.strip()

        if not clean_email or "@" not in clean_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid founder email address is required.",
            )

        if not clean_company:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company name is required.",
            )

        # Check for existing email in users table
        existing_user = await db.execute(select(User).where(User.email == clean_email))
        if existing_user.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A user with email '{clean_email}' already exists. Please choose a different founder email.",
            )

        # Check for existing company name
        existing_comp = await db.execute(select(Company).where(Company.name == clean_company))
        if existing_comp.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A company named '{clean_company}' already exists. Please choose a different company name.",
            )

        try:
            raw_password = initial_password.strip() if initial_password and initial_password.strip() else "Test@123"
            hashed_password = get_password_hash(raw_password)

            res = await db.execute(
                text(
                    "SELECT public.create_company_and_founder(:c_name, :f_name, :f_email, :f_phone, :f_pass)"
                ),
                {
                    "c_name": clean_company,
                    "f_name": founder_name.strip(),
                    "f_email": clean_email,
                    "f_phone": founder_phone.strip(),
                    "f_pass": hashed_password,
                },
            )
            val = res.scalar()
            result_data = val if isinstance(val, dict) else json.loads(val)
            
            # Explicitly upsert user_credentials to guarantee valid bcrypt hash
            founder_id = result_data.get("founder_id")
            if founder_id:
                await db.execute(
                    text(
                        "INSERT INTO public.user_credentials (user_id, password_hash) "
                        "VALUES (:uid, :pw_hash) "
                        "ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash"
                    ),
                    {"uid": str(founder_id), "pw_hash": hashed_password},
                )

            company_id = result_data.get("company_id")
            if company_id:
                gen_chan = ChatChannel(
                    name="General",
                    type="public",
                    company_id=UUID(str(company_id)),
                    is_private=False,
                )
                db.add(gen_chan)

            await db.commit()
            return result_data
        except HTTPException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            err_str = str(e).lower()
            if "duplicate key" in err_str or "unique constraint" in err_str or "ix_users_email" in err_str:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A user with email '{clean_email}' already exists. Please choose a different founder email.",
                )
            if "companies_name" in err_str:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A company named '{clean_company}' already exists. Please choose a different company name.",
                )
            logger.error(f"Failed invoking create_company_and_founder procedure: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create company: {str(e)}",
            )

    @staticmethod
    async def delete_company(
        db: AsyncSession, company_id: UUID, current_user: Any = None
    ) -> Dict[str, Any]:
        """Cascades deletion of company and all attached tenant accounts, messages, tasks, and artifacts.
        Preserves Super Admin accounts unconditionally.
        Enforces strict prerequisite: Company MUST be deactivated before it can be deleted.
        Only accessible by Super Admin profiles.
        """
        if current_user and getattr(current_user, "role", None) != "Super Admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: only Super Admin profile has permission to delete companies.",
            )

        # 1. Fetch company and verify existence & deactivation status
        stmt = select(Company).where(Company.id == company_id)
        res = await db.execute(stmt)
        company = res.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        # Strict Rule: Super Admin must deactivate the company before deleting it
        if company.status and company.status.strip().lower() == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company is currently Active. You must deactivate the company before deleting it.",
            )

        c_str = str(company_id)

        try:
            # 1. Detach any Super Admin from this company to guarantee preservation
            await db.execute(
                text("UPDATE public.users SET company_id = NULL, department_id = NULL, designation_id = NULL WHERE role = 'Super Admin' AND company_id = :c_id"),
                {"c_id": c_str},
            )

            # 2. Collect tenant user IDs (strictly excluding Super Admin)
            user_res = await db.execute(
                text("SELECT id FROM public.users WHERE company_id = :c_id AND role != 'Super Admin'"),
                {"c_id": c_str},
            )
            user_ids = [str(r[0]) for r in user_res.fetchall()]

            # 3. Break circular foreign key dependencies before deleting records
            await db.execute(
                text("UPDATE public.users SET department_id = NULL, designation_id = NULL WHERE company_id = :c_id"),
                {"c_id": c_str},
            )
            await db.execute(
                text("UPDATE public.tasks SET parent_task_id = NULL, project_id = NULL, department_id = NULL, user_id = NULL, created_by = NULL WHERE company_id = :c_id"),
                {"c_id": c_str},
            )
            await db.execute(
                text("UPDATE public.projects SET owner_id = NULL, department_id = NULL WHERE company_id = :c_id"),
                {"c_id": c_str},
            )
            await db.execute(
                text("UPDATE public.meetings SET organizer_id = NULL, project_id = NULL WHERE company_id = :c_id"),
                {"c_id": c_str},
            )
            await db.execute(
                text("UPDATE public.chat_channels SET department_id = NULL, participant_one_id = NULL, participant_two_id = NULL WHERE company_id = :c_id"),
                {"c_id": c_str},
            )

            if user_ids:
                for uid in user_ids:
                    await db.execute(
                        text("UPDATE public.tasks SET parent_task_id = NULL, project_id = NULL, department_id = NULL, user_id = NULL, created_by = NULL WHERE user_id = :uid OR created_by = :uid"),
                        {"uid": uid},
                    )
                    await db.execute(
                        text("UPDATE public.projects SET owner_id = NULL, department_id = NULL WHERE owner_id = :uid"),
                        {"uid": uid},
                    )
                    await db.execute(
                        text("UPDATE public.meetings SET organizer_id = NULL, project_id = NULL WHERE organizer_id = :uid"),
                        {"uid": uid},
                    )
                    await db.execute(
                        text("UPDATE public.chat_channels SET department_id = NULL, participant_one_id = NULL, participant_two_id = NULL WHERE participant_one_id = :uid OR participant_two_id = :uid"),
                        {"uid": uid},
                    )

            # 4. Cascade delete task sub-records
            await db.execute(
                text("DELETE FROM public.task_voice_notes WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.task_files WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.task_attachments WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.task_assignees WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.task_milestones WHERE user_id IN (SELECT id FROM public.users WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.comments WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.activity_comments WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.execution_activity WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.approvals WHERE task_id IN (SELECT id FROM public.tasks WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )

            # 5. Cascade delete tasks
            await db.execute(
                text("DELETE FROM public.tasks WHERE company_id = :c_id"),
                {"c_id": c_str},
            )

            # 6. Cascade delete chat messages and channels
            await db.execute(
                text("DELETE FROM public.chat_messages WHERE channel_id IN (SELECT id FROM public.chat_channels WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.chat_channels WHERE company_id = :c_id"),
                {"c_id": c_str},
            )

            # 7. Cascade delete meeting sub-records and meetings
            await db.execute(
                text("DELETE FROM public.meeting_files WHERE meeting_id IN (SELECT id FROM public.meetings WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.meeting_attachments WHERE meeting_id IN (SELECT id FROM public.meetings WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.meeting_participants WHERE meeting_id IN (SELECT id FROM public.meetings WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.meeting_approvals WHERE meeting_id IN (SELECT id FROM public.meetings WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.meetings WHERE company_id = :c_id"),
                {"c_id": c_str},
            )

            # 8. Cascade delete projects & milestones
            await db.execute(
                text("DELETE FROM public.project_milestones WHERE project_id IN (SELECT id FROM public.projects WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.project_members WHERE project_id IN (SELECT id FROM public.projects WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.department_milestones WHERE company_id = :c_id"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.projects WHERE company_id = :c_id"),
                {"c_id": c_str},
            )

            # 9. Cascade delete alerts, and company audit logs
            await db.execute(
                text("DELETE FROM public.system_alerts WHERE department_id IN (SELECT id FROM public.departments WHERE company_id = :c_id)"),
                {"c_id": c_str},
            )
            await db.execute(
                text("DELETE FROM public.audit_logs WHERE company_id = :c_id"),
                {"c_id": c_str},
            )

            # 10. Delete user-specific records for all company users
            if user_ids:
                for uid in user_ids:
                    await db.execute(text("DELETE FROM public.task_voice_notes WHERE creator_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.task_files WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.task_attachments WHERE uploaded_by = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.task_assignees WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.task_milestones WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.comments WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.activity_comments WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.execution_activity WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.approvals WHERE requester_id = :uid OR approver_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.chat_messages WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.chat_channels WHERE participant_one_id = :uid OR participant_two_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.meeting_files WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.meeting_attachments WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.meeting_participants WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.meeting_approvals WHERE approver_id = :uid OR requester_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.meeting_requests WHERE requester_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.project_milestones WHERE owner_id = :uid OR created_by = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.project_members WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.password_resets WHERE requester_id = :uid OR approver_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.phone_change_requests WHERE user_id = :uid OR approved_by = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.notifications WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.in_app_notifications WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.user_notes WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.user_integrations WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.user_push_tokens WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.user_refresh_tokens WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.user_credentials WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.activity_logs WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.audit_logs WHERE user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.tasks WHERE created_by = :uid OR user_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.meetings WHERE organizer_id = :uid"), {"uid": uid})
                    await db.execute(text("DELETE FROM public.projects WHERE owner_id = :uid"), {"uid": uid})

            # 11. Delete tenant users
            await db.execute(
                text("DELETE FROM public.users WHERE company_id = :c_id AND role != 'Super Admin'"),
                {"c_id": c_str},
            )
            if user_ids:
                for uid in user_ids:
                    await db.execute(
                        text("DELETE FROM public.users WHERE id = :uid AND role != 'Super Admin'"),
                        {"uid": uid},
                    )

            # 12. Delete departments & designations
            await db.execute(text("DELETE FROM public.departments WHERE company_id = :c_id"), {"c_id": c_str})
            await db.execute(text("DELETE FROM public.designations WHERE company_id = :c_id"), {"c_id": c_str})

            # 13. Delete the company itself
            await db.execute(text("DELETE FROM public.companies WHERE id = :c_id"), {"c_id": c_str})

            await db.commit()
            return {
                "success": True,
                "deleted_company_id": c_str,
                "deleted_users_count": len(user_ids),
                "message": "Company and all associated tenant data permanently deleted.",
            }
        except HTTPException:
            await db.rollback()
            raise
        except Exception as cascade_err:
            await db.rollback()
            logger.error(f"Cascade delete failed for company {company_id}: {cascade_err}")
            raise HTTPException(status_code=500, detail=f"Failed to delete company: {str(cascade_err)}")


    @staticmethod
    async def list_companies(db: AsyncSession) -> List[Company]:
        stmt = select(Company).order_by(Company.created_at.desc())
        res = await db.execute(stmt)
        return list(res.scalars().all())


superadmin_service = SuperAdminService()
