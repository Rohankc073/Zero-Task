import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch
import pytest
from fastapi import HTTPException
from app.models.user import User
from app.models.meeting import Meeting, MeetingParticipant, MeetingApproval
from app.models.notification import InAppNotification
from app.schemas.meeting import MeetingCreate
from app.services.meeting_service import meeting_service

# Fixed Test UUIDs
COMPANY_A_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
COMPANY_B_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
DEPT_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEPT_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")

USER_SUPERADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")
USER_FOUNDER_A_ID = uuid.UUID("aaaaaaaa-0001-0000-0000-000000000000")
USER_DH_A_ID = uuid.UUID("aaaaaaaa-0002-0000-0000-000000000000")
USER_MANAGER_A_ID = uuid.UUID("aaaaaaaa-0003-0000-0000-000000000000")
USER_EMPLOYEE_A1_ID = uuid.UUID("aaaaaaaa-0004-0000-0000-000000000000")
USER_EMPLOYEE_A2_ID = uuid.UUID("aaaaaaaa-0005-0000-0000-000000000000")

USER_FOUNDER_B_ID = uuid.UUID("bbbbbbbb-0001-0000-0000-000000000000")
USER_DH_B_ID = uuid.UUID("bbbbbbbb-0002-0000-0000-000000000000")
USER_MANAGER_B_ID = uuid.UUID("bbbbbbbb-0003-0000-0000-000000000000")
USER_EMPLOYEE_B_ID = uuid.UUID("bbbbbbbb-0004-0000-0000-000000000000")


def make_test_user(uid, email, role, company_id=None, dept_id=None):
    return User(
        id=uid,
        email=email,
        full_name=email.split("@")[0].replace(".", " ").title(),
        role=role,
        company_id=company_id,
        department_id=dept_id,
        is_active=True,
        is_approved=True,
        is_deleted=False,
    )


class MockScalars:
    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items

    def first(self):
        return self._items[0] if self._items else None


class MockResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return MockScalars(self._items)

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def scalar_one(self):
        if not self._items:
            raise Exception("No items")
        return self._items[0]


class FakeAsyncSession:
    def __init__(self, users_dict=None, meetings_dict=None, approvals_dict=None):
        self.users = users_dict or {}
        self.meetings = meetings_dict or {}
        self.approvals = approvals_dict or {}
        self.added = []

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, Meeting):
            if not obj.id:
                obj.id = uuid.uuid4()
            self.meetings[obj.id] = obj
        elif isinstance(obj, MeetingApproval):
            if not obj.id:
                obj.id = uuid.uuid4()
            self.approvals[obj.id] = obj

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def rollback(self):
        pass

    async def execute(self, stmt):
        stmt_str = str(stmt).lower()
        params = {}
        try:
            params = stmt.compile().params
        except Exception:
            pass

        # Querying users
        if "users" in stmt_str:
            matched = list(self.users.values())
            # Check if querying specific IDs via IN clause
            if "users.id in" in stmt_str or "in (" in stmt_str:
                target_ids = set()
                for v in params.values():
                    if isinstance(v, (list, tuple, set)):
                        target_ids.update(v)
                    elif isinstance(v, uuid.UUID):
                        target_ids.add(v)
                if target_ids:
                    matched = [u for u in matched if u.id in target_ids]
                return MockResult(matched)

            # Founder eligible participants: (same company OR Super Admin) AND id != current_user
            if " or " in stmt_str and any(v == "Super Admin" for v in params.values()):
                comp_id = next((v for v in params.values() if isinstance(v, uuid.UUID) and v in [COMPANY_A_ID, COMPANY_B_ID]), None)
                exclude_id = next((v for v in params.values() if isinstance(v, uuid.UUID) and v not in [COMPANY_A_ID, COMPANY_B_ID]), None)
                matched = [u for u in matched if (u.company_id == comp_id or u.role == "Super Admin")]
                if exclude_id:
                    matched = [u for u in matched if u.id != exclude_id]
                return MockResult(matched)

            # Non-founder eligible participants: same company AND role != Super Admin AND id != current_user
            if "users.role !=" in stmt_str and "company_id" in stmt_str:
                comp_id = next((v for v in params.values() if isinstance(v, uuid.UUID) and v in [COMPANY_A_ID, COMPANY_B_ID]), None)
                exclude_id = next((v for v in params.values() if isinstance(v, uuid.UUID) and v not in [COMPANY_A_ID, COMPANY_B_ID]), None)
                matched = [u for u in matched if u.company_id == comp_id and u.role != "Super Admin"]
                if exclude_id:
                    matched = [u for u in matched if u.id != exclude_id]
                return MockResult(matched)

            # Specific role lookup (e.g. approver lookup)
            if "users.role =" in stmt_str:
                role_val = next((v for v in params.values() if isinstance(v, str) and v in ["Founder", "Department Head", "Manager", "Employee", "Super Admin"]), None)
                comp_id = next((v for v in params.values() if isinstance(v, uuid.UUID) and v in [COMPANY_A_ID, COMPANY_B_ID]), None)
                if role_val:
                    matched = [u for u in matched if u.role == role_val]
                if comp_id:
                    matched = [u for u in matched if u.company_id == comp_id]
                return MockResult(matched)

            if "users.id !=" in stmt_str:
                exclude_id = next((v for v in params.values() if isinstance(v, uuid.UUID)), None)
                if exclude_id:
                    matched = [u for u in matched if u.id != exclude_id]

            return MockResult(matched)

        if "meeting_approvals" in stmt_str:
            matched = list(self.approvals.values())
            return MockResult(matched)
        if "meetings" in stmt_str:
            matched = list(self.meetings.values())
            return MockResult(matched)
        return MockResult([])


