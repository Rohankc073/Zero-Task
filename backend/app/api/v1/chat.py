from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ChatChannel)
        .options(
            selectinload(ChatChannel.participant_one),
            selectinload(ChatChannel.participant_two),
        )
        .where(
            ChatChannel.company_id == current_user.company_id,
            or_(
                ChatChannel.type != "direct",
                ChatChannel.participant_one_id == current_user.id,
                ChatChannel.participant_two_id == current_user.id,
            ),
        )
    )
    res = await db.execute(stmt)
    channels = res.scalars().all()

    # Hydrate other_user for direct channels
    out = []
    for ch in channels:
        item = ChatChannelResponse.model_validate(ch)
        if ch.type == "direct":
            if ch.participant_one_id == current_user.id:
                item.other_user = ch.participant_two
            else:
                item.other_user = ch.participant_one
        out.append(item)
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.channel_id == channel_id)
        .order_by(ChatMessage.created_at.asc())
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
    msg = await chat_service.create_message(
        db, current_user, channel_id, data.content, data.attachment_url, data.attachment_name
    )
    stmt = select(ChatMessage).options(selectinload(ChatMessage.user)).where(ChatMessage.id == msg.id)
    res = await db.execute(stmt)
    return res.scalar_one()
