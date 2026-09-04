from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    ChangePasswordRequest,
    PasswordResetRequest,
    AuthStatusResponse,
    UserSummary,
)
from app.services.auth_service import auth_service

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await auth_service.authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token, refresh_token = await auth_service.create_tokens_for_user(db, user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserSummary.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    access_token, new_refresh_token, user = await auth_service.refresh_access_token(
        db, request.refresh_token
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserSummary.model_validate(user),
    )


@router.post("/logout")
async def logout(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    await auth_service.revoke_refresh_token(db, request.refresh_token)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserSummary)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    return UserSummary.model_validate(current_user)


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.change_password(
        db, current_user.id, request.current_password, request.new_password
    )
    return {"message": "Password updated successfully"}


@router.post("/request-password-reset")
async def request_password_reset(
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    await auth_service.request_password_reset(db, request.email)
    return {"message": "Password reset request recorded"}


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status(
    current_user: User = Depends(get_current_user),
):
    return AuthStatusResponse(
        is_approved=current_user.is_approved,
        role=current_user.role,
        onboarding_completed=current_user.onboarding_completed,
    )
