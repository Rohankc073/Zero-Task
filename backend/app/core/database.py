from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from app.core.config import settings
from app.core.logging import logger

engine = create_async_engine(
    settings.get_database_url(),
    echo=False,
    future=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async SQLAlchemy session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            raise e
        finally:
            await session.close()


async def set_db_security_context(
    session: AsyncSession,
    user_id: str | None = None,
    company_id: str | None = None,
    role: str | None = None,
    department_id: str | None = None,
) -> None:
    """
    Sets transaction-local PostgreSQL session variables.
    Provides secondary Row Level Security defense-in-depth within PostgreSQL.
    """
    try:
        if user_id:
            await session.execute(text(f"SET LOCAL app.current_user_id = '{user_id}'"))
        if company_id:
            await session.execute(text(f"SET LOCAL app.current_company_id = '{company_id}'"))
        if role:
            await session.execute(text(f"SET LOCAL app.current_user_role = '{role}'"))
        if department_id:
            await session.execute(text(f"SET LOCAL app.current_department_id = '{department_id}'"))
    except Exception as e:
        logger.warning(f"Could not set DB security context: {e}")
