import os
import urllib.parse
from typing import Optional, List
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from app.core.config import settings
from app.core.logging import logger

ALLOWED_BUCKETS = {
    settings.STORAGE_BUCKET_TASKS: {"max_size": 20 * 1024 * 1024, "public": False},
    settings.STORAGE_BUCKET_MEETINGS: {"max_size": 20 * 1024 * 1024, "public": False},
    settings.STORAGE_BUCKET_CHAT: {"max_size": 10 * 1024 * 1024, "public": False},
    settings.STORAGE_BUCKET_AVATARS: {"max_size": 5 * 1024 * 1024, "public": True},
    settings.STORAGE_BUCKET_AUDIO: {"max_size": 20 * 1024 * 1024, "public": False},
}


class LocalStreamingBody:
    """Streams file chunks identically to botocore.response.StreamingBody."""
    def __init__(self, file_path: str):
        self.file_path = file_path
        self._file = open(file_path, "rb")

    def iter_chunks(self, chunk_size: int = 64 * 1024):
        try:
            while chunk := self._file.read(chunk_size):
                yield chunk
        finally:
            self._file.close()

    def read(self, *args, **kwargs):
        return self._file.read(*args, **kwargs)

    def close(self):
        self._file.close()


class StorageService:
    LOCAL_STORAGE_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "storage_data")
    )

    def __init__(self):
        self._s3_client = None
        self._minio_available: Optional[bool] = None
        os.makedirs(self.LOCAL_STORAGE_DIR, exist_ok=True)

    def get_client(self):
        if not self._s3_client:
            endpoint = f"{'https' if settings.MINIO_USE_SSL else 'http'}://{settings.MINIO_ENDPOINT}"
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=settings.MINIO_ACCESS_KEY,
                aws_secret_access_key=settings.MINIO_SECRET_KEY,
                config=Config(signature_version="s3v4", connect_timeout=1, read_timeout=1, retries={"max_attempts": 0}),
                region_name=settings.MINIO_REGION,
            )
        return self._s3_client

    def is_minio_available(self) -> bool:
        """Checks if remote MinIO S3 endpoint is operational."""
        if self._minio_available is not None:
            return self._minio_available
        try:
            client = self.get_client()
            client.list_buckets()
            self._minio_available = True
        except Exception:
            self._minio_available = False
        return self._minio_available

    def ensure_buckets(self):
        """Initializes all required application buckets in MinIO if available."""
        if not self.is_minio_available():
            logger.info("MinIO service not detected; operating in local filesystem storage mode")
            # Ensure local bucket directories exist
            for bucket_name in ALLOWED_BUCKETS.keys():
                os.makedirs(os.path.join(self.LOCAL_STORAGE_DIR, bucket_name), exist_ok=True)
            return

        try:
            client = self.get_client()
            for bucket_name in ALLOWED_BUCKETS.keys():
                try:
                    client.head_bucket(Bucket=bucket_name)
                except ClientError as e:
                    error_code = e.response.get("Error", {}).get("Code")
                    if error_code in ["404", "NoSuchBucket"]:
                        try:
                            client.create_bucket(Bucket=bucket_name)
                            logger.info(f"Created MinIO bucket: {bucket_name}")
                        except Exception as create_err:
                            logger.error(f"Failed to create bucket {bucket_name}: {create_err}")
                    else:
                        logger.warning(f"Could not verify bucket {bucket_name}: {e}")
                except Exception as conn_err:
                    logger.warning(f"MinIO connection failed during bucket check ({bucket_name}): {conn_err}")
                    self._minio_available = False
                    break
        except Exception as e:
            logger.warning(f"MinIO client initialization skipped: {e}")
            self._minio_available = False

    def normalize_bucket(self, bucket: str) -> Optional[str]:
        if not bucket:
            return None
        bucket_aliases = {
            "task_attachments": settings.STORAGE_BUCKET_TASKS,
            "task-attachments": settings.STORAGE_BUCKET_TASKS,
            "meeting_attachments": settings.STORAGE_BUCKET_MEETINGS,
            "meeting-attachments": settings.STORAGE_BUCKET_MEETINGS,
            "chat_attachments": settings.STORAGE_BUCKET_CHAT,
            "chat-attachments": settings.STORAGE_BUCKET_CHAT,
            "avatars": settings.STORAGE_BUCKET_AVATARS,
            "task_audio": settings.STORAGE_BUCKET_AUDIO,
            "task-audio": settings.STORAGE_BUCKET_AUDIO,
        }
        if bucket in bucket_aliases:
            return bucket_aliases[bucket]
        clean = bucket.strip().lower()
        if clean in bucket_aliases:
            return bucket_aliases[clean]
        if clean in ALLOWED_BUCKETS:
            return clean
        clean_hyphen = clean.replace("_", "-")
        if clean_hyphen in ALLOWED_BUCKETS:
            return clean_hyphen
        clean_underscore = clean.replace("-", "_")
        if clean_underscore in ALLOWED_BUCKETS:
            return clean_underscore
        return None

    def _get_local_path(self, bucket: str, storage_path: str) -> str:
        clean_key = storage_path.strip().lstrip("/").replace("/", os.sep)
        return os.path.join(self.LOCAL_STORAGE_DIR, bucket, clean_key)

    def put_object(
        self,
        bucket: str,
        storage_path: str,
        data: bytes,
        mime_type: str = "application/octet-stream",
    ) -> dict:
        """Stores binary data directly to MinIO or local filesystem storage fallback."""
        normalized_bucket = self.normalize_bucket(bucket)
        if not normalized_bucket:
            raise ValueError(f"Unauthorized or unknown bucket: {bucket}")

        # If MinIO is operational, save to MinIO
        if self.is_minio_available():
            try:
                client = self.get_client()
                client.put_object(
                    Bucket=normalized_bucket,
                    Key=storage_path,
                    Body=data,
                    ContentType=mime_type,
                )
                return {
                    "bucket": normalized_bucket,
                    "storage_path": storage_path,
                    "size": len(data),
                }
            except Exception as s3_err:
                logger.warning(f"MinIO put_object failed ({s3_err}), falling back to local filesystem storage")
                self._minio_available = False

        # Local filesystem storage fallback
        local_path = self._get_local_path(normalized_bucket, storage_path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)

        meta_path = f"{local_path}.meta"
        with open(meta_path, "w", encoding="utf-8") as f:
            f.write(mime_type)

        logger.info(f"Stored object to local storage: {normalized_bucket}/{storage_path} ({len(data)} bytes)")
        return {
            "bucket": normalized_bucket,
            "storage_path": storage_path,
            "size": len(data),
        }

    def get_object(self, bucket: str, storage_path: str) -> dict:
        """Retrieves an object stream directly from local storage or MinIO."""
        normalized_bucket = self.normalize_bucket(bucket)
        if not normalized_bucket:
            raise ValueError(f"Unauthorized or unknown bucket: {bucket}")

        # Check local storage first
        local_path = self._get_local_path(normalized_bucket, storage_path)
        if os.path.exists(local_path):
            size = os.path.getsize(local_path)
            content_type = "application/octet-stream"
            meta_path = f"{local_path}.meta"
            if os.path.exists(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        content_type = f.read().strip()
                except Exception:
                    pass
            return {
                "Body": LocalStreamingBody(local_path),
                "ContentType": content_type,
                "ContentLength": size,
            }

        # If not local, try MinIO
        if self.is_minio_available():
            client = self.get_client()
            return client.get_object(Bucket=normalized_bucket, Key=storage_path)

        raise FileNotFoundError(f"Storage object not found: {normalized_bucket}/{storage_path}")

    def delete_object(self, bucket: str, storage_path: str) -> bool:
        """Deletes an object from local storage and MinIO."""
        normalized_bucket = self.normalize_bucket(bucket)
        if not normalized_bucket:
            return False

        local_path = self._get_local_path(normalized_bucket, storage_path)
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception:
                pass
        meta_path = f"{local_path}.meta"
        if os.path.exists(meta_path):
            try:
                os.remove(meta_path)
            except Exception:
                pass

        if self.is_minio_available():
            try:
                client = self.get_client()
                client.delete_object(Bucket=normalized_bucket, Key=storage_path)
            except Exception as e:
                logger.error(f"Error deleting object from MinIO {normalized_bucket}/{storage_path}: {e}")

        return True

    def delete_objects(self, bucket: str, storage_paths: List[str]) -> bool:
        """Deletes multiple objects from local storage and MinIO."""
        normalized_bucket = self.normalize_bucket(bucket)
        if not normalized_bucket:
            return False

        all_ok = True
        for p in storage_paths:
            if not p or not p.strip():
                continue
            if not self.delete_object(normalized_bucket, p.strip()):
                all_ok = False
        return all_ok

    def generate_presigned_put_url(
        self,
        bucket: str,
        storage_path: str,
        mime_type: str,
        expires_in: int = 300,
    ) -> str:
        """Generates an upload URL (MinIO S3 presigned URL or FastAPI upload route)."""
        if bucket not in ALLOWED_BUCKETS:
            raise ValueError(f"Unauthorized bucket: {bucket}")

        if self.is_minio_available():
            try:
                client = self.get_client()
                params = {
                    "Bucket": bucket,
                    "Key": storage_path,
                    "ContentType": mime_type,
                }
                return client.generate_presigned_url(
                    ClientMethod="put_object",
                    Params=params,
                    ExpiresIn=expires_in,
                )
            except Exception:
                pass

        encoded_path = urllib.parse.quote(storage_path)
        return f"/api/v1/storage/upload?bucket={bucket}&storage_path={encoded_path}"

    def generate_presigned_get_url(
        self,
        bucket: str,
        storage_path: str,
        expires_in: int = 900,
    ) -> str:
        """Generates a secure download/playback URL (MinIO presigned GET or FastAPI serve route)."""
        if bucket not in ALLOWED_BUCKETS:
            raise ValueError(f"Unauthorized bucket: {bucket}")

        if self.is_minio_available():
            try:
                client = self.get_client()
                return client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={"Bucket": bucket, "Key": storage_path},
                    ExpiresIn=expires_in,
                )
            except Exception:
                pass

        encoded_path = urllib.parse.quote(storage_path)
        return f"/api/v1/storage/serve?bucket={bucket}&path={encoded_path}"


storage_service = StorageService()
