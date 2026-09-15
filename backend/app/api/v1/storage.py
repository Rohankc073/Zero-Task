import uuid
import urllib.parse
from datetime import timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Query, Header
from fastapi.responses import StreamingResponse
from botocore.exceptions import ClientError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.security import decode_token, create_access_token
from app.core.database import get_db
from app.core.logging import logger
from app.models.user import User
from app.models.task import TaskAttachment
from app.schemas.storage import (
    UploadRequest,
    UploadResponse,
    SignedUrlResponse,
    UploadConfirm,
    DeleteRequest,
)
from app.services.storage_service import storage_service, ALLOWED_BUCKETS

router = APIRouter()


@router.post("/upload")
async def direct_upload(
    request: Request,
    bucket: str = Query(...),
    storage_path: Optional[str] = Query(None),
    file_name: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Direct streaming upload endpoint:
    Receives raw binary payload directly from client, streams it into MinIO S3,
    completely bypassing client-side DNS or presigned AWS SigV4 host header mismatches.
    """
    normalized_bucket = storage_service.normalize_bucket(bucket)
    if not normalized_bucket:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket: {bucket}",
        )

    bucket_info = ALLOWED_BUCKETS[normalized_bucket]

    body_bytes = await request.body()
    if len(body_bytes) > bucket_info["max_size"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of {bucket_info['max_size'] // (1024*1024)}MB",
        )

    if storage_path:
        clean_path = storage_path.strip().lstrip("/")
        if ".." in clean_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid storage path traversal",
            )
    else:
        prefix = str(current_user.company_id) if current_user.company_id else "global"
        raw_name = (file_name or "upload.bin").replace(" ", "_")
        clean_path = f"{prefix}/{uuid.uuid4()}_{raw_name}"

    content_type = request.headers.get("content-type") or "application/octet-stream"
    content_type = content_type.split(";")[0].strip()

    try:
        storage_service.put_object(
            bucket=normalized_bucket,
            storage_path=clean_path,
            data=body_bytes,
            mime_type=content_type,
        )
    except Exception as e:
        logger.error(f"Direct storage upload failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload failed: {str(e)}",
        )

    return {
        "status": "success",
        "path": clean_path,
        "storage_path": clean_path,
        "bucket": normalized_bucket,
        "size": len(body_bytes),
    }


@router.api_route("/serve", methods=["GET", "HEAD"])
async def serve_file(
    bucket: str = Query(...),
    path: Optional[str] = Query(None),
    storage_path: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Direct streaming serve endpoint for web & mobile browsers:
    Streams object content from MinIO with inline disposition so images, PDFs, and documents
    render or view directly in browser when opened via deep-link or Linking.openURL.
    Accepts both `path` and `storage_path` parameters.
    """
    target_path = path or storage_path
    if not target_path:
        raise HTTPException(status_code=400, detail="path or storage_path parameter is required")

    normalized_bucket = storage_service.normalize_bucket(bucket)
    if not normalized_bucket:
        raise HTTPException(status_code=400, detail=f"Invalid bucket: {bucket}")

    clean_path = target_path.strip().lstrip("/")
    if ".." in clean_path:
        raise HTTPException(status_code=400, detail="Invalid storage path")

    try:
        s3_obj = storage_service.get_object(normalized_bucket, clean_path)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ["404", "NoSuchKey"]:
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=f"Storage retrieval error: {str(e)}")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")

    def iterfile():
        yield from s3_obj["Body"].iter_chunks(chunk_size=64 * 1024)

    file_name = clean_path.split("/")[-1]
    content_type = s3_obj.get("ContentType") or "application/octet-stream"
    if content_type == "application/octet-stream":
        ext = file_name.split(".")[-1].lower() if "." in file_name else ""
        mime_map = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
            "svg": "image/svg+xml",
            "pdf": "application/pdf",
            "txt": "text/plain",
            "csv": "text/csv",
            "json": "application/json",
            "mp3": "audio/mpeg",
            "m4a": "audio/mp4",
            "wav": "audio/wav",
            "aac": "audio/aac",
            "zip": "application/zip",
        }
        if ext in mime_map:
            content_type = mime_map[ext]

    response_headers = {
        "Content-Disposition": f'inline; filename="{file_name}"',
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
    }
    if "ContentLength" in s3_obj:
        response_headers["Content-Length"] = str(s3_obj["ContentLength"])

    return StreamingResponse(
        iterfile(),
        media_type=content_type,
        headers=response_headers,
    )


