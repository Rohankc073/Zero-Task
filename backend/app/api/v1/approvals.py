from typing import List
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.approval import Approval, PhoneChangeRequest, RegistrationRequest
from app.schemas.approval import (
    ApprovalResponse,
    PhoneChangeRequestCreate,
    PhoneChangeRequestResponse,
    PhoneApprovalAction,
    RegistrationRequestCreate,
    RegistrationRequestResponse,
)

router = APIRouter()


@router.get("", response_model=List[ApprovalResponse])
async def list_pending_approvals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Approval)
        .options(selectinload(Approval.requester), selectinload(Approval.approver))
        .where(Approval.approver_id == current_user.id)
        .order_by(Approval.created_at.desc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/phone-change", response_model=PhoneChangeRequestResponse)
async def request_phone_change(
    data: PhoneChangeRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    req = PhoneChangeRequest(
        user_id=current_user.id,
        new_phone=data.new_phone,
        old_phone=current_user.phone_number,
        status="Pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req


@router.post("/phone-change/{request_id}/process")
async def process_phone_change(
    request_id: UUID,
    data: PhoneApprovalAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Only Founder or Super Admin can approve phone changes
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=403, detail="Only executives can authorize phone updates")

    try:
        res = await db.execute(
            text("SELECT public.process_phone_change_approval(:req_id, :act, :dec)"),
            {"req_id": str(request_id), "act": data.action, "dec": data.decision or ""},
        )
        val = res.scalar()
        await db.commit()
        return val if isinstance(val, dict) else {"status": "success"}
    except Exception:
        await db.rollback()
        stmt = select(PhoneChangeRequest).where(PhoneChangeRequest.id == request_id)
        res = await db.execute(stmt)
        req = res.scalar_one_or_none()
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")

        req.status = data.action
        req.approved_by = current_user.id
        req.approved_at = datetime.now(timezone.utc)

        if data.action == "Approved":
            u_stmt = select(User).where(User.id == req.user_id)
            u_res = await db.execute(u_stmt)
            target = u_res.scalar_one_or_none()
            if target:
                target.phone_number = req.new_phone

        await db.commit()
        return {"status": data.action, "request_id": str(request_id)}


@router.post("/registration", response_model=RegistrationRequestResponse)
async def submit_registration(
    data: RegistrationRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    req = RegistrationRequest(
        email=data.email,
        requested_role=data.requested_role,
        status="Pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req
