import json
from typing import Dict, Any, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.models.company import Company
from app.models.user import User
from app.core.logging import logger


class SuperAdminService:
    @staticmethod
    async def create_company_and_founder(
        db: AsyncSession,
        company_name: str,
        founder_name: str,
        founder_email: str,
        founder_phone: str = "",
        initial_password: str = "Test@123",
    ) -> Dict[str, Any]:
        """Atomically provisions a company, founder account, and default organization records."""
        try:
            res = await db.execute(
                text(
                    "SELECT public.create_company_and_founder(:c_name, :f_name, :f_email, :f_phone, :f_pass)"
                ),
                {
                    "c_name": company_name.strip(),
                    "f_name": founder_name.strip(),
                    "f_email": founder_email.lower().strip(),
                    "f_phone": founder_phone.strip(),
                    "f_pass": initial_password,
                },
            )
            val = res.scalar()
            await db.commit()
            return val if isinstance(val, dict) else json.loads(val)
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed invoking create_company_and_founder procedure: {e}")
            raise e

    @staticmethod
    async def delete_company(db: AsyncSession, company_id: UUID) -> Dict[str, Any]:
        """Cascades deletion of company and all attached tenant accounts."""
        try:
            res = await db.execute(
                text("SELECT public.delete_company_and_users(:c_id)"),
                {"c_id": str(company_id)},
            )
            val = res.scalar()
            await db.commit()
            return val if isinstance(val, dict) else json.loads(val)
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed deleting company {company_id}: {e}")
            raise e

    @staticmethod
    async def list_companies(db: AsyncSession) -> List[Company]:
        stmt = select(Company).order_by(Company.created_at.desc())
        res = await db.execute(stmt)
        return list(res.scalars().all())


superadmin_service = SuperAdminService()
