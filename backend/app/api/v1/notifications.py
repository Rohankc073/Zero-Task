from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserPushToken
from app.models.notification import InAppNotification
from app.schemas.notification import InAppNotificationResponse, PushTokenRegister

router = APIRouter()


@router.get('', response_model=List[InAppNotificationResponse])
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


@router.get('/unread-count')
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(InAppNotification).where(
        InAppNotification.user_id == current_user.id,
        InAppNotification.is_read == False,
    )
    res = await db.execute(stmt)
    unreads = list(res.scalars().all())
    return {'count': len(unreads)}


@router.patch('/read-all')
async def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        update(InAppNotification)
        .where(InAppNotification.user_id == current_user.id, InAppNotification.is_read == False)
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {'status': 'success'}


@router.api_route('/{notification_id}/read', methods=['PATCH', 'PUT'])
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
    return {'status': 'success'}


@router.delete('/{notification_id}')
async def delete_notification(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = delete(InAppNotification).where(
        InAppNotification.id == notification_id,
        InAppNotification.user_id == current_user.id
    )
    await db.execute(stmt)
    await db.commit()
    return {'status': 'success'}


@router.delete('')
async def clear_all_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = delete(InAppNotification).where(InAppNotification.user_id == current_user.id)
    await db.execute(stmt)
    await db.commit()
    return {'status': 'success'}


@router.post('/push-token')
async def register_push_token(
    data: PushTokenRegister,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    current_user.expo_push_token = data.token
    await db.commit()
    return {'message': 'Push token registered successfully'}