@router.api_route("/download", methods=["GET", "HEAD"])
async def direct_download(
    bucket: str = Query(...),
    storage_path: Optional[str] = Query(None),
    path: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Direct streaming download & audio playback endpoint:
    Streams object content from MinIO with range headers and caching,
    accepting authorization via Bearer header or URL token parameter.
    """
    target_path = storage_path or path
    if not target_path:
        raise HTTPException(status_code=400, detail="storage_path or path parameter is required")

    normalized_bucket = storage_service.normalize_bucket(bucket)
    if not normalized_bucket:
        raise HTTPException(status_code=400, detail=f"Invalid bucket: {bucket}")

    clean_path = target_path.strip().lstrip("/")
    if ".." in clean_path:
        raise HTTPException(status_code=400, detail="Invalid storage path")

    bucket_info = ALLOWED_BUCKETS[normalized_bucket]
    is_public = bucket_info.get("public", False)

    if not is_public:
        raw_token = token
        if not raw_token and authorization and authorization.startswith("Bearer "):
            raw_token = authorization.split("Bearer ", 1)[1].strip()

        if not raw_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to access storage object",
            )

        payload = decode_token(raw_token)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token",
            )

    try:
        s3_obj = storage_service.get_object(normalized_bucket, clean_path)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ["404", "NoSuchKey"]:
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=f"Storage retrieval error: {str(e)}")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")

    def iterfile():
        yield from s3_obj["Body"].iter_chunks(chunk_size=64 * 1024)

    file_name = clean_path.split("/")[-1]
    content_type = s3_obj.get("ContentType") or "application/octet-stream"
    if content_type == "application/octet-stream":
        ext = file_name.split(".")[-1].lower() if "." in file_name else ""
        mime_map = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
            "svg": "image/svg+xml",
            "pdf": "application/pdf",
            "txt": "text/plain",
            "csv": "text/csv",
            "json": "application/json",
            "mp3": "audio/mpeg",
            "m4a": "audio/mp4",
            "wav": "audio/wav",
            "aac": "audio/aac",
            "zip": "application/zip",
        }
        if ext in mime_map:
            content_type = mime_map[ext]

    response_headers = {
        "Content-Disposition": f'inline; filename="{file_name}"',
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
    }
    if "ContentLength" in s3_obj:
        response_headers["Content-Length"] = str(s3_obj["ContentLength"])

    return StreamingResponse(
        iterfile(),
        media_type=content_type,
        headers=response_headers,
    )


@router.post("/delete")
async def delete_storage_objects(
    data: DeleteRequest,
    current_user: User = Depends(get_current_user),
):
    """Deletes one or more storage objects from MinIO."""
    normalized_bucket = storage_service.normalize_bucket(data.bucket)
    if not normalized_bucket:
        raise HTTPException(status_code=400, detail="Invalid bucket")

    success = storage_service.delete_objects(normalized_bucket, data.paths)
    return {"status": "success" if success else "failed", "deleted": data.paths}


@router.post("/upload-request", response_model=UploadResponse)
async def request_upload_presigned_url(
    data: UploadRequest,
    current_user: User = Depends(get_current_user),
):
    normalized_bucket = storage_service.normalize_bucket(data.bucket)
    if not normalized_bucket:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket: {data.bucket}",
        )

    bucket_info = ALLOWED_BUCKETS[normalized_bucket]
    if data.file_size_bytes and data.file_size_bytes > bucket_info["max_size"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of {bucket_info['max_size'] // (1024*1024)}MB",
        )

    prefix = str(current_user.company_id) if current_user.company_id else "global"
    clean_name = data.file_name.replace(" ", "_")
    storage_path = f"{prefix}/{uuid.uuid4()}_{clean_name}"

    encoded_path = urllib.parse.quote(storage_path)
    upload_url = f"/api/v1/storage/upload?bucket={normalized_bucket}&storage_path={encoded_path}"

    return UploadResponse(
        upload_url=upload_url,
        storage_path=storage_path,
        bucket=normalized_bucket,
        expires_in_seconds=300,
    )


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

    normalized_bucket = storage_service.normalize_bucket(bucket)
    if not normalized_bucket:
        raise HTTPException(status_code=400, detail="Invalid bucket")

    download_token = create_access_token(
        subject=str(current_user.id),
        claims={
            "role": current_user.role,
            "company_id": str(current_user.company_id) if current_user.company_id else None,
        },
        expires_delta=timedelta(seconds=expires_in),
    )

    encoded_path = urllib.parse.quote(path.strip().lstrip("/"))
    url = f"/api/v1/storage/download?bucket={normalized_bucket}&storage_path={encoded_path}&token={download_token}"
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
