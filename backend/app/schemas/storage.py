from typing import Optional
from pydantic import BaseModel, Field


class UploadRequest(BaseModel):
    bucket: str
    file_name: str
    mime_type: str
    file_size_bytes: int = Field(..., gt=0, le=20 * 1024 * 1024)  # Max 20MB limit


class UploadResponse(BaseModel):
    upload_url: str  # Presigned PUT URL
    storage_path: str
    bucket: str
    expires_in_seconds: int


class UploadConfirm(BaseModel):
    bucket: str
    storage_path: str
    file_name: str
    file_size: int
    mime_type: str
    task_id: Optional[str] = None
    meeting_id: Optional[str] = None


class SignedUrlResponse(BaseModel):
    url: str
    expires_in_seconds: int
