"""
Script to create a safe local development test user and company for ZeroTask self-hosted backend.
Creates:
- Company: ZeroTask Test Company
- Department: Executive
- Designation: Founder & CEO
- User: founder@test.local (Role: Founder)
- UserCredential: Password hash only (bcrypt)
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.company import Company
from app.models.user import Department, Designation, User, UserCredential
from app.core.logging import logger

TEST_EMAIL = "founder@test.local"
TEST_NAME = "Test Founder"
TEST_ROLE = "Founder"
TEST_COMPANY_NAME = "ZeroTask Test Company"
TEST_COMPANY_CODE = "ZTTEST"
TEST_PASSWORD = "TestFounder2026!"


async def create_test_founder():
    logger.info("Connecting to database to create test founder...")
    async with AsyncSessionLocal() as db:
        # Check if user already exists
        existing_user_stmt = select(User).where(User.email == TEST_EMAIL)
        res = await db.execute(existing_user_stmt)
        if res.scalar_one_or_none():
            logger.warning(f"User {TEST_EMAIL} already exists in database.")
            return

        # 1. Company
        company = Company(
            name=TEST_COMPANY_NAME,
            code=TEST_COMPANY_CODE,
            industry="Software",
            status="Active",
        )
        db.add(company)
        await db.flush()
        logger.info(f"Created company: {company.name} (id: {company.id})")

        # 2. Department
        dept = Department(
            name="Executive",
            description="Executive Leadership",
            company_id=company.id,
        )
        db.add(dept)
        await db.flush()
        logger.info(f"Created department: {dept.name} (id: {dept.id})")

        # 3. Designation
        desig = Designation(
            name="Founder & CEO",
            description="Company Founder",
            company_id=company.id,
            base_role="Founder",
        )
        db.add(desig)
        await db.flush()
        logger.info(f"Created designation: {desig.name} (id: {desig.id})")

        # 4. User
        user = User(
            email=TEST_EMAIL,
            name=TEST_NAME,
            full_name=TEST_NAME,
            role=TEST_ROLE,
            company_id=company.id,
            department_id=dept.id,
            designation_id=desig.id,
            is_approved=True,
            is_active=True,
            is_deleted=False,
            onboarding_completed=True,
            organization_name=TEST_COMPANY_NAME,
        )
        db.add(user)
        await db.flush()
        logger.info(f"Created user: {user.email} (id: {user.id})")

        # 5. UserCredential (bcrypt hash only, never plaintext)
        pwd_hash = get_password_hash(TEST_PASSWORD)
        cred = UserCredential(
            user_id=user.id,
            password_hash=pwd_hash,
        )
        db.add(cred)
        await db.commit()
        logger.info(f"Successfully stored bcrypt password hash for {user.email}")
        print(f"SUCCESS: Created test user {TEST_EMAIL} with company {TEST_COMPANY_NAME}")
        print(f"User ID: {user.id}")
        print(f"Company ID: {company.id}")


if __name__ == "__main__":
    asyncio.run(create_test_founder())
