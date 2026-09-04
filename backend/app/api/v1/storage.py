import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.storage import (
    UploadRequest,
    UploadResponse,
    SignedUrlResponse,
    UploadConfirm,
)
from app.services.storage_service import storage_service, ALLOWED_BUCKETS

router = APIRouter()


@router.post("/upload-request", response_model=UploadResponse)
async def request_upload_presigned_url(
    data: UploadRequest,
    current_user: User = Depends(get_current_user),
):
    if data.bucket not in ALLOWED_BUCKETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket: {data.bucket}",
        )

    bucket_info = ALLOWED_BUCKETS[data.bucket]
    if data.file_size_bytes > bucket_info["max_size"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of {bucket_info['max_size'] // (1024*1024)}MB",
        )

    # Scoped storage path structure: {company_id}/{unique_id}_{filename}
    clean_name = data.file_name.replace(" ", "_")
    storage_path = f"{current_user.company_id}/{uuid.uuid4()}_{clean_name}"

    upload_url = storage_service.generate_presigned_put_url(
        bucket=data.bucket,
        storage_path=storage_path,
        mime_type=data.mime_type,
        expires_in=300,
    )

    return UploadResponse(
        upload_url=upload_url,
        storage_path=storage_path,
        bucket=data.bucket,
        expires_in_seconds=300,
    )


from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.task import TaskAttachment


async def _resolve_signed_url(
    bucket: str,
    storage_path: Optional[str],
    file_key: Optional[str],
    current_user: User,
    expires_in: int = 900,
) -> SignedUrlResponse:
    path = storage_path or file_key
    if not path:
        raise HTTPException(status_code=400, detail="storage_path or file_key required")
    if bucket not in ALLOWED_BUCKETS:
        raise HTTPException(status_code=400, detail="Invalid bucket")

    if current_user.role != "Super Admin":
        expected_prefix = f"{current_user.company_id}/"
        if not path.startswith(expected_prefix):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security Violation: Cannot access files outside your company",
            )

    url = storage_service.generate_presigned_get_url(
        bucket=bucket,
        storage_path=path,
        expires_in=expires_in,
    )
    return SignedUrlResponse(url=url, expires_in_seconds=expires_in)


@router.post("/signed-url", response_model=SignedUrlResponse)
async def post_download_presigned_url(
    bucket: str,
    storage_path: Optional[str] = None,
    file_key: Optional[str] = None,
    expires_in: int = 900,
    current_user: User = Depends(get_current_user),
):
    return await _resolve_signed_url(bucket, storage_path, file_key, current_user, expires_in)


@router.get("/signed-url", response_model=SignedUrlResponse)
async def get_download_presigned_url(
    bucket: str,
    storage_path: Optional[str] = None,
    file_key: Optional[str] = None,
    expires_in: int = 900,
    current_user: User = Depends(get_current_user),
):
    return await _resolve_signed_url(bucket, storage_path, file_key, current_user, expires_in)


@router.post("/confirm")
async def confirm_upload(
    data: UploadConfirm,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.task_id:
        try:
            task_uuid = uuid.UUID(data.task_id)
            att = TaskAttachment(
                task_id=task_uuid,
                file_name=data.file_name,
                file_url=data.storage_path,
                file_size=data.file_size,
                file_type=data.mime_type,
                uploaded_by=current_user.id,
            )
            db.add(att)
            await db.commit()
        except Exception:
            await db.rollback()

    return {"status": "confirmed", "storage_path": data.storage_path, "bucket": data.bucket}
