from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException, status
from app.core.config import settings
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User, UserCredential, UserRefreshToken
from app.models.approval import PasswordReset


class AuthService:
    @staticmethod
    async def authenticate_user(
        db: AsyncSession, email: str, password: str
    ) -> Optional[User]:
        stmt = select(User).where(User.email == email.lower().strip(), User.is_deleted == False)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            return None

        # Verify password from user_credentials
        cred_stmt = select(UserCredential).where(UserCredential.user_id == user.id)
        cred_res = await db.execute(cred_stmt)
        cred = cred_res.scalar_one_or_none()

        if not cred:
            return None

        if not verify_password(password, cred.password_hash):
            return None

        return user

    @staticmethod
    async def create_tokens_for_user(
        db: AsyncSession, user: User, device_info: Optional[str] = None
    ) -> Tuple[str, str]:
        # Access token claims
        claims = {
            "email": user.email,
            "role": user.role,
            "company_id": str(user.company_id) if user.company_id else None,
            "department_id": str(user.department_id) if user.department_id else None,
            "full_name": user.full_name or user.name,
        }
        access_token = create_access_token(subject=str(user.id), claims=claims)
        refresh_token = create_refresh_token(subject=str(user.id))

        # Store hashed refresh token in database for revocation tracking
        refresh_payload = decode_token(refresh_token)
        jti = refresh_payload.get("jti") if refresh_payload else str(UUID(int=0))

        token_record = UserRefreshToken(
            user_id=user.id,
            token_hash=jti,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            device_info=device_info,
        )
        db.add(token_record)
        await db.commit()

        return access_token, refresh_token

    @staticmethod
    async def refresh_access_token(
        db: AsyncSession, refresh_token: str
    ) -> Tuple[str, str, User]:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

        user_id_str = payload.get("sub")
        jti = payload.get("jti")

        try:
            user_uuid = UUID(user_id_str)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token subject",
            )

        # Verify refresh token in DB and check not revoked
        stmt = select(UserRefreshToken).where(
            UserRefreshToken.token_hash == jti,
            UserRefreshToken.user_id == user_uuid,
            UserRefreshToken.revoked_at.is_(None),
        )
        res = await db.execute(stmt)
        token_rec = res.scalar_one_or_none()

        if not token_rec or token_rec.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token is revoked or expired",
            )

        # Load user
        user_stmt = select(User).where(User.id == user_uuid, User.is_active == True, User.is_deleted == False)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

        # Rotate refresh token: revoke current, issue new
        token_rec.revoked_at = datetime.now(timezone.utc)
        await db.flush()

        new_access_token, new_refresh_token = await AuthService.create_tokens_for_user(db, user)
        return new_access_token, new_refresh_token, user

    @staticmethod
    async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> None:
        payload = decode_token(refresh_token)
        if payload and payload.get("jti"):
            jti = payload.get("jti")
            stmt = update(UserRefreshToken).where(UserRefreshToken.token_hash == jti).values(revoked_at=datetime.now(timezone.utc))
            await db.execute(stmt)
            await db.commit()

    @staticmethod
    async def change_password(
        db: AsyncSession, user_id: UUID, current_password: str, new_password: str
    ) -> bool:
        stmt = select(UserCredential).where(UserCredential.user_id == user_id)
        res = await db.execute(stmt)
        cred = res.scalar_one_or_none()

        if not cred or not verify_password(current_password, cred.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password verification failed",
            )

        cred.password_hash = get_password_hash(new_password)
        await db.commit()
        return True

    @staticmethod
    async def request_password_reset(db: AsyncSession, email: str) -> bool:
        stmt = select(User).where(User.email == email.lower().strip())
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()

        if user:
            reset_entry = PasswordReset(
                email=user.email,
                requester_id=user.id,
                status="Pending",
            )
            db.add(reset_entry)
            await db.commit()
        return True


auth_service = AuthService()
