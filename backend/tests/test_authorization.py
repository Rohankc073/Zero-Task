import pytest
from fastapi import HTTPException
from app.core.dependencies import (
    require_role,
    require_company_access,
    require_department_access,
)
from tests.conftest import COMPANY_A_ID, COMPANY_B_ID, DEPT_A_ID, DEPT_B_ID


@pytest.mark.asyncio
async def test_require_role_allowed(superadmin_user, founder_a, employee_a):
    checker = require_role(["Super Admin", "Founder"])

    # Super Admin allowed
    res_sa = await checker(superadmin_user)
    assert res_sa.role == "Super Admin"

    # Founder allowed
    res_fa = await checker(founder_a)
    assert res_fa.role == "Founder"

    # Employee rejected with 403
    with pytest.raises(HTTPException) as exc_info:
        await checker(employee_a)
    assert exc_info.value.status_code == 403


def test_require_company_access_multi_tenancy(superadmin_user, founder_a, employee_b):
    # Founder A accessing Company A resource -> OK
    require_company_access(COMPANY_A_ID, founder_a)

    # Super Admin accessing Company A and Company B resources -> OK (platform bypass)
    require_company_access(COMPANY_A_ID, superadmin_user)
    require_company_access(COMPANY_B_ID, superadmin_user)

    # Employee B accessing Company A resource -> 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        require_company_access(COMPANY_A_ID, employee_b)
    assert exc_info.value.status_code == 403
    assert "Cross-company access violation" in exc_info.value.detail


def test_require_department_access(founder_a, manager_a, employee_a):
    # Founder can access any department in company
    require_department_access(DEPT_B_ID, founder_a)

    # Manager in Dept A accessing Dept A -> OK
    require_department_access(DEPT_A_ID, manager_a)

    # Manager in Dept A accessing Dept B -> 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        require_department_access(DEPT_B_ID, manager_a)
    assert exc_info.value.status_code == 403
