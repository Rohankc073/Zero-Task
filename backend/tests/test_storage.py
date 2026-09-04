import pytest
from app.services.storage_service import ALLOWED_BUCKETS, storage_service
from app.schemas.storage import UploadRequest


def test_storage_bucket_definitions():
    assert "task-attachments" in ALLOWED_BUCKETS
    assert "meeting-attachments" in ALLOWED_BUCKETS
    assert "chat-attachments" in ALLOWED_BUCKETS
    assert "avatars" in ALLOWED_BUCKETS
    assert "task-audio" in ALLOWED_BUCKETS

    # Confirm 20MB limit for tasks and voice notes
    assert ALLOWED_BUCKETS["task-attachments"]["max_size"] == 20 * 1024 * 1024
    assert ALLOWED_BUCKETS["task-audio"]["max_size"] == 20 * 1024 * 1024
    # Voice notes must be strictly private
    assert ALLOWED_BUCKETS["task-audio"]["public"] is False


def test_upload_request_size_validation():
    # Valid 5MB file
    req_valid = UploadRequest(
        bucket="task-attachments",
        file_name="report.pdf",
        mime_type="application/pdf",
        file_size_bytes=5 * 1024 * 1024,
    )
    assert req_valid.file_size_bytes == 5 * 1024 * 1024

    # File exceeding 20MB is rejected by Pydantic validation
    with pytest.raises(ValueError):
        UploadRequest(
            bucket="task-attachments",
            file_name="huge.zip",
            mime_type="application/zip",
            file_size_bytes=25 * 1024 * 1024,  # > 20MB
        )
