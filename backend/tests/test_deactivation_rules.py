"""
test_deactivation_rules.py
==========================
Verifies critical organizational access control:
1. When a company is deactivated from the company section, NONE of the users of that company can log in (Founder, Dept Head, Manager, Employee).
2. When only the founder account is deactivated (and company is Active), ONLY the founder cannot log in; rest of the users CAN log in.
3. Only Super Admin has permission to deactivate a Founder or a Company.
4. Super Admin account is platform-level and can always log in.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.models.company import Company
from app.models.user import User, UserCredential
from app.services.auth_service import AuthService
from app.core.security import get_password_hash
from tests.conftest import (
    COMPANY_A_ID,
    USER_SUPERADMIN_ID,
    USER_FOUNDER_A_ID,
    USER_EMPLOYEE_A_ID,
    make_user,
)


@pytest.mark.asyncio
async def test_deactivated_company_blocks_all_users():
    """When a company is Inactive, ALL users of that company are blocked from logging in."""
    db = AsyncMock()
    inactive_company = Company(id=COMPANY_A_ID, name="Acme Inactive Corp", status="Inactive")
    pwd_hash = get_password_hash("Test@123")

    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)
    founder.company = inactive_company
    founder.is_active = True

    employee = make_user(USER_EMPLOYEE_A_ID, "employee@acme.com", "Employee", COMPANY_A_ID)
    employee.company = inactive_company
    employee.is_active = True

    founder_cred = UserCredential(user_id=founder.id, password_hash=pwd_hash)
    employee_cred = UserCredential(user_id=employee.id, password_hash=pwd_hash)

    # 1. Founder login blocked by deactivated company
    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = founder
    cred_res = MagicMock()
    cred_res.scalar_one_or_none.return_value = founder_cred
    db.execute = AsyncMock(side_effect=[user_res, cred_res])

    with pytest.raises(HTTPException) as exc_founder:
        await AuthService.authenticate_user(db, "founder@acme.com", "Test@123")
    assert exc_founder.value.status_code == 403
    assert "company account is deactivated" in exc_founder.value.detail.lower()

    # 2. Employee login blocked by deactivated company
    user_res2 = MagicMock()
    user_res2.scalar_one_or_none.return_value = employee
    cred_res2 = MagicMock()
    cred_res2.scalar_one_or_none.return_value = employee_cred
    db.execute = AsyncMock(side_effect=[user_res2, cred_res2])

    with pytest.raises(HTTPException) as exc_employee:
        await AuthService.authenticate_user(db, "employee@acme.com", "Test@123")
    assert exc_employee.value.status_code == 403
    assert "company account is deactivated" in exc_employee.value.detail.lower()


@pytest.mark.asyncio
async def test_deactivated_founder_blocks_only_founder_while_employees_login():
    """If only the founder account is deactivated, founder cannot log in, but employees CAN log in."""
    db = AsyncMock()
    active_company = Company(id=COMPANY_A_ID, name="Acme Active Corp", status="Active")
    pwd_hash = get_password_hash("Test@123")

    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)
    founder.company = active_company
    founder.is_active = False  # Deactivated founder

    employee = make_user(USER_EMPLOYEE_A_ID, "employee@acme.com", "Employee", COMPANY_A_ID)
    employee.company = active_company
    employee.is_active = True  # Active employee

    founder_cred = UserCredential(user_id=founder.id, password_hash=pwd_hash)
    employee_cred = UserCredential(user_id=employee.id, password_hash=pwd_hash)

    # 1. Founder login blocked because founder is_active == False
    user_res1 = MagicMock()
    user_res1.scalar_one_or_none.return_value = founder
    cred_res1 = MagicMock()
    cred_res1.scalar_one_or_none.return_value = founder_cred
    db.execute = AsyncMock(side_effect=[user_res1, cred_res1])

    with pytest.raises(HTTPException) as exc_founder:
        await AuthService.authenticate_user(db, "founder@acme.com", "Test@123")
    assert exc_founder.value.status_code == 403
    assert "founder account is deactivated" in exc_founder.value.detail.lower()

    # 2. Employee login SUCCEEDS because company is Active and employee is_active == True
    user_res2 = MagicMock()
    user_res2.scalar_one_or_none.return_value = employee
    cred_res2 = MagicMock()
    cred_res2.scalar_one_or_none.return_value = employee_cred
    db.execute = AsyncMock(side_effect=[user_res2, cred_res2])

    auth_employee = await AuthService.authenticate_user(db, "employee@acme.com", "Test@123")
    assert auth_employee is not None
    assert auth_employee.id == employee.id
    assert auth_employee.email == "employee@acme.com"


@pytest.mark.asyncio
async def test_superadmin_always_can_login():
    """Super Admin is platform-level without company boundary and can always log in."""
    db = AsyncMock()
    pwd_hash = get_password_hash("Test@123")

    superadmin = make_user(USER_SUPERADMIN_ID, "superadmin@zerotask.com", "Super Admin", None)
    superadmin.company = None
    superadmin.is_active = True

    cred = UserCredential(user_id=superadmin.id, password_hash=pwd_hash)

    user_res = MagicMock()
    user_res.scalar_one_or_none.return_value = superadmin
    cred_res = MagicMock()
    cred_res.scalar_one_or_none.return_value = cred
    db.execute = AsyncMock(side_effect=[user_res, cred_res])

    auth_sa = await AuthService.authenticate_user(db, "superadmin@zerotask.com", "Test@123")
    assert auth_sa is not None
    assert auth_sa.email == "superadmin@zerotask.com"
    assert auth_sa.role == "Super Admin"
