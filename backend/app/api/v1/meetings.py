from typing import List, Any, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.meeting import Meeting, MeetingParticipant, MeetingFile, MeetingApproval
from app.schemas.user import UserResponse
from app.schemas.meeting import (
    MeetingCreate,
    MeetingUpdate,
    MeetingResponse,
    MeetingApprovalAction,
    MeetingApprovalResponse,
    MeetingFileCreate,
    MeetingFileResponse,
    MeetingParticipantResponse,
)
from app.services.meeting_service import meeting_service

router = APIRouter()


@router.get("/eligible-participants", response_model=List[UserResponse])
async def get_eligible_participants(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns authoritative list of eligible users for meeting scheduling based on caller's role and company."""
    return await meeting_service.get_eligible_participants(db, current_user)


@router.get("", response_model=List[MeetingResponse])
async def list_meetings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Meeting)
        .options(
            selectinload(Meeting.organizer),
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
            selectinload(Meeting.approvals).selectinload(MeetingApproval.approver),
            selectinload(Meeting.approvals).selectinload(MeetingApproval.requester),
            selectinload(Meeting.files),
        )
        .order_by(Meeting.start_time.asc())
    )

    if current_user.role == "Super Admin":
        pass
    elif current_user.role == "Founder":
        stmt = stmt.where(Meeting.company_id == current_user.company_id)
    else:
        # Part B: Strict Meeting Privacy
        # Only organizer, participant, approver, or requester can view
        participant_subquery = select(MeetingParticipant.meeting_id).where(MeetingParticipant.user_id == current_user.id)
        approval_subquery = select(MeetingApproval.meeting_id).where(
            or_(
                MeetingApproval.approver_id == current_user.id,
                MeetingApproval.requester_id == current_user.id,
            )
        )
        stmt = stmt.where(
            Meeting.company_id == current_user.company_id,
            or_(
                Meeting.organizer_id == current_user.id,
                Meeting.id.in_(participant_subquery),
                Meeting.id.in_(approval_subquery),
            ),
        )

    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    data: MeetingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    meeting = await meeting_service.create_meeting(db, current_user, data)
    stmt = (
        select(Meeting)
        .options(
            selectinload(Meeting.organizer),
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
            selectinload(Meeting.approvals).selectinload(MeetingApproval.approver),
            selectinload(Meeting.approvals).selectinload(MeetingApproval.requester),
            selectinload(Meeting.files),
        )
        .where(Meeting.id == meeting.id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Meeting)
        .options(
            selectinload(Meeting.organizer),
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
            selectinload(Meeting.approvals).selectinload(MeetingApproval.approver),
            selectinload(Meeting.approvals).selectinload(MeetingApproval.requester),
            selectinload(Meeting.files),
        )
        .where(Meeting.id == meeting_id)
    )
    res = await db.execute(stmt)
    meeting = res.scalar_one_or_none()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if current_user.role != "Super Admin" and meeting.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access violation")

    if current_user.role not in ["Super Admin", "Founder"]:
        is_participant = (
            meeting.organizer_id == current_user.id
            or any(p.user_id == current_user.id for p in meeting.participants)
            or any(
                a.approver_id == current_user.id or a.requester_id == current_user.id
                for a in meeting.approvals
            )
        )
        if not is_participant:
            raise HTTPException(status_code=403, detail="Access denied to meeting")

    return meeting


@router.patch("/{meeting_id}", response_model=MeetingResponse)
async def update_meeting(
    meeting_id: UUID,
    data: MeetingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Meeting).where(Meeting.id == meeting_id)
    res = await db.execute(stmt)
    meeting = res.scalar_one_or_none()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if current_user.role != "Super Admin" and meeting.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access violation")

    if meeting.organizer_id != current_user.id and current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=403, detail="Only organizer can edit meeting")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(meeting, k, v)

    await db.commit()
    await db.refresh(meeting)
    return await get_meeting(meeting_id, current_user, db)