@pytest.fixture
def user_roster():
    users = {
        USER_SUPERADMIN_ID: make_test_user(USER_SUPERADMIN_ID, "admin@zerotask.internal", "Super Admin"),
        USER_FOUNDER_A_ID: make_test_user(USER_FOUNDER_A_ID, "founder.a@acme.com", "Founder", COMPANY_A_ID, DEPT_A_ID),
        USER_DH_A_ID: make_test_user(USER_DH_A_ID, "dh.a@acme.com", "Department Head", COMPANY_A_ID, DEPT_A_ID),
        USER_MANAGER_A_ID: make_test_user(USER_MANAGER_A_ID, "mgr.a@acme.com", "Manager", COMPANY_A_ID, DEPT_A_ID),
        USER_EMPLOYEE_A1_ID: make_test_user(USER_EMPLOYEE_A1_ID, "emp.a1@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID),
        USER_EMPLOYEE_A2_ID: make_test_user(USER_EMPLOYEE_A2_ID, "emp.a2@acme.com", "Employee", COMPANY_A_ID, DEPT_A_ID),
        USER_FOUNDER_B_ID: make_test_user(USER_FOUNDER_B_ID, "founder.b@beta.com", "Founder", COMPANY_B_ID, DEPT_B_ID),
        USER_DH_B_ID: make_test_user(USER_DH_B_ID, "dh.b@beta.com", "Department Head", COMPANY_B_ID, DEPT_B_ID),
        USER_MANAGER_B_ID: make_test_user(USER_MANAGER_B_ID, "mgr.b@beta.com", "Manager", COMPANY_B_ID, DEPT_B_ID),
        USER_EMPLOYEE_B_ID: make_test_user(USER_EMPLOYEE_B_ID, "emp.b@beta.com", "Employee", COMPANY_B_ID, DEPT_B_ID),
    }
    return users


# ==============================================================================
# 1. SAME-LEVEL SCHEDULING (NO APPROVAL REQUIRED)
# ==============================================================================
@pytest.mark.asyncio
async def test_same_level_employee_to_employee(user_roster):
    emp1 = user_roster[USER_EMPLOYEE_A1_ID]
    emp2 = user_roster[USER_EMPLOYEE_A2_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Peer Sync",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[emp2.id],
    )
    meeting = await meeting_service.create_meeting(db, emp1, req)
    assert meeting.status == "Scheduled"
    # No approval created
    assert not any(isinstance(x, MeetingApproval) for x in db.added)


@pytest.mark.asyncio
async def test_same_level_manager_to_manager(user_roster):
    mgr = user_roster[USER_MANAGER_A_ID]
    req_mgr = make_test_user(uuid.uuid4(), "mgr2.a@acme.com", "Manager", COMPANY_A_ID, DEPT_A_ID)
    user_roster[req_mgr.id] = req_mgr
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Management Alignment",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[req_mgr.id],
    )
    meeting = await meeting_service.create_meeting(db, mgr, req)
    assert meeting.status == "Scheduled"
    assert not any(isinstance(x, MeetingApproval) for x in db.added)


