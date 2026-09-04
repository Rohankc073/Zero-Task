from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, Department, Designation
from app.schemas.user import (
    UserResponse,
    UserUpdate,
    DepartmentResponse,
    DesignationResponse,
)

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_my_full_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(User)
        .options(selectinload(User.department), selectinload(User.designation))
        .where(User.id == current_user.id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.get("", response_model=List[UserResponse])
async def list_company_users(
    department_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists users belonging to caller's company. Super Admin can see all."""
    stmt = select(User).options(
        selectinload(User.department), selectinload(User.designation)
    ).where(User.is_deleted == False)

    if current_user.role != "Super Admin":
        stmt = stmt.where(User.company_id == current_user.company_id)

    if department_id:
        stmt = stmt.where(User.department_id == department_id)

    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Department)
    if current_user.role != "Super Admin":
        stmt = stmt.where(Department.company_id == current_user.company_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get("/designations", response_model=List[DesignationResponse])
async def list_designations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Designation)
    if current_user.role != "Super Admin":
        stmt = stmt.where(Designation.company_id == current_user.company_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user_profile(
    user_id: UUID,
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Only self or Founder / Super Admin can update
    if current_user.id != user_id and current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target_user = res.scalar_one_or_none()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role != "Super Admin" and target_user.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company update prohibited")

    update_dict = data.model_dump(exclude_unset=True)
    # Only Founder or Super Admin can change roles or approval status
    if ("role" in update_dict or "is_approved" in update_dict) and current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=403, detail="Only executives can modify role or approval status")

    for k, v in update_dict.items():
        setattr(target_user, k, v)

    await db.commit()
    await db.refresh(target_user)
    return target_user
