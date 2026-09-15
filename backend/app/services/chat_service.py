from typing import Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from fastapi import HTTPException, status
from app.models.chat import ChatChannel, ChatMessage
from app.models.user import User
from app.models.notification import InAppNotification
from app.websocket.connection_manager import connection_manager
from app.websocket.events import RealtimeEventType
from app.services.push_service import push_service


class ChatService:
    @staticmethod
    async def get_or_create_direct_channel(
        db: AsyncSession, current_user: User, target_user_id: UUID
    ) -> Dict[str, Any]:
        curr_id = current_user.id
        curr_company_id = current_user.company_id
        curr_role = current_user.role

        if curr_id == target_user_id:
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
        if curr_role != "Super Admin" and curr_company_id != target_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security Violation: Cannot start direct conversation across different companies",
            )

        # Atomic logic using ordered UUIDs
        p1 = min(curr_id, target_user_id)
        p2 = max(curr_id, target_user_id)

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
                company_id=curr_company_id or target_user.company_id,
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
            "id": channel.id,
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

        # -------------------------------------------------------------
        # Create InAppNotification & Broadcast real-time websocket event
        # -------------------------------------------------------------
        sender_name = current_user.full_name or current_user.name or "User"
        msg_summary = content if content else (f"Attachment: {attachment_name}" if attachment_name else "Sent a message")

        recipients = []
        if channel.type == "direct":
            other_id = channel.participant_two_id if channel.participant_one_id == current_user.id else channel.participant_one_id
            if other_id and other_id != current_user.id:
                recipients.append(other_id)
        elif channel.type == "department" and channel.department_id:
            dept_stmt = (
                select(User.id)
                .where(
                    User.department_id == channel.department_id,
                    User.company_id == current_user.company_id,
                    User.is_active == True,
                    User.is_deleted == False,
                    User.id != current_user.id,
                )
            )
            dept_res = await db.execute(dept_stmt)
            recipients = list(dept_res.scalars().all())
        elif channel.type in ["public", "company"]:
            comp_stmt = (
                select(User.id)
                .where(
                    User.company_id == current_user.company_id,
                    User.is_active == True,
                    User.is_deleted == False,
                    User.id != current_user.id,
                )
            )
            comp_res = await db.execute(comp_stmt)
            recipients = list(comp_res.scalars().all())

        # Defensive guarantee: Sender must NEVER receive own-message notification
        recipients = [uid for uid in recipients if uid != current_user.id]

        # Build authoritative realtime message payload
        created_iso = msg.created_at.isoformat() if getattr(msg, "created_at", None) else datetime.now(timezone.utc).isoformat()
        message_dict = {
            "id": str(msg.id),
            "channel_id": str(channel_id),
            "user_id": str(current_user.id),
            "content": msg.content or "",
            "attachment_url": msg.attachment_url,
            "attachment_name": msg.attachment_name,
            "created_at": created_iso,
            "user": {
                "id": str(current_user.id),
                "full_name": sender_name,
                "name": sender_name,
                "email": current_user.email,
                "role": current_user.role,
            },
        }

        # 1. Broadcast immediate NEW_MESSAGE to channel subscribers
        await connection_manager.broadcast_to_channel(
            channel_id=str(channel_id),
            event=RealtimeEventType.NEW_MESSAGE,
            payload={"action": "INSERT", "record": message_dict, **message_dict},
        )

        for recipient_id in recipients:
            # 2. Also send NEW_MESSAGE to direct recipient socket in case not joined
            await connection_manager.broadcast_to_user(
                user_id=recipient_id,
                event=RealtimeEventType.NEW_MESSAGE,
                payload={"action": "INSERT", "record": message_dict, **message_dict},
            )

            notif = InAppNotification(
                user_id=recipient_id,
                title=f"New chat message from {sender_name}",
                message=msg_summary,
                body=msg_summary,
                type="chat",
                is_read=False,
                action_url="/(drawer)/(tabs)/chat",
            )
            db.add(notif)
            await db.flush()

            # Broadcast targeted WebSocket notification to recipient
            await connection_manager.broadcast_to_user(
                user_id=recipient_id,
                event=RealtimeEventType.NEW_NOTIFICATION,
                payload={
                    "id": str(notif.id),
                    "user_id": str(recipient_id),
                    "title": f"New chat message from {sender_name}",
                    "message": msg_summary,
                    "body": msg_summary,
                    "type": "chat",
                    "is_read": False,
                    "action_url": "/(drawer)/(tabs)/chat",
                    "created_at": notif.created_at.isoformat() if notif.created_at else None,
                },
            )

            # Send real Android OS push notification (delivers when backgrounded/closed/locked)
            await push_service.send_to_user(
                db=db,
                user_id=recipient_id,
                title=f"New message from {sender_name}",
                body=msg_summary,
                data={
                    "url": "/(drawer)/(tabs)/chat",
                    "channel_id": str(channel_id),
                    "type": "chat",
                },
            )

        if recipients:
            await db.commit()

        return msg


chat_service = ChatService()
