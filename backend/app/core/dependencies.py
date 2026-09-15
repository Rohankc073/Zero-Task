from typing import List, Optional
from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.config import settings
from app.core.database import get_db, set_db_security_context
from app.core.security import decode_token
from app.models.user import User
from app.models.company import Company

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Decodes JWT access token, validates claims, loads user from database,
    and sets transaction-local PostgreSQL session context.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type, access token required",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise credentials_exception

    # Query active user
    stmt = select(User).options(selectinload(User.company)).where(User.id == user_uuid, User.is_deleted == False)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise credentials_exception

    if user.role != "Super Admin" and user.company and user.company.status != "Active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company account is deactivated. Users of this company cannot access workspaces.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{user.role} account is deactivated",
        )

    # Set PostgreSQL transaction-local session variables for secondary RLS defense-in-depth
    await set_db_security_context(
        session=db,
        user_id=str(user.id),
        company_id=str(user.company_id) if user.company_id else None,
        role=user.role,
        department_id=str(user.department_id) if user.department_id else None,
    )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Enforces that non-founder accounts are approved."""
    if not current_user.is_approved and current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is pending administrator approval",
        )
    return current_user


def require_role(allowed_roles: List[str]):
    """Factory creating a dependency that restricts access to specified roles."""
    async def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of roles {allowed_roles}, caller has {current_user.role}",
            )
        return current_user
    return role_checker


def require_company_access(company_id: UUID, current_user: User) -> None:
    """Validates that caller belongs to the requested company (or is Super Admin)."""
    if current_user.role == "Super Admin":
        return
    if not current_user.company_id or current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-company access violation: caller belongs to a different company",
        )


def require_department_access(department_id: Optional[UUID], current_user: User) -> None:
    """Validates department boundary access."""
    if current_user.role in ["Super Admin", "Founder"]:
        return
    if department_id and current_user.department_id != department_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Department boundary violation: caller not authorized for target department",
        )
