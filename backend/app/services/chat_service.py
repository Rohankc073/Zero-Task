from typing import Dict, Any, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from fastapi import HTTPException, status
from app.models.chat import ChatChannel, ChatMessage
from app.models.user import User


class ChatService:
    @staticmethod
    async def get_or_create_direct_channel(
        db: AsyncSession, current_user: User, target_user_id: UUID
    ) -> Dict[str, Any]:
        if current_user.id == target_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start direct conversation with yourself",
            )

        # Validate target user
        stmt = select(User).where(User.id == target_user_id, User.is_active == True, User.is_deleted == False)
        res = await db.execute(stmt)
        target_user = res.scalar_one_or_none()

        if not target_user:
            raise HTTPException(status_code=404, detail="Target user not found or inactive")

        # Strict Company Isolation Check
        if current_user.role != "Super Admin" and current_user.company_id != target_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security Violation: Cannot start direct conversation across different companies",
            )

        # Try calling PL/pgSQL function if available
        try:
            db_res = await db.execute(
                text("SELECT public.get_or_create_direct_channel(:target_id)"),
                {"target_id": str(target_user_id)},
            )
            val = db_res.scalar()
            await db.commit()
            return val if isinstance(val, dict) else {"channel_id": str(val)}
        except Exception:
            await db.rollback()
            # Fallback atomic logic using ordered UUIDs
            p1 = min(current_user.id, target_user_id)
            p2 = max(current_user.id, target_user_id)

            ch_stmt = select(ChatChannel).where(
                ChatChannel.type == "direct",
                ChatChannel.participant_one_id == p1,
                ChatChannel.participant_two_id == p2,
            )
            ch_res = await db.execute(ch_stmt)
            channel = ch_res.scalar_one_or_none()

            created = False
            if not channel:
                channel = ChatChannel(
                    name="Direct Chat",
                    type="direct",
                    company_id=current_user.company_id,
                    participant_one_id=p1,
                    participant_two_id=p2,
                    is_private=True,
                )
                db.add(channel)
                await db.commit()
                await db.refresh(channel)
                created = True

            return {
                "channel_id": channel.id,
                "created": created,
                "target_user_id": target_user.id,
                "target_user_name": target_user.full_name or target_user.name,
            }

    @staticmethod
    async def create_message(
        db: AsyncSession,
        current_user: User,
        channel_id: UUID,
        content: Optional[str] = None,
        attachment_url: Optional[str] = None,
        attachment_name: Optional[str] = None,
    ) -> ChatMessage:
        # Verify channel exists and belongs to caller company
        stmt = select(ChatChannel).where(ChatChannel.id == channel_id)
        res = await db.execute(stmt)
        channel = res.scalar_one_or_none()

        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")

        if current_user.role != "Super Admin" and channel.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Cross-company chat violation")

        msg = ChatMessage(
            channel_id=channel_id,
            user_id=current_user.id,
            content=content,
            attachment_url=attachment_url,
            attachment_name=attachment_name,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return msg


chat_service = ChatService()
