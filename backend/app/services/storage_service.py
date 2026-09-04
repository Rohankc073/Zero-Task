import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from typing import Optional
from app.core.config import settings
from app.core.logging import logger

ALLOWED_BUCKETS = {
    settings.STORAGE_BUCKET_TASKS: {"max_size": 20 * 1024 * 1024, "public": False},
    settings.STORAGE_BUCKET_MEETINGS: {"max_size": 20 * 1024 * 1024, "public": False},
    settings.STORAGE_BUCKET_CHAT: {"max_size": 10 * 1024 * 1024, "public": False},
    settings.STORAGE_BUCKET_AVATARS: {"max_size": 5 * 1024 * 1024, "public": True},
    settings.STORAGE_BUCKET_AUDIO: {"max_size": 20 * 1024 * 1024, "public": False},
}


class StorageService:
    def __init__(self):
        self._s3_client = None

    def get_client(self):
        if not self._s3_client:
            endpoint = f"{'https' if settings.MINIO_USE_SSL else 'http'}://{settings.MINIO_ENDPOINT}"
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=settings.MINIO_ACCESS_KEY,
                aws_secret_access_key=settings.MINIO_SECRET_KEY,
                config=Config(signature_version="s3v4"),
                region_name=settings.MINIO_REGION,
            )
        return self._s3_client

    def ensure_buckets(self):
        """Initializes all required application buckets in MinIO."""
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

    def generate_presigned_put_url(
        self,
        bucket: str,
        storage_path: str,
        mime_type: str,
        expires_in: int = 300,
    ) -> str:
        """Generates a presigned PUT URL for client-side direct streaming upload."""
        if bucket not in ALLOWED_BUCKETS:
            raise ValueError(f"Unauthorized bucket: {bucket}")

        client = self.get_client()
        params = {
            "Bucket": bucket,
            "Key": storage_path,
            "ContentType": mime_type,
        }
        url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params=params,
            ExpiresIn=expires_in,
        )
        return url

    def generate_presigned_get_url(
        self,
        bucket: str,
        storage_path: str,
        expires_in: int = 900,
    ) -> str:
        """Generates a presigned GET URL for secure, time-limited file download."""
        if bucket not in ALLOWED_BUCKETS:
            raise ValueError(f"Unauthorized bucket: {bucket}")

        client = self.get_client()
        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": storage_path},
            ExpiresIn=expires_in,
        )
        return url

    def delete_object(self, bucket: str, storage_path: str) -> bool:
        """Deletes an object from MinIO."""
        if bucket not in ALLOWED_BUCKETS:
            raise ValueError(f"Unauthorized bucket: {bucket}")

        client = self.get_client()
        try:
            client.delete_object(Bucket=bucket, Key=storage_path)
            return True
        except Exception as e:
            logger.error(f"Error deleting object from {bucket}/{storage_path}: {e}")
            return False


storage_service = StorageService()
