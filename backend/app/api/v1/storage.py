import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.storage import (
    UploadRequest,
    UploadResponse,
    SignedUrlResponse,
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


@router.post("/signed-url", response_model=SignedUrlResponse)
async def get_download_presigned_url(
    bucket: str,
    storage_path: str,
    current_user: User = Depends(get_current_user),
):
    if bucket not in ALLOWED_BUCKETS:
        raise HTTPException(status_code=400, detail="Invalid bucket")

    # Company path boundary check
    if current_user.role != "Super Admin":
        expected_prefix = f"{current_user.company_id}/"
        if not storage_path.startswith(expected_prefix):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security Violation: Cannot access files outside your company",
            )

    url = storage_service.generate_presigned_get_url(
        bucket=bucket,
        storage_path=storage_path,
        expires_in=900,
    )

    return SignedUrlResponse(url=url, expires_in_seconds=900)
