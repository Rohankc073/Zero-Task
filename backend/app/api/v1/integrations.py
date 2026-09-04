from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.whatsapp_service import whatsapp_service
from app.services.calendar_service import calendar_service
from app.core.logging import logger

router = APIRouter()


@router.get("/whatsapp/webhook")
async def verify_whatsapp_webhook(
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_verify_token: str = Query(..., alias="hub.verify_token"),
):
    """Handles Meta WhatsApp Cloud API endpoint verification handshake."""
    challenge = whatsapp_service.verify_webhook_challenge(
        mode=hub_mode,
        token=hub_verify_token,
        challenge=hub_challenge,
    )
    if challenge:
        return Response(content=challenge, media_type="text/plain")

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/whatsapp/webhook")
async def receive_whatsapp_webhook(request: Request):
    """Processes incoming WhatsApp messages and delivery status updates."""
    body_bytes = await request.body()
    sig_header = request.headers.get("X-Hub-Signature-256", "")

    if not whatsapp_service.verify_signature(body_bytes, sig_header):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")

    data = await request.json()
    logger.info(f"Received verified WhatsApp webhook event: {data.get('object')}")
    return {"status": "received"}


@router.post("/google-calendar/sync")
async def sync_task_to_google_calendar(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Synchronizes a task deadline to the user's connected Google Calendar."""
    return await calendar_service.sync_task_event(db, task_id, current_user.id)
