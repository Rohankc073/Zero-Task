from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import require_role
from app.services.superadmin_service import superadmin_service

router = APIRouter(dependencies=[Depends(require_role(["Super Admin"]))])


class CreateCompanyRequest(BaseModel):
    company_name: str
    founder_name: str
    founder_email: EmailStr
    founder_phone: str = ""
    initial_password: str = "Test@123"


class CompanySummaryResponse(BaseModel):
    id: UUID
    name: str
    code: str | None = None
    status: str

    class Config:
        from_attributes = True


@router.get("/companies", response_model=List[CompanySummaryResponse])
async def list_all_companies(
    db: AsyncSession = Depends(get_db),
):
    companies = await superadmin_service.list_companies(db)
    return [CompanySummaryResponse.model_validate(c) for c in companies]


@router.post("/companies")
async def provision_new_company(
    data: CreateCompanyRequest,
    db: AsyncSession = Depends(get_db),
):
    return await superadmin_service.create_company_and_founder(
        db=db,
        company_name=data.company_name,
        founder_name=data.founder_name,
        founder_email=data.founder_email,
        founder_phone=data.founder_phone,
        initial_password=data.initial_password,
    )


@router.delete("/companies/{company_id}")
async def purge_company(
    company_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    return await superadmin_service.delete_company(db, company_id)