@pytest.mark.asyncio
async def test_same_level_dh_to_dh(user_roster):
    dh = user_roster[USER_DH_A_ID]
    dh2 = make_test_user(uuid.uuid4(), "dh2.a@acme.com", "Department Head", COMPANY_A_ID, DEPT_A_ID)
    user_roster[dh2.id] = dh2
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Inter-Department Strategy",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[dh2.id],
    )
    meeting = await meeting_service.create_meeting(db, dh, req)
    assert meeting.status == "Scheduled"
    assert not any(isinstance(x, MeetingApproval) for x in db.added)


# ==============================================================================
# 2. FOUNDER SCHEDULING RULES
# ==============================================================================
@pytest.mark.asyncio
async def test_founder_to_internal_team_no_approval(user_roster):
    founder = user_roster[USER_FOUNDER_A_ID]
    dh = user_roster[USER_DH_A_ID]
    mgr = user_roster[USER_MANAGER_A_ID]
    emp = user_roster[USER_EMPLOYEE_A1_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="All-Hands Briefing",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[dh.id, mgr.id, emp.id],
    )
    meeting = await meeting_service.create_meeting(db, founder, req)
    assert meeting.status == "Scheduled"
    assert not any(isinstance(x, MeetingApproval) for x in db.added)


@pytest.mark.asyncio
async def test_founder_to_superadmin_requires_approval(user_roster):
    founder = user_roster[USER_FOUNDER_A_ID]
    sa = user_roster[USER_SUPERADMIN_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Platform Governance Consultation",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[sa.id],
    )
    meeting = await meeting_service.create_meeting(db, founder, req)
    assert meeting.status == "Pending_Approval"
    approval = next(x for x in db.added if isinstance(x, MeetingApproval))
    assert approval.approver_id == sa.id
    assert approval.requester_id == founder.id
    assert approval.status == "Pending"


# ==============================================================================
# 3. SUPER ADMIN PLATFORM RULES
# ==============================================================================
@pytest.mark.asyncio
async def test_superadmin_schedules_any_company_no_approval(user_roster):
    sa = user_roster[USER_SUPERADMIN_ID]
    emp_a = user_roster[USER_EMPLOYEE_A1_ID]
    emp_b = user_roster[USER_EMPLOYEE_B_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Cross-Tenant Security Audit",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[emp_a.id, emp_b.id],
    )
    meeting = await meeting_service.create_meeting(db, sa, req)
    assert meeting.status == "Scheduled"
    assert not any(isinstance(x, MeetingApproval) for x in db.added)


