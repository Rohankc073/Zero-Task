from typing import Optional, Any
from pydantic import BaseModel, Field, model_validator


class UploadRequest(BaseModel):
    bucket: str
    file_name: str
    mime_type: Optional[str] = None
    content_type: Optional[str] = None
    file_size_bytes: Optional[int] = Field(default=None, gt=0, le=20 * 1024 * 1024)
    file_size: Optional[int] = Field(default=None, gt=0, le=20 * 1024 * 1024)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any):
        if isinstance(data, dict):
            if not data.get("mime_type") and data.get("content_type"):
                data["mime_type"] = data["content_type"]
            elif not data.get("content_type") and data.get("mime_type"):
                data["content_type"] = data["mime_type"]
            if not data.get("file_size_bytes") and data.get("file_size"):
                data["file_size_bytes"] = data["file_size"]
            elif not data.get("file_size") and data.get("file_size_bytes"):
                data["file_size"] = data["file_size_bytes"]
            if not data.get("mime_type"):
                data["mime_type"] = "application/octet-stream"
            if not data.get("file_size_bytes"):
                data["file_size_bytes"] = 1024
        return data


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
