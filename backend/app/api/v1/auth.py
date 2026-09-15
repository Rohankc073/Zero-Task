from typing import Optional, List
from uuid import UUID
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
    PasswordResetRequestResponse,
    PasswordResetItemResponse,
    PasswordResetRejectRequest,
    PasswordResetCompleteRequest,
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


@router.post("/request-password-reset", response_model=PasswordResetRequestResponse)
@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
async def request_password_reset(
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.request_password_reset(db, request.email)
    return PasswordResetRequestResponse(**result)


@router.get("/password-reset/my-request")
async def get_my_password_reset_status(
    email: str,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.get_my_password_reset_status(db, email)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active password reset request found.")
    return result


@router.get("/password-reset/requests", response_model=list[PasswordResetItemResponse])
async def list_password_reset_requests(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await auth_service.list_password_resets(db, current_user, status_filter)
    return [PasswordResetItemResponse(**item) for item in items]


@router.get("/password-reset/requests/{request_id}", response_model=PasswordResetItemResponse)
async def get_password_reset_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await auth_service.get_password_reset_by_id(db, request_id, current_user)
    return PasswordResetItemResponse(**item)


@router.post("/password-reset/requests/{request_id}/approve")
async def approve_password_reset(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.approve_password_reset(db, request_id, current_user)


@router.post("/password-reset/requests/{request_id}/reject")
async def reject_password_reset(
    request_id: UUID,
    data: PasswordResetRejectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.reject_password_reset(db, request_id, current_user, data.reason)


@router.post("/password-reset/requests/{request_id}/complete")
async def complete_password_reset(
    request_id: UUID,
    data: PasswordResetCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.complete_password_reset(db, request_id, current_user, data.new_password)


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status(
    current_user: User = Depends(get_current_user),
):
    return AuthStatusResponse(
        is_approved=current_user.is_approved,
        role=current_user.role,
        onboarding_completed=current_user.onboarding_completed,
    )
