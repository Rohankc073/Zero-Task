from datetime import datetime, timezone
import uuid
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, or_
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import get_password_hash
from app.models.user import User, Department, Designation, UserCredential, UserRefreshToken
from app.schemas.user import (
    UserResponse,
    UserCreate,
    UserUpdate,
    AdminResetPasswordRequest,
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse,
    DesignationCreate,
    DesignationUpdate,
    DesignationResponse,
)

router = APIRouter()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new user under the current company. Founder and Super Admin only."""
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Founders and Super Admins can create users.",
        )

    if current_user.role == "Super Admin" and data.role == "Founder":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admins are not authorized to create Founder accounts.",
        )

    if current_user.role == "Founder" and data.role in ["Super Admin", "Founder"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Founders are not authorized to create Super Admin or Founder accounts.",
        )

    target_company_id = current_user.company_id
    if current_user.role == "Super Admin":
        if data.company_id:
            target_company_id = data.company_id
        elif data.department_id:
            dept_res = await db.execute(select(Department).where(Department.id == data.department_id))
            dept = dept_res.scalar_one_or_none()
            if dept and dept.company_id:
                target_company_id = dept.company_id

    if not target_company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company ID is required to create a user.",
        )

    clean_email = data.email.lower().strip()
    existing_stmt = select(User).where(User.email == clean_email, User.is_deleted == False)
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists.",
        )

    clean_phone = data.phone_number.strip() if data.phone_number else None
    user_name = data.full_name or data.name or clean_email.split("@")[0]

    # Validate department and designation belong to the company
    valid_dept_id = data.department_id
    if valid_dept_id:
        dept_check = await db.execute(
            select(Department).where(Department.id == valid_dept_id, Department.company_id == target_company_id)
        )
        if not dept_check.scalar_one_or_none():
            valid_dept_id = None

    valid_desig_id = data.designation_id
    if valid_desig_id:
        desig_check = await db.execute(
            select(Designation).where(Designation.id == valid_desig_id, Designation.company_id == target_company_id)
        )
        if not desig_check.scalar_one_or_none():
            valid_desig_id = None

    new_user = User(
        email=clean_email,
        name=user_name,
        full_name=user_name,
        role=data.role,
        company_id=target_company_id,
        department_id=valid_dept_id,
        designation_id=valid_desig_id,
        phone_number=clean_phone,
        avatar_url=data.avatar_url,
        is_approved=True,
        is_active=True,
        is_deleted=False,
        onboarding_completed=True,
    )
    db.add(new_user)
    await db.flush()

    raw_password = data.password.strip() if data.password else "Password123"
    hashed_password = get_password_hash(raw_password)
    user_cred = UserCredential(
        user_id=new_user.id,
        password_hash=hashed_password,
    )
    db.add(user_cred)
    await db.commit()

    stmt_refreshed = (
        select(User)
        .options(
            selectinload(User.company),
            selectinload(User.department),
            selectinload(User.designation),
        )
        .where(User.id == new_user.id)
    )
    res_refreshed = await db.execute(stmt_refreshed)
    return res_refreshed.scalar_one()


@router.get("/me", response_model=UserResponse)
async def get_my_full_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(User)
        .options(
            selectinload(User.company),
            selectinload(User.department),
            selectinload(User.designation),
        )
        .where(User.id == current_user.id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.get("", response_model=List[UserResponse])
async def list_company_users(
    department_id: Optional[UUID] = None,
    company_id: Optional[UUID] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists users belonging to caller's company. Super Admin can see all or filter by company."""
    stmt = (
        select(User)
        .options(
            selectinload(User.company),
            selectinload(User.department),
            selectinload(User.designation),
        )
        .where(User.is_deleted == False)
    )

    if current_user.role != "Super Admin":
        stmt = stmt.where(User.company_id == current_user.company_id)
    elif company_id:
        stmt = stmt.where(User.company_id == company_id)

    if department_id:
        stmt = stmt.where(User.department_id == department_id)

    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.full_name).like(q),
                func.lower(User.name).like(q),
                func.lower(User.email).like(q),
            )
        )

    stmt = stmt.order_by(User.full_name.asc(), User.name.asc())
    res = await db.execute(stmt)
    users = list(res.scalars().all())
    for u in users:
        if not u.full_name:
            u.full_name = u.name or u.email.split("@")[0]
        if not u.name:
            u.name = u.full_name
    return users


