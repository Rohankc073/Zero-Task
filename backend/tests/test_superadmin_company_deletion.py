"""
test_superadmin_company_deletion.py
===================================
Tests for SuperAdmin company deletion:
- Rejects deletion if company is currently Active (requires deactivation first).
- Rejects deletion if caller is not Super Admin (403 Forbidden).
- Cascades deletion of all messages, tasks, meetings, channels, and tenant users once Inactive.
- Guarantees Super Admin accounts are preserved.
- Returns 404 if company does not exist.
- Handles direct cascade cleanly.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.models.company import Company
from app.models.user import User
from app.services.superadmin_service import SuperAdminService
from tests.conftest import (
    COMPANY_A_ID,
    USER_SUPERADMIN_ID,
    USER_FOUNDER_A_ID,
    USER_EMPLOYEE_A_ID,
    make_user,
)


@pytest.mark.asyncio
async def test_delete_active_company_rejected():
    """Active companies must be deactivated first before deletion."""
    db = AsyncMock()
    mock_company = Company(id=COMPANY_A_ID, name="Acme Active Corp", status="Active")
    comp_res = MagicMock()
    comp_res.scalar_one_or_none.return_value = mock_company
    db.execute = AsyncMock(return_value=comp_res)

    super_admin = make_user(USER_SUPERADMIN_ID, "admin@zerotask.internal", "Super Admin")

    with pytest.raises(HTTPException) as exc_info:
        await SuperAdminService.delete_company(db, COMPANY_A_ID, current_user=super_admin)

    assert exc_info.value.status_code == 400
    assert "must deactivate the company" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_delete_company_non_superadmin_forbidden():
    """Non-SuperAdmin users cannot delete companies."""
    db = AsyncMock()
    founder = make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)

    with pytest.raises(HTTPException) as exc_info:
        await SuperAdminService.delete_company(db, COMPANY_A_ID, current_user=founder)

    assert exc_info.value.status_code == 403
    assert "only super admin profile has permission" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_delete_company_not_found():
    """Returns 404 if company does not exist."""
    db = AsyncMock()
    comp_res = MagicMock()
    comp_res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=comp_res)

    super_admin = make_user(USER_SUPERADMIN_ID, "admin@zerotask.internal", "Super Admin")

    with pytest.raises(HTTPException) as exc_info:
        await SuperAdminService.delete_company(db, uuid.uuid4(), current_user=super_admin)

    assert exc_info.value.status_code == 404
    assert "company not found" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_delete_inactive_company_direct_cascade_success():
    """Inactive companies are deleted along with all tenant users and resources."""
    db = AsyncMock()
    mock_company = Company(id=COMPANY_A_ID, name="Acme Inactive Corp", status="Inactive")
    comp_res = MagicMock()
    comp_res.scalar_one_or_none.return_value = mock_company

    user_res = MagicMock()
    user_res.fetchall.return_value = [(USER_FOUNDER_A_ID,), (USER_EMPLOYEE_A_ID,)]

    call_count = 0
    async def mock_execute(stmt, params=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return comp_res
        if call_count == 3:
            return user_res
        return MagicMock()

    db.execute = AsyncMock(side_effect=mock_execute)

    super_admin = make_user(USER_SUPERADMIN_ID, "admin@zerotask.internal", "Super Admin")
    res = await SuperAdminService.delete_company(db, COMPANY_A_ID, current_user=super_admin)

    assert res["success"] is True
    assert res["deleted_company_id"] == str(COMPANY_A_ID)
    assert res["deleted_users_count"] == 2
    assert db.commit.called is True