# ==============================================================================
# 4. DISALLOWED SUPER ADMIN TARGETS (DH, MANAGER, EMPLOYEE MUST BE 403)
# ==============================================================================
@pytest.mark.asyncio
async def test_dh_cannot_schedule_with_superadmin(user_roster):
    dh = user_roster[USER_DH_A_ID]
    sa = user_roster[USER_SUPERADMIN_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Bypassing Founder",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[sa.id],
    )
    with pytest.raises(HTTPException) as exc:
        await meeting_service.create_meeting(db, dh, req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_manager_cannot_schedule_with_superadmin(user_roster):
    mgr = user_roster[USER_MANAGER_A_ID]
    sa = user_roster[USER_SUPERADMIN_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Direct Escalation",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[sa.id],
    )
    with pytest.raises(HTTPException) as exc:
        await meeting_service.create_meeting(db, mgr, req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_employee_cannot_schedule_with_superadmin(user_roster):
    emp = user_roster[USER_EMPLOYEE_A1_ID]
    sa = user_roster[USER_SUPERADMIN_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Direct Escalation Attempt",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[sa.id],
    )
    with pytest.raises(HTTPException) as exc:
        await meeting_service.create_meeting(db, emp, req)
    assert exc.value.status_code == 403


# ==============================================================================
# 5. SENIOR APPROVAL REQUIREMENTS (DEPARTMENT HEAD, MANAGER, EMPLOYEE)
# ==============================================================================
@pytest.mark.asyncio
async def test_dh_to_founder_requires_approval(user_roster):
    dh = user_roster[USER_DH_A_ID]
    founder = user_roster[USER_FOUNDER_A_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Quarterly Capex Approval",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[founder.id],
    )
    meeting = await meeting_service.create_meeting(db, dh, req)
    assert meeting.status == "Pending_Approval"
    approval = next(x for x in db.added if isinstance(x, MeetingApproval))
    assert approval.approver_id == founder.id


@pytest.mark.asyncio
async def test_manager_to_founder_requires_approval(user_roster):
    mgr = user_roster[USER_MANAGER_A_ID]
    founder = user_roster[USER_FOUNDER_A_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Executive Strategy Briefing",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[founder.id],
    )
    meeting = await meeting_service.create_meeting(db, mgr, req)
    assert meeting.status == "Pending_Approval"
    approval = next(x for x in db.added if isinstance(x, MeetingApproval))
    assert approval.approver_id == founder.id


@pytest.mark.asyncio
async def test_manager_to_dh_requires_approval(user_roster):
    mgr = user_roster[USER_MANAGER_A_ID]
    dh = user_roster[USER_DH_A_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Sprint Milestone Check",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[dh.id],
    )
    meeting = await meeting_service.create_meeting(db, mgr, req)
    assert meeting.status == "Pending_Approval"
    approval = next(x for x in db.added if isinstance(x, MeetingApproval))
    assert approval.approver_id == dh.id


@pytest.mark.asyncio
async def test_employee_to_founder_requires_approval(user_roster):
    emp = user_roster[USER_EMPLOYEE_A1_ID]
    founder = user_roster[USER_FOUNDER_A_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Innovation Pitch",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[founder.id],
    )
    meeting = await meeting_service.create_meeting(db, emp, req)
    assert meeting.status == "Pending_Approval"
    approval = next(x for x in db.added if isinstance(x, MeetingApproval))
    assert approval.approver_id == founder.id


@pytest.mark.asyncio
async def test_employee_to_dh_requires_approval(user_roster):
    emp = user_roster[USER_EMPLOYEE_A1_ID]
    dh = user_roster[USER_DH_A_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Department Review",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[dh.id],
    )
    meeting = await meeting_service.create_meeting(db, emp, req)
    assert meeting.status == "Pending_Approval"
    approval = next(x for x in db.added if isinstance(x, MeetingApproval))
    assert approval.approver_id == dh.id


@pytest.mark.asyncio
async def test_employee_to_manager_requires_approval(user_roster):
    emp = user_roster[USER_EMPLOYEE_A1_ID]
    mgr = user_roster[USER_MANAGER_A_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="1-on-1 Performance Discussion",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[mgr.id],
    )
    meeting = await meeting_service.create_meeting(db, emp, req)
    assert meeting.status == "Pending_Approval"
    approval = next(x for x in db.added if isinstance(x, MeetingApproval))
    assert approval.approver_id == mgr.id


# ==============================================================================
# 6. CROSS-COMPANY ISOLATION REJECTIONS (403 STRICT)
# ==============================================================================
@pytest.mark.asyncio
async def test_cross_company_founder_rejected(user_roster):
    founder_a = user_roster[USER_FOUNDER_A_ID]
    founder_b = user_roster[USER_FOUNDER_B_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Unauthorized Partnership",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[founder_b.id],
    )
    with pytest.raises(HTTPException) as exc:
        await meeting_service.create_meeting(db, founder_a, req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_company_dh_rejected(user_roster):
    dh_a = user_roster[USER_DH_A_ID]
    mgr_b = user_roster[USER_MANAGER_B_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Cross Company Leak",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[mgr_b.id],
    )
    with pytest.raises(HTTPException) as exc:
        await meeting_service.create_meeting(db, dh_a, req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_company_manager_rejected(user_roster):
    mgr_a = user_roster[USER_MANAGER_A_ID]
    emp_b = user_roster[USER_EMPLOYEE_B_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Cross Company Outreach",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[emp_b.id],
    )
    with pytest.raises(HTTPException) as exc:
        await meeting_service.create_meeting(db, mgr_a, req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_company_employee_rejected(user_roster):
    emp_a = user_roster[USER_EMPLOYEE_A1_ID]
    emp_b = user_roster[USER_EMPLOYEE_B_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="External Collab",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[emp_b.id],
    )
    with pytest.raises(HTTPException) as exc:
        await meeting_service.create_meeting(db, emp_a, req)
    assert exc.value.status_code == 403


# ==============================================================================
# 7. TARGET DROPDOWN / USER VISIBILITY ELIGIBILITY
# ==============================================================================
@pytest.mark.asyncio
async def test_dropdown_targets_superadmin(user_roster):
    sa = user_roster[USER_SUPERADMIN_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    # Super Admin sees everyone across all companies except self
    targets = await meeting_service.get_eligible_participants(db, sa)
    target_ids = {u.id for u in targets}
    assert sa.id not in target_ids
    assert USER_FOUNDER_A_ID in target_ids
    assert USER_FOUNDER_B_ID in target_ids


@pytest.mark.asyncio
async def test_dropdown_targets_founder(user_roster):
    founder_a = user_roster[USER_FOUNDER_A_ID]
    # Filter DB to reflect company A + superadmin
    company_a_and_sa = {
        uid: u for uid, u in user_roster.items()
        if u.company_id == COMPANY_A_ID or u.role == "Super Admin"
    }
    db = FakeAsyncSession(users_dict=company_a_and_sa)

    targets = await meeting_service.get_eligible_participants(db, founder_a)
    target_ids = {u.id for u in targets}

    # Founder A sees Company A members + Super Admin
    assert USER_SUPERADMIN_ID in target_ids
    assert USER_DH_A_ID in target_ids
    assert USER_MANAGER_A_ID in target_ids
    assert USER_EMPLOYEE_A1_ID in target_ids
    # Does NOT see Company B
    assert USER_FOUNDER_B_ID not in target_ids
    assert USER_EMPLOYEE_B_ID not in target_ids


@pytest.mark.asyncio
async def test_dropdown_targets_dh_manager_employee_no_superadmin_no_company_b(user_roster):
    dh_a = user_roster[USER_DH_A_ID]
    company_a_only = {
        uid: u for uid, u in user_roster.items()
        if u.company_id == COMPANY_A_ID and u.role != "Super Admin"
    }
    db = FakeAsyncSession(users_dict=company_a_only)

    targets = await meeting_service.get_eligible_participants(db, dh_a)
    target_ids = {u.id for u in targets}

    # Sees Company A Founder, Manager, Employee
    assert USER_FOUNDER_A_ID in target_ids
    assert USER_MANAGER_A_ID in target_ids
    assert USER_EMPLOYEE_A1_ID in target_ids
    # NEVER sees Super Admin
    assert USER_SUPERADMIN_ID not in target_ids
    # NEVER sees Company B
    assert USER_FOUNDER_B_ID not in target_ids


# ==============================================================================
# 8. APPROVAL / REJECTION STATE MACHINE & NOTIFICATIONS
# ==============================================================================
@pytest.mark.asyncio
async def test_approval_process_and_self_approval_blocked(user_roster):
    emp = user_roster[USER_EMPLOYEE_A1_ID]
    mgr = user_roster[USER_MANAGER_A_ID]

    meeting = Meeting(
        id=uuid.uuid4(),
        title="Project Kickoff",
        organizer_id=emp.id,
        company_id=COMPANY_A_ID,
        status="Pending_Approval",
    )
    participant = MeetingParticipant(meeting_id=meeting.id, user_id=emp.id, role="organizer", status="accepted")
    meeting.participants = [participant]

    approval = MeetingApproval(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        requester_id=emp.id,
        approver_id=mgr.id,
        status="Pending",
    )
    approval.meeting = meeting

    db = FakeAsyncSession(
        meetings_dict={meeting.id: meeting},
        approvals_dict={approval.id: approval},
    )

    # 1. Requester cannot self-approve -> 403
    with pytest.raises(HTTPException) as exc:
        await meeting_service.process_approval(db, approval.id, emp, "Approved")
    assert exc.value.status_code == 403

    # 2. Designated Manager approves -> Success, meeting becomes Scheduled
    res = await meeting_service.process_approval(db, approval.id, mgr, "Approved")
    assert res["status"] == "Approved"
    assert meeting.status == "Scheduled"
    assert approval.status == "Approved"
    # In-app notification generated for requester
    notif = next(x for x in db.added if isinstance(x, InAppNotification))
    assert notif.user_id == emp.id
    assert notif.type == "meeting_approved"


@pytest.mark.asyncio
async def test_rejection_process_success(user_roster):
    emp = user_roster[USER_EMPLOYEE_A1_ID]
    mgr = user_roster[USER_MANAGER_A_ID]

    meeting = Meeting(
        id=uuid.uuid4(),
        title="Overtime Request",
        organizer_id=emp.id,
        company_id=COMPANY_A_ID,
        status="Pending_Approval",
    )
    meeting.participants = []

    approval = MeetingApproval(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        requester_id=emp.id,
        approver_id=mgr.id,
        status="Pending",
    )
    approval.meeting = meeting

    db = FakeAsyncSession(
        meetings_dict={meeting.id: meeting},
        approvals_dict={approval.id: approval},
    )

    res = await meeting_service.process_approval(db, approval.id, mgr, "Rejected", reason="Capacity constraint")
    assert res["status"] == "Rejected"
    assert meeting.status == "Rejected"
    assert approval.status == "Rejected"
    assert approval.decision_reason == "Capacity constraint"


# ==============================================================================
# 9. CANCELLATION HIERARCHY RULES
# ==============================================================================
@pytest.mark.asyncio
async def test_cancellation_hierarchy_enforcement(user_roster):
    founder = user_roster[USER_FOUNDER_A_ID]
    dh = user_roster[USER_DH_A_ID]
    mgr = user_roster[USER_MANAGER_A_ID]
    emp = user_roster[USER_EMPLOYEE_A1_ID]

    # Meeting organized by Founder with Employee participating
    exec_meeting = Meeting(
        id=uuid.uuid4(),
        title="Executive Strategy",
        organizer_id=founder.id,
        company_id=COMPANY_A_ID,
        status="Scheduled",
    )
    exec_meeting.organizer = founder
    exec_meeting.participants = [
        MeetingParticipant(meeting_id=exec_meeting.id, user_id=founder.id, role="organizer", status="accepted"),
        MeetingParticipant(meeting_id=exec_meeting.id, user_id=emp.id, role="attendee", status="accepted"),
    ]
    exec_meeting.participants[0].user = founder
    exec_meeting.participants[1].user = emp

    db = FakeAsyncSession(meetings_dict={exec_meeting.id: exec_meeting})

    # Employee CANNOT cancel meeting involving Founder -> 403
    with pytest.raises(HTTPException) as exc:
        await meeting_service.cancel_meeting(db, exec_meeting.id, emp)
    assert exc.value.status_code == 403

    # DH CANNOT cancel meeting involving Founder -> 403
    with pytest.raises(HTTPException) as exc:
        await meeting_service.cancel_meeting(db, exec_meeting.id, dh)
    assert exc.value.status_code == 403

    # Founder CAN cancel meeting -> 200 Success
    res = await meeting_service.cancel_meeting(db, exec_meeting.id, founder)
    assert res.status == "Cancelled"


@pytest.mark.asyncio
async def test_employee_can_cancel_own_peer_meeting(user_roster):
    emp1 = user_roster[USER_EMPLOYEE_A1_ID]
    emp2 = user_roster[USER_EMPLOYEE_A2_ID]

    peer_meeting = Meeting(
        id=uuid.uuid4(),
        title="Peer Coffee Chat",
        organizer_id=emp1.id,
        company_id=COMPANY_A_ID,
        status="Scheduled",
    )
    peer_meeting.organizer = emp1
    peer_meeting.participants = [
        MeetingParticipant(meeting_id=peer_meeting.id, user_id=emp1.id, role="organizer", status="accepted"),
        MeetingParticipant(meeting_id=peer_meeting.id, user_id=emp2.id, role="attendee", status="accepted"),
    ]
    peer_meeting.participants[0].user = emp1
    peer_meeting.participants[1].user = emp2

    db = FakeAsyncSession(meetings_dict={peer_meeting.id: peer_meeting})

    # Employee can cancel their own meeting with peers
    res = await meeting_service.cancel_meeting(db, peer_meeting.id, emp1)
    assert res.status == "Cancelled"


# ==============================================================================
# 10. NON-BLOCKING PUSH DELIVERY (FAILURE DOES NOT ROLL BACK MEETING)
# ==============================================================================
@pytest.mark.asyncio
async def test_push_failure_does_not_fail_meeting_creation(user_roster):
    emp1 = user_roster[USER_EMPLOYEE_A1_ID]
    emp2 = user_roster[USER_EMPLOYEE_A2_ID]
    db = FakeAsyncSession(users_dict=user_roster)

    req = MeetingCreate(
        title="Network Resilient Sync",
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        participant_ids=[emp2.id],
    )

    with patch("app.services.push_service.push_service.send_to_user", side_effect=Exception("FCM Gateway Timeout")):
        # Meeting creation must succeed without raising exception despite push failure
        meeting = await meeting_service.create_meeting(db, emp1, req)
        assert meeting.status == "Scheduled"
        assert meeting.title == "Network Resilient Sync"
