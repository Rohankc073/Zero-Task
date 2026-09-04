import uuid
from typing import AsyncGenerator
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.models.user import User
from app.models.company import Company
from app.models.task import Task
from app.models.meeting import Meeting

# Fixed Test UUIDs
COMPANY_A_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
COMPANY_B_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
DEPT_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEPT_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")

USER_SUPERADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")
USER_FOUNDER_A_ID = uuid.UUID("aaaaaaaa-0001-0000-0000-000000000000")
USER_MANAGER_A_ID = uuid.UUID("aaaaaaaa-0002-0000-0000-000000000000")
USER_EMPLOYEE_A_ID = uuid.UUID("aaaaaaaa-0003-0000-0000-000000000000")

USER_FOUNDER_B_ID = uuid.UUID("bbbbbbbb-0001-0000-0000-000000000000")
USER_EMPLOYEE_B_ID = uuid.UUID("bbbbbbbb-0003-0000-0000-000000000000")


def make_user(uid, email, role, company_id=None, dept_id=None, is_active=True, is_approved=True):
    return User(
        id=uid,
        email=email,
        full_name=email.split("@")[0].capitalize(),
        role=role,
        company_id=company_id,
        department_id=dept_id,
        is_active=is_active,
        is_approved=is_approved,
        is_deleted=False,
    )


@pytest.fixture
def superadmin_user():
    return make_user(USER_SUPERADMIN_ID, "superadmin@zerotask.internal", "Super Admin")


@pytest.fixture
def founder_a():
    return make_user(USER_FOUNDER_A_ID, "founder.a@acme.com", "Founder", COMPANY_A_ID, DEPT_A_ID)


@pytest.fixture
def manager_a():
    return make_user(USER_MANAGER_A_ID, "manager.a@acme.com", "Manager", COMPANY_A_ID, DEPT_A_ID)


@pytest.fixture
def employee_a():
    return make_user(USER_EMPLOYEE_A_ID, "employee.a@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID)


@pytest.fixture
def founder_b():
    return make_user(USER_FOUNDER_B_ID, "founder.b@beta.com", "Founder", COMPANY_B_ID, DEPT_B_ID)


@pytest.fixture
def employee_b():
    return make_user(USER_EMPLOYEE_B_ID, "employee.b@beta.com", "Employee", COMPANY_B_ID, DEPT_B_ID)


@pytest.fixture
def auth_headers():
    def _headers(user: User):
        token = create_access_token(
            subject=str(user.id),
            claims={
                "email": user.email,
                "role": user.role,
                "company_id": str(user.company_id) if user.company_id else None,
                "department_id": str(user.department_id) if user.department_id else None,
            },
        )
        return {"Authorization": f"Bearer {token}"}
    return _headers


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
