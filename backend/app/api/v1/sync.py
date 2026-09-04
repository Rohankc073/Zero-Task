from fastapi import APIRouter, Depends, Header
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.sync import SyncBatchRequest, SyncBatchResponse
from app.services.sync_service import sync_service

router = APIRouter()


@router.post("/mutations", response_model=SyncBatchResponse)
async def replay_offline_mutations(
    batch: SyncBatchRequest,
    x_idempotency_key: Optional[str] = Header(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Replays queued offline mutations safely on the server.
    Validates company isolation, permissions, and integrity rules.
    """
    if x_idempotency_key:
        batch.idempotency_key = x_idempotency_key

    return await sync_service.process_batch(db, current_user, batch)