@router.delete("/{meeting_id}")
async def cancel_meeting_delete(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Authoritatively cancels a meeting under hierarchy rules."""
    meeting = await meeting_service.cancel_meeting(db, meeting_id, current_user)
    return {
        "message": "Meeting cancelled successfully",
        "id": str(meeting.id),
        "status": meeting.status,
    }


@router.post("/{meeting_id}/cancel")
async def cancel_meeting_post(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Authoritatively cancels a meeting under hierarchy rules."""
    meeting = await meeting_service.cancel_meeting(db, meeting_id, current_user)
    return {
        "message": "Meeting cancelled successfully",
        "id": str(meeting.id),
        "status": meeting.status,
    }


@router.post("/approvals/{approval_id}/process")
async def process_meeting_approval(
    approval_id: UUID,
    data: MeetingApprovalAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reason = data.reason or data.decision_reason
    return await meeting_service.process_approval(
        db, approval_id, current_user, data.action, reason
    )


@router.post("/{meeting_id}/approval")
async def process_meeting_approval_by_meeting(
    meeting_id: UUID,
    data: MeetingApprovalAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reason = data.reason or data.decision_reason
    return await meeting_service.process_approval(
        db, meeting_id, current_user, data.action, reason
    )


@router.get("/{meeting_id}/approvals", response_model=List[MeetingApprovalResponse])
async def list_meeting_approvals(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(MeetingApproval)
        .options(selectinload(MeetingApproval.approver), selectinload(MeetingApproval.requester))
        .where(MeetingApproval.meeting_id == meeting_id)
        .order_by(MeetingApproval.created_at.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


# --- Meeting Files Endpoints ---

@router.get("/{meeting_id}/files", response_model=List[MeetingFileResponse])
async def list_meeting_files(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(MeetingFile)
        .where(MeetingFile.meeting_id == meeting_id)
        .order_by(MeetingFile.created_at.desc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/{meeting_id}/files", response_model=MeetingFileResponse, status_code=status.HTTP_201_CREATED)
async def create_meeting_file(
    meeting_id: UUID,
    data: MeetingFileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Meeting).where(Meeting.id == meeting_id)
    res = await db.execute(stmt)
    meeting = res.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    meeting_file = MeetingFile(
        meeting_id=meeting_id,
        user_id=data.user_id or data.uploaded_by or current_user.id,
        file_url=data.file_url,
        file_name=data.file_name,
        file_type=data.file_type,
    )
    db.add(meeting_file)
    await db.commit()
    await db.refresh(meeting_file)
    return meeting_file


@router.delete("/files/{file_id}")
async def delete_meeting_file(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(MeetingFile).where(MeetingFile.id == file_id)
    res = await db.execute(stmt)
    file_record = res.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="Meeting file not found")
    await db.delete(file_record)
    await db.commit()
    return {"message": "Meeting file deleted"}


# --- Meeting Participants Endpoints ---

@router.get("/{meeting_id}/participants", response_model=List[MeetingParticipantResponse])
async def list_meeting_participants(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(MeetingParticipant)
        .options(selectinload(MeetingParticipant.user))
        .where(MeetingParticipant.meeting_id == meeting_id)
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/{meeting_id}/participants", status_code=status.HTTP_201_CREATED)
async def add_meeting_participants(
    meeting_id: UUID,
    data: Any,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = data if isinstance(data, list) else [data]
    for item in items:
        u_id = item.get("user_id") if isinstance(item, dict) else getattr(item, "user_id", None)
        role = item.get("role", "attendee") if isinstance(item, dict) else getattr(item, "role", "attendee")
        if u_id:
            try:
                db.add(MeetingParticipant(
                    meeting_id=meeting_id,
                    user_id=UUID(str(u_id)),
                    role=role,
                    status="accepted"
                ))
            except Exception:
                pass
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return {"status": "ok"}
