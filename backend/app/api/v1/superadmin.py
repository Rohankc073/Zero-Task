from typing import List, Optional, Any, Dict
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.company import Company
from app.models.user import User
from app.models.misc import AuditLog
from app.services.superadmin_service import superadmin_service

router = APIRouter(dependencies=[Depends(require_role(["Super Admin"]))])


class CreateCompanyRequest(BaseModel):
    company_name: str
    founder_name: str
    founder_email: EmailStr
    founder_phone: str = ""
    initial_password: str = "Test@123"


class UpdateCompanyRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None


class CompanySummaryResponse(BaseModel):
    id: UUID
    name: str
    code: Optional[str] = None
    status: str
    created_at: Optional[Any] = None
    founder: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


@router.get("/companies", response_model=List[Dict[str, Any]])
async def list_all_companies(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Company)
        .options(selectinload(Company.users))
        .order_by(desc(Company.created_at))
    )
    if status_filter and status_filter != "All":
        stmt = stmt.where(Company.status == status_filter)
    
    res = await db.execute(stmt)
    companies = list(res.scalars().all())
    
    result = []
    for c in companies:
        founder = next((u for u in c.users if u.role == "Founder" and not u.is_deleted), None)
        c_dict = {
            "id": str(c.id),
            "name": c.name,
            "code": c.code,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "founder": {
                "id": str(founder.id),
                "name": founder.name,
                "full_name": founder.full_name,
                "email": founder.email,
                "phone_number": founder.phone_number,
                "role": founder.role,
                "is_active": founder.is_active,
                "status": "Approved" if founder.is_active else "Pending",
            } if founder else None
        }
        if search:
            q = search.lower()
            name_match = c.name and q in c.name.lower()
            founder_match = founder and (
                (founder.full_name and q in founder.full_name.lower()) or
                (founder.name and q in founder.name.lower()) or
                (founder.email and q in founder.email.lower())
            )
            if not (name_match or founder_match):
                continue
        result.append(c_dict)

    return result


@router.get("/companies/{company_id}")
async def get_company_details(
    company_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Company)
        .options(selectinload(Company.users))
        .where(Company.id == company_id)
    )
    res = await db.execute(stmt)
    company = res.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    founder = next((u for u in company.users if u.role == "Founder" and not u.is_deleted), None)
    return {
        "id": str(company.id),
        "name": company.name,
        "code": company.code,
        "status": company.status,
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "founder": {
            "id": str(founder.id),
            "name": founder.name,
            "full_name": founder.full_name,
            "email": founder.email,
            "phone_number": founder.phone_number,
            "role": founder.role,
            "is_active": founder.is_active,
            "status": "Approved" if founder.is_active else "Pending",
            "created_at": founder.created_at.isoformat() if founder.created_at else None,
        } if founder else None,
    }


@router.patch("/companies/{company_id}")
async def update_company(
    company_id: UUID,
    data: UpdateCompanyRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Company).where(Company.id == company_id)
    res = await db.execute(stmt)
    company = res.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if data.name is not None:
        company.name = data.name.strip()
    if data.status is not None:
        company.status = data.status
        # Log audit
        audit = AuditLog(
            action_type="COMPANY_ACTIVATED" if data.status == "Active" else "COMPANY_DEACTIVATED",
            target_type="company",
            target_id=company.id,
            description=f"Company status changed to {data.status}",
            company_id=company.id,
        )
        db.add(audit)

    await db.commit()
    await db.refresh(company)
    return {
        "id": str(company.id),
        "name": company.name,
        "code": company.code,
        "status": company.status,
    }


@router.get("/founders")
async def list_all_founders(
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(User)
        .options(selectinload(User.company))
        .where(User.role == "Founder", User.is_deleted == False)
        .order_by(desc(User.created_at))
    )
    res = await db.execute(stmt)
    founders = list(res.scalars().all())

    results = []
    for f in founders:
        f_dict = {
            "id": str(f.id),
            "email": f.email,
            "name": f.name,
            "full_name": f.full_name,
            "phone_number": f.phone_number,
            "role": f.role,
            "is_active": f.is_active,
            "status": "Approved" if f.is_active else "Pending",
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "company_id": str(f.company_id) if f.company_id else None,
            "company": {
                "id": str(f.company.id),
                "name": f.company.name,
                "status": f.company.status,
            } if f.company else None,
        }
        if search:
            q = search.lower().strip()
            matches = (
                (f.full_name and q in f.full_name.lower()) or
                (f.name and q in f.name.lower()) or
                (f.email and q in f.email.lower()) or
                (f.company and f.company.name and q in f.company.name.lower())
            )
            if not matches:
                continue
        results.append(f_dict)
    return results


@router.get("/alerts")
async def get_alerts(
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    res = await db.execute(stmt)
    logs = list(res.scalars().all())
    return [
        {
            "id": str(l.id),
            "action_type": l.action_type,
            "description": l.description,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "company_id": str(l.company_id) if l.company_id else None,
        }
        for l in logs
    ]


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

