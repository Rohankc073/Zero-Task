from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App Settings
    PROJECT_NAME: str = "ZeroTask Backend"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # PostgreSQL Database
    POSTGRES_SERVER: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "zerotask"
    POSTGRES_USER: str = "zerotask_app"
    POSTGRES_PASSWORD: str = "zerotask_secure_pass_2026"
    DATABASE_URL: str | None = None
    DATABASE_SYNC_URL: str | None = None
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    # Authentication & JWT
    JWT_SECRET_KEY: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://localhost:8000",
        "https://zerotask.yourdomain.com",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # MinIO / S3 Object Storage
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin_key"
    MINIO_SECRET_KEY: str = "minioadmin_secret"
    MINIO_USE_SSL: bool = False
    MINIO_REGION: str = "us-east-1"

    STORAGE_BUCKET_TASKS: str = "task-attachments"
    STORAGE_BUCKET_MEETINGS: str = "meeting-attachments"
    STORAGE_BUCKET_CHAT: str = "chat-attachments"
    STORAGE_BUCKET_AVATARS: str = "avatars"
    STORAGE_BUCKET_AUDIO: str = "task-audio"

    # Push Notifications
    EXPO_ACCESS_TOKEN: str | None = None
    ENABLE_PUSH_NOTIFICATIONS: bool = True

    # Google Calendar
    GOOGLE_CLIENT_ID: str = "765817728144-a7ilrgraqpst3f69es6osi4cvij1qq94.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET: str = "fake_google_client_secret_dev"
    GOOGLE_REDIRECT_URI: str = "https://api.zerotask.yourdomain.com/api/v1/integrations/google-calendar/callback"
    TOKEN_ENCRYPTION_KEY: str = "BdfZ5qg7a5jQ3d8Bv6Fk8eP3xR9t1m5uK7jL9nQ2sE4="

    # Meta WhatsApp Cloud API
    WHATSAPP_ACCESS_TOKEN: str = "fake_whatsapp_token_dev"
    WHATSAPP_PHONE_NUMBER_ID: str = "fake_phone_number_id"
    WHATSAPP_BUSINESS_ACCOUNT_ID: str = "fake_business_id"
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = "zerotask_whatsapp_verify_token_2026"
    WHATSAPP_APP_SECRET: str = "fake_whatsapp_app_secret"

    # Email / SMTP
    SMTP_HOST: str | None = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_TLS: bool = True
    EMAILS_FROM_EMAIL: str = "noreply@zerotask.yourdomain.com"
    EMAILS_FROM_NAME: str = "ZeroTask System"

    def get_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    def get_sync_database_url(self) -> str:
        if self.DATABASE_SYNC_URL:
            return self.DATABASE_SYNC_URL
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )


settings = Settings()
