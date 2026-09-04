from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserPushToken
from app.models.notification import InAppNotification
from app.schemas.notification import InAppNotificationResponse, PushTokenRegister

router = APIRouter()


@router.get("", response_model=List[InAppNotificationResponse])
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(InAppNotification)
        .where(InAppNotification.user_id == current_user.id)
        .order_by(InAppNotification.created_at.desc())
        .limit(100)
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.patch("/{notification_id}/read")
async def mark_as_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        update(InAppNotification)
        .where(InAppNotification.id == notification_id, InAppNotification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "success"}


@router.post("/push-token")
async def register_push_token(
    data: PushTokenRegister,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Upsert user push token
    stmt = select(UserPushToken).where(UserPushToken.token == data.token)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        existing.user_id = current_user.id
        existing.device_id = data.device_id
        existing.platform = data.platform
    else:
        new_token = UserPushToken(
            user_id=current_user.id,
            token=data.token,
            device_id=data.device_id,
            platform=data.platform,
        )
        db.add(new_token)

    # Also update user's quick expo_push_token column
    current_user.expo_push_token = data.token
    await db.commit()
    return {"message": "Push token registered successfully"}
