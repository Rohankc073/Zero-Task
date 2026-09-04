from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.meeting import Meeting, MeetingParticipant
from app.schemas.meeting import (
    MeetingCreate,
    MeetingUpdate,
    MeetingResponse,
    MeetingApprovalAction,
)
from app.services.meeting_service import meeting_service

router = APIRouter()


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
        )
        .order_by(Meeting.start_time.asc())
    )

    if current_user.role != "Super Admin":
        stmt = stmt.where(Meeting.company_id == current_user.company_id)

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
        )
        .where(Meeting.id == meeting_id)
    )
    res = await db.execute(stmt)
    meeting = res.scalar_one_or_none()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if current_user.role != "Super Admin" and meeting.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access violation")

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


@router.post("/approvals/{approval_id}/process")
async def process_meeting_approval(
    approval_id: UUID,
    data: MeetingApprovalAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await meeting_service.process_approval(
        db, approval_id, current_user, data.action, data.reason
    )