@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(
    company_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Department)
    if current_user.role != "Super Admin":
        stmt = stmt.where(Department.company_id == current_user.company_id)
    elif company_id:
        stmt = stmt.where(Department.company_id == company_id)
    stmt = stmt.order_by(Department.name.asc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    data: DepartmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Founders and Super Admins can create departments.",
        )

    target_company_id = current_user.company_id
    if current_user.role == "Super Admin":
        target_company_id = data.company_id or current_user.company_id

    if not target_company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company ID is required to create a department.",
        )

    clean_name = data.name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department name cannot be empty.",
        )

    # Case-insensitive duplicate check scoped to company
    existing_stmt = select(Department).where(
        Department.company_id == target_company_id,
        func.lower(func.trim(Department.name)) == func.lower(clean_name),
    )
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Department already exists in this company.",
        )

    dept = Department(
        id=uuid.uuid4(),
        name=clean_name,
        description=data.description.strip() if data.description else None,
        company_id=target_company_id,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


@router.patch("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: UUID,
    data: DepartmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    dept_stmt = select(Department).where(Department.id == dept_id)
    dept_res = await db.execute(dept_stmt)
    dept = dept_res.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if current_user.role != "Super Admin" and dept.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company department access denied")

    if data.name is not None:
        clean_name = data.name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Department name cannot be empty")

        if clean_name.lower() != dept.name.lower():
            dup_stmt = select(Department).where(
                Department.company_id == dept.company_id,
                Department.id != dept.id,
                func.lower(func.trim(Department.name)) == func.lower(clean_name),
            )
            dup_res = await db.execute(dup_stmt)
            if dup_res.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Department already exists in this company.")
        dept.name = clean_name

    if data.description is not None:
        dept.description = data.description.strip() if data.description else None

    await db.commit()
    await db.refresh(dept)
    return dept


@router.delete("/departments/{dept_id}")
async def delete_department(
    dept_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    dept_stmt = select(Department).where(Department.id == dept_id)
    dept_res = await db.execute(dept_stmt)
    dept = dept_res.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if current_user.role != "Super Admin" and dept.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company department access denied")

    # Safety: Cannot delete department containing active users
    user_count_stmt = select(func.count(User.id)).where(User.department_id == dept_id, User.is_deleted == False)
    user_count = (await db.execute(user_count_stmt)).scalar() or 0
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete department containing {user_count} active user(s). Reassign them first.",
        )

    await db.execute(delete(Department).where(Department.id == dept_id))
    await db.commit()
    return {"message": "Department deleted successfully", "id": str(dept_id)}


@router.get("/designations", response_model=List[DesignationResponse])
async def list_designations(
    company_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Designation)
    if current_user.role != "Super Admin":
        stmt = stmt.where(Designation.company_id == current_user.company_id)
    elif company_id:
        stmt = stmt.where(Designation.company_id == company_id)
    stmt = stmt.order_by(Designation.name.asc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/designations", response_model=DesignationResponse, status_code=status.HTTP_201_CREATED)
async def create_designation(
    data: DesignationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Founders and Super Admins can create custom roles.",
        )

    target_company_id = current_user.company_id
    if current_user.role == "Super Admin":
        target_company_id = data.company_id or current_user.company_id

    if not target_company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company ID is required to create a designation.",
        )

    clean_name = data.name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role name cannot be empty.",
        )

    existing_stmt = select(Designation).where(
        Designation.company_id == target_company_id,
        func.lower(func.trim(Designation.name)) == func.lower(clean_name),
    )
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Custom role already exists in this company.",
        )

    desig = Designation(
        id=uuid.uuid4(),
        name=clean_name,
        description=data.description.strip() if data.description else None,
        base_role=data.base_role or "Employee",
        company_id=target_company_id,
    )
    db.add(desig)
    await db.commit()
    await db.refresh(desig)
    return desig


