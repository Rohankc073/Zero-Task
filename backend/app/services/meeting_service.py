from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.meeting import Meeting, MeetingParticipant, MeetingApproval
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingUpdate


class MeetingService:
    @staticmethod
    async def create_meeting(
        db: AsyncSession, current_user: User, data: MeetingCreate
    ) -> Meeting:
        new_meeting = Meeting(
            title=data.title,
            agenda=data.agenda,
            description=data.description,
            start_time=data.start_time,
            end_time=data.end_time,
            organizer_id=current_user.id,
            project_id=data.project_id,
            company_id=current_user.company_id,
            meeting_link=data.meeting_link,
            is_private=data.is_private,
            status="Scheduled",
        )
        db.add(new_meeting)
        await db.flush()

        # Add organizer as participant
        db.add(
            MeetingParticipant(
                meeting_id=new_meeting.id,
                user_id=current_user.id,
                role="organizer",
                status="accepted",
            )
        )

        # Add invited participants
        for p_id in data.participant_ids or []:
            if p_id != current_user.id:
                db.add(
                    MeetingParticipant(
                        meeting_id=new_meeting.id,
                        user_id=p_id,
                        role="attendee",
                        status="pending",
                    )
                )

        await db.commit()
        await db.refresh(new_meeting)
        return new_meeting

    @staticmethod
    async def process_approval(
        db: AsyncSession, approval_id: UUID, current_user: User, action: str, reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """Approves or rejects a meeting clearance request."""
        try:
            res = await db.execute(
                text("SELECT public.process_meeting_approval(:app_id, :act, :rsn)"),
                {"app_id": str(approval_id), "act": action, "rsn": reason or ""},
            )
            val = res.scalar()
            await db.commit()
            return val if isinstance(val, dict) else {"status": "success"}
        except Exception:
            await db.rollback()
            stmt = select(MeetingApproval).where(MeetingApproval.id == approval_id)
            res = await db.execute(stmt)
            approval = res.scalar_one_or_none()
            if not approval:
                raise HTTPException(status_code=404, detail="Approval request not found")

            approval.status = action
            approval.decision_reason = reason
            await db.commit()
            return {"status": action, "approval_id": str(approval_id)}

    @staticmethod
    async def cleanup_completed_meetings(db: AsyncSession) -> int:
        """Marks past meetings as Completed."""
        try:
            await db.execute(text("SELECT public.cleanup_and_complete_meetings()"))
            await db.commit()
            return 1
        except Exception:
            await db.rollback()
            stmt = (
                update(Meeting)
                .where(Meeting.end_time < datetime.now(timezone.utc), Meeting.status == "Scheduled")
                .values(status="Completed")
            )
            res = await db.execute(stmt)
            await db.commit()
            return res.rowcount


meeting_service = MeetingService()
