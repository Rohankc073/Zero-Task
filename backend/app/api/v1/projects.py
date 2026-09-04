from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectMember

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    department_id: UUID | None = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    status: str
    owner_id: UUID
    company_id: UUID

    class Config:
        from_attributes = True


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Project)
    if current_user.role != "Super Admin":
        stmt = stmt.where(Project.company_id == current_user.company_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = Project(
        name=data.name,
        description=data.description,
        owner_id=current_user.id,
        department_id=data.department_id or current_user.department_id,
        company_id=current_user.company_id,
        status="Active",
    )
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return proj