@router.patch("/designations/{desig_id}", response_model=DesignationResponse)
async def update_designation(
    desig_id: UUID,
    data: DesignationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    desig_stmt = select(Designation).where(Designation.id == desig_id)
    desig_res = await db.execute(desig_stmt)
    desig = desig_res.scalar_one_or_none()
    if not desig:
        raise HTTPException(status_code=404, detail="Designation not found")

    if current_user.role != "Super Admin" and desig.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access denied")

    if data.name is not None:
        clean_name = data.name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        if clean_name.lower() != desig.name.lower():
            dup_stmt = select(Designation).where(
                Designation.company_id == desig.company_id,
                Designation.id != desig.id,
                func.lower(func.trim(Designation.name)) == func.lower(clean_name),
            )
            dup_res = await db.execute(dup_stmt)
            if dup_res.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Custom role already exists in this company.")
        desig.name = clean_name

    if data.description is not None:
        desig.description = data.description.strip() if data.description else None
    if data.base_role is not None:
        desig.base_role = data.base_role

    await db.commit()
    await db.refresh(desig)
    return desig


@router.delete("/designations/{desig_id}")
async def delete_designation(
    desig_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    desig_stmt = select(Designation).where(Designation.id == desig_id)
    desig_res = await db.execute(desig_stmt)
    desig = desig_res.scalar_one_or_none()
    if not desig:
        raise HTTPException(status_code=404, detail="Designation not found")

    if current_user.role != "Super Admin" and desig.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access denied")

    user_count_stmt = select(func.count(User.id)).where(User.designation_id == desig_id, User.is_deleted == False)
    user_count = (await db.execute(user_count_stmt)).scalar() or 0
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete custom role assigned to {user_count} active user(s).",
        )

    await db.execute(delete(Designation).where(Designation.id == desig_id))
    await db.commit()
    return {"message": "Designation deleted successfully", "id": str(desig_id)}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(User)
        .options(
            selectinload(User.company),
            selectinload(User.department),
            selectinload(User.designation),
        )
        .where(User.id == user_id, User.is_deleted == False)
    )
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role != "Super Admin" and user.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return user


@router.post("/{user_id}/reset-password")
async def admin_reset_user_password(
    user_id: UUID,
    body: AdminResetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resets password for target user. Founder or Super Admin only."""
    if current_user.role not in ["Founder", "Super Admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Founders and Super Admins can reset user passwords.",
        )

    stmt = select(User).where(User.id == user_id, User.is_deleted == False)
    res = await db.execute(stmt)
    target_user = res.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role != "Super Admin" and target_user.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-company update prohibited")

    new_hash = get_password_hash(body.new_password.strip())
    cred_stmt = select(UserCredential).where(UserCredential.user_id == user_id)
    cred_res = await db.execute(cred_stmt)
    cred = cred_res.scalar_one_or_none()

    if cred:
        cred.password_hash = new_hash
    else:
        cred = UserCredential(user_id=user_id, password_hash=new_hash)
        db.add(cred)

    await db.commit()
    return {"message": "Password reset successfully", "user_id": str(user_id)}


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

    # Deactivating or activating a Founder account can ONLY be done by Super Admin
    if target_user.role == "Founder" and "is_active" in update_dict:
        if current_user.role != "Super Admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Super Admin has permission to activate or deactivate a Founder account.",
            )

    # Super Admin cannot be deactivated
    if target_user.role == "Super Admin" and "is_active" in update_dict and not update_dict["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super Admin account cannot be deactivated.",
        )

    if "full_name" in update_dict and update_dict["full_name"]:
        update_dict["name"] = update_dict["full_name"]
    if "email" in update_dict and update_dict["email"]:
        update_dict["email"] = str(update_dict["email"]).lower().strip()

    for k, v in update_dict.items():
        setattr(target_user, k, v)

    # If user was deactivated, revoke their active refresh tokens
    if update_dict.get("is_active") is False:
        await db.execute(
            update(UserRefreshToken)
            .where(UserRefreshToken.user_id == target_user.id, UserRefreshToken.revoked_at == None)
            .values(revoked_at=datetime.now(timezone.utc))
        )

    await db.commit()
    
    # Reload user with eagerly loaded relationships for Pydantic serialization
    stmt_refreshed = (
        select(User)
        .options(
            selectinload(User.company),
            selectinload(User.department),
            selectinload(User.designation),
        )
        .where(User.id == user_id)
    )
    res_refreshed = await db.execute(stmt_refreshed)
    return res_refreshed.scalar_one()
