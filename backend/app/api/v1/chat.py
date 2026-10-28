from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, Department
from app.models.chat import ChatChannel, ChatMessage
from app.schemas.chat import (
    DirectChannelRequest,
    ChatChannelResponse,
    ChatMessageCreate,
    ChatMessageResponse,
)
from app.services.chat_service import chat_service

router = APIRouter()


@router.get("/channels", response_model=List[ChatChannelResponse])
async def list_channels(
    company_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Auto-ensure default General channel and department channels for company
    effective_company_id = current_user.company_id or (company_id if current_user.role == "Super Admin" else None)
    if effective_company_id:
        gen_stmt = select(ChatChannel).where(
            ChatChannel.company_id == effective_company_id,
            ChatChannel.name == "General",
        )
        gen_res = await db.execute(gen_stmt)
        if not gen_res.scalar_one_or_none():
            gen_chan = ChatChannel(
                name="General",
                type="public",
                company_id=effective_company_id,
                is_private=False,
            )
            db.add(gen_chan)

        dept_stmt = select(Department).where(
            Department.company_id == effective_company_id,
        )
        dept_res = await db.execute(dept_stmt)
        for dept in dept_res.scalars().all():
            if dept.name and dept.name.strip().lower() == "management":
                continue
            d_stmt = select(ChatChannel).where(
                ChatChannel.company_id == effective_company_id,
                or_(
                    ChatChannel.department_id == dept.id,
                    and_(
                        ChatChannel.type == "department",
                        func.lower(ChatChannel.name) == func.lower(dept.name.strip()),
                    ),
                ),
            )
            d_res = await db.execute(d_stmt)
            existing_dept_chan = d_res.scalar_one_or_none()
            if not existing_dept_chan:
                db.add(
                    ChatChannel(
                        name=dept.name.strip(),
                        type="department",
                        company_id=effective_company_id,
                        department_id=dept.id,
                        is_private=False,
                    )
                )
            elif not existing_dept_chan.department_id:
                existing_dept_chan.department_id = dept.id
        await db.commit()

    # 2. Query channels
    stmt = (
        select(ChatChannel)
        .options(
            selectinload(ChatChannel.company),
            selectinload(ChatChannel.department),
            selectinload(ChatChannel.participant_one),
            selectinload(ChatChannel.participant_two),
        )
    )

    user_role = (current_user.role or "").strip().lower()

    if user_role == "super admin":
        # Super Admin only has access to 1-on-1 direct chats with users across companies
        super_admin_conditions = [
            ChatChannel.type == "direct",
            or_(
                ChatChannel.participant_one_id == current_user.id,
                ChatChannel.participant_two_id == current_user.id,
            ),
        ]
        if company_id:
            super_admin_conditions.append(ChatChannel.company_id == company_id)
        stmt = stmt.where(and_(*super_admin_conditions))
    elif user_role in ["founder", "admin"]:
        # Founder can see General chat, all department chats in company, and only their own 1-on-1 direct chats
        stmt = stmt.where(
            ChatChannel.company_id == current_user.company_id,
            or_(
                ChatChannel.type.in_(["public", "department"]),
                and_(
                    ChatChannel.type == "direct",
                    or_(
                        ChatChannel.participant_one_id == current_user.id,
                        ChatChannel.participant_two_id == current_user.id,
                    ),
                ),
            ),
        )
    else:
        # Regular user: General chat, their own department chat only, and their own 1-on-1 direct chats
        visible_conditions = [
            ChatChannel.type == "public",
            and_(
                ChatChannel.type == "direct",
                or_(
                    ChatChannel.participant_one_id == current_user.id,
                    ChatChannel.participant_two_id == current_user.id,
                ),
            ),
        ]
        if current_user.department_id:
            visible_conditions.append(
                and_(
                    ChatChannel.type == "department",
                    ChatChannel.department_id == current_user.department_id,
                )
            )

        stmt = stmt.where(
            ChatChannel.company_id == current_user.company_id,
            or_(*visible_conditions),
        )

    stmt = stmt.order_by(ChatChannel.created_at.asc())
    res = await db.execute(stmt)
    channels = list(res.scalars().all())

    # Hydrate other_user and naming for direct channels
    out = []
    for ch in channels:
        item = ChatChannelResponse.model_validate(ch)
        if ch.type == "direct":
            p1_str = str(ch.participant_one_id).lower() if ch.participant_one_id else ""
            uid_str = str(current_user.id).lower()
            if p1_str == uid_str:
                item.other_user = ch.participant_two
            else:
                item.other_user = ch.participant_one
            if item.other_user:
                item.name = item.other_user.full_name or item.other_user.name or "Private Chat"
        out.append(item)

    # Sort order: General Chat (0), Direct/Personal Chats (1), Department/Group Channels (2)
    # This guarantees that direct chats appear immediately next to General Chat and are never lost!
    def _channel_sort_key(c: ChatChannelResponse):
        if c.name and c.name.lower() == "general":
            return (0, "")
        if c.type == "direct":
            return (1, c.name or "")
        return (2, c.name or "")

    out.sort(key=_channel_sort_key)
    return out


@router.post("/direct")
async def get_or_create_direct_chat(
    data: DirectChannelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await chat_service.get_or_create_direct_channel(db, current_user, data.target_user_id)


@router.get("/channels/{channel_id}/messages", response_model=List[ChatMessageResponse])
async def list_channel_messages(
    channel_id: UUID,
    limit: int = 100,
    before: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ch_stmt = select(ChatChannel).where(ChatChannel.id == channel_id)
    ch_res = await db.execute(ch_stmt)
    channel = ch_res.scalar_one_or_none()

    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    user_role = (current_user.role or "").strip().lower()
    if user_role == "super admin":
        if channel.type != "direct":
            raise HTTPException(status_code=403, detail="Super Admin only has access to 1-on-1 direct chats")
        p1 = str(channel.participant_one_id).lower() if channel.participant_one_id else ""
        p2 = str(channel.participant_two_id).lower() if channel.participant_two_id else ""
        uid = str(current_user.id).lower()
        if uid not in [p1, p2]:
            raise HTTPException(status_code=403, detail="Access denied to direct chat")
    else:
        if channel.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Cross-company channel access denied")

        if channel.type == "direct":
            p1 = str(channel.participant_one_id).lower() if channel.participant_one_id else ""
            p2 = str(channel.participant_two_id).lower() if channel.participant_two_id else ""
            uid = str(current_user.id).lower()
            if uid not in [p1, p2]:
                raise HTTPException(status_code=403, detail="Access denied to private direct chat")
        elif channel.type == "department":
            if user_role not in ["founder", "admin"]:
                if not current_user.department_id or channel.department_id != current_user.department_id:
                    raise HTTPException(status_code=403, detail="Access denied: You can only view your own department chat")

    stmt = (
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.channel_id == channel_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(min(limit, 200))
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/channels/{channel_id}/messages", response_model=ChatMessageResponse)
async def post_message(
    channel_id: UUID,
    data: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not data.channel_id:
        data.channel_id = channel_id

    msg = await chat_service.create_message(
        db, current_user, channel_id, data.content, data.attachment_url, data.attachment_name
    )
    stmt = select(ChatMessage).options(selectinload(ChatMessage.user)).where(ChatMessage.id == msg.id)
    res = await db.execute(stmt)
    return res.scalar_one()
