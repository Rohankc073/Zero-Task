from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text, or_, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.meeting import Meeting, MeetingParticipant, MeetingApproval
from app.models.user import User
from app.models.notification import InAppNotification
from app.services.push_service import push_service
from app.core.logging import logger
from app.schemas.meeting import MeetingCreate, MeetingUpdate


class MeetingService:
    @staticmethod
    async def get_eligible_participants(
        db: AsyncSession, current_user: User
    ) -> List[User]:
        """
        Authoritative list of users eligible for meeting scheduling based on caller role & company isolation:
        - Super Admin: All active users across all companies (and other Super Admins), excluding self.
        - Founder: Active users in same company + platform Super Admin accounts, excluding self.
        - Department Head, Manager, Employee: Active users in same company ONLY. NO Super Admin, NO other companies.
        """
        role = current_user.role
        company_id = current_user.company_id

        if role == "Super Admin":
            stmt = (
                select(User)
                .options(selectinload(User.company), selectinload(User.department), selectinload(User.designation))
                .where(
                    User.id != current_user.id,
                    User.is_deleted == False,
                    User.is_active == True,
                )
                .order_by(User.full_name.asc())
            )
        elif role == "Founder":
            # Same company users + Super Admin accounts
            stmt = (
                select(User)
                .options(selectinload(User.company), selectinload(User.department), selectinload(User.designation))
                .where(
                    User.id != current_user.id,
                    User.is_deleted == False,
                    User.is_active == True,
                    or_(
                        User.company_id == company_id,
                        User.role == "Super Admin",
                    ),
                )
                .order_by(User.full_name.asc())
            )
        else:
            # Department Head, Manager, Employee: Same company only, strictly NO Super Admin
            stmt = (
                select(User)
                .options(selectinload(User.company), selectinload(User.department), selectinload(User.designation))
                .where(
                    User.id != current_user.id,
                    User.is_deleted == False,
                    User.is_active == True,
                    User.company_id == company_id,
                    User.role != "Super Admin",
                )
                .order_by(User.full_name.asc())
            )

        res = await db.execute(stmt)
        users = list(res.scalars().all())
        for u in users:
            if not u.full_name:
                u.full_name = u.name or u.email.split("@")[0]
            if not u.name:
                u.name = u.full_name
        return users

    @staticmethod
    async def determine_approval(
        db: AsyncSession, current_user: User, targets: List[User]
    ) -> Tuple[bool, Optional[User]]:
        """
        Determines if approval is required and identifies the authoritative approver based on the exact matrix:
        - Super Admin -> Any: No approval
        - Founder -> Super Admin: Super Admin approval REQUIRED
        - Founder -> Founder / DH / Manager / Employee (same company): No approval
        - Department Head -> Super Admin: NOT PERMITTED (403)
        - Department Head -> Founder: Founder approval REQUIRED
        - Department Head -> DH / Manager / Employee: No approval
        - Manager -> Super Admin: NOT PERMITTED (403)
        - Manager -> Founder: Founder approval REQUIRED
        - Manager -> Department Head: DH approval REQUIRED
        - Manager -> Manager / Employee: No approval
        - Employee -> Super Admin: NOT PERMITTED (403)
        - Employee -> Founder: Founder approval REQUIRED
        - Employee -> Department Head: DH approval REQUIRED
        - Employee -> Manager: Manager approval REQUIRED
        - Employee -> Employee: No approval
        """
        req_role = current_user.role

        # 1. Super Admin requester never requires approval
        if req_role == "Super Admin":
            return False, None

        # 2. Check for disallowed Super Admin targets
        has_superadmin_target = any(t.role == "Super Admin" for t in targets)
        if has_superadmin_target:
            if req_role != "Founder":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"{req_role}s are not permitted to schedule meetings with Super Admin.",
                )
            # Founder -> Super Admin requires Super Admin approval
            sa_target = next(t for t in targets if t.role == "Super Admin")
            return True, sa_target

        # Founder -> Super Admin handled above. All internal company meetings by Founder require NO approval.
        if req_role == "Founder":
            return False, None

        # 3. Check for Founder targets
        has_founder_target = any(t.role == "Founder" for t in targets)
        if has_founder_target:
            # DH / Manager / Employee -> Founder requires Founder approval
            target_founder = next((t for t in targets if t.role == "Founder"), None)
            if not target_founder:
                # Find company founder
                f_stmt = select(User).where(
                    User.company_id == current_user.company_id,
                    User.role == "Founder",
                    User.is_deleted == False,
                    User.is_active == True,
                )
                f_res = await db.execute(f_stmt)
                target_founder = f_res.scalars().first()
            if not target_founder or target_founder.id == current_user.id:
                return False, None
            return True, target_founder

        # 4. Department Head requester: same-level or subordinate targets require NO approval
        if req_role == "Department Head":
            return False, None

        # 5. Check for Department Head targets (for Manager and Employee)
        has_dh_target = any(t.role == "Department Head" for t in targets)
        if has_dh_target:
            # Both Manager and Employee require DH approval
            target_dh = next((t for t in targets if t.role == "Department Head"), None)
            if not target_dh:
                # Find department head for requester's department or company
                dh_stmt = select(User).where(
                    User.company_id == current_user.company_id,
                    User.role == "Department Head",
                    User.department_id == current_user.department_id,
                    User.is_deleted == False,
                    User.is_active == True,
                )
                dh_res = await db.execute(dh_stmt)
                target_dh = dh_res.scalars().first()
                if not target_dh:
                    # Fallback to any DH in company
                    dh_stmt2 = select(User).where(
                        User.company_id == current_user.company_id,
                        User.role == "Department Head",
                        User.is_deleted == False,
                        User.is_active == True,
                    )
                    dh_res2 = await db.execute(dh_stmt2)
                    target_dh = dh_res2.scalars().first()
            if target_dh and target_dh.id != current_user.id:
                return True, target_dh
            return False, None

        # 6. Manager requester: same-level (Manager) or subordinate (Employee) require NO approval
        if req_role == "Manager":
            return False, None

        # 7. Employee requester checking for Manager targets
        has_manager_target = any(t.role == "Manager" for t in targets)
        if has_manager_target:
            target_mgr = next((t for t in targets if t.role == "Manager"), None)
            if not target_mgr:
                mgr_stmt = select(User).where(
                    User.company_id == current_user.company_id,
                    User.role == "Manager",
                    User.department_id == current_user.department_id,
                    User.is_deleted == False,
                    User.is_active == True,
                )
                mgr_res = await db.execute(mgr_stmt)
                target_mgr = mgr_res.scalars().first()
                if not target_mgr:
                    mgr_stmt2 = select(User).where(
                        User.company_id == current_user.company_id,
                        User.role == "Manager",
                        User.is_deleted == False,
                        User.is_active == True,
                    )
                    mgr_res2 = await db.execute(mgr_stmt2)
                    target_mgr = mgr_res2.scalars().first()
            if target_mgr and target_mgr.id != current_user.id:
                return True, target_mgr
            return False, None

        # 8. Employee -> Employee (same-level): explicitly allowed without approval
        return False, None

    @classmethod
    async def create_meeting(
        cls, db: AsyncSession, current_user: User, data: MeetingCreate
    ) -> Meeting:
        # Validate time
        if data.end_time <= data.start_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Meeting end time must be strictly after start time.",
            )

        if not data.title or not data.title.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Meeting title is required.",
            )

        # Sanitize participant IDs (deduplicate, exclude organizer)
        raw_ids = [UUID(str(pid)) for pid in (data.participant_ids or []) if str(pid) != str(current_user.id)]
        unique_pids = list(set(raw_ids))

        if not unique_pids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please select at least one participant.",
            )

        # Fetch and validate all invited participants from DB
        stmt = select(User).where(
            User.id.in_(unique_pids),
            User.is_deleted == False,
            User.is_active == True,
        )
        res = await db.execute(stmt)
        targets = list(res.scalars().all())

        if len(targets) != len(unique_pids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more requested participants could not be found or are inactive.",
            )

        # Company Isolation & Role Boundary Validation
        if current_user.role != "Super Admin":
            for target in targets:
                if target.role == "Super Admin":
                    if current_user.role != "Founder":
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"{current_user.role}s are not permitted to schedule meetings with Super Admin.",
                        )
                else:
                    if target.company_id != current_user.company_id:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cross-company meeting scheduling is strictly forbidden.",
                        )

        # Determine target company
        target_company_id = current_user.company_id
        if current_user.role == "Super Admin":
            target_company_id = data.company_id or targets[0].company_id or current_user.company_id

        if not target_company_id:
            # Fallback if superadmin creating with no company specified
            target_company_id = targets[0].company_id

        # Determine Approval Requirement & Approver
        requires_approval, approver = await cls.determine_approval(db, current_user, targets)
        initial_status = "Pending_Approval" if requires_approval else "Scheduled"

        # 1. Create Meeting Record
        new_meeting = Meeting(
            title=data.title.strip(),
            agenda=data.agenda.strip() if data.agenda else None,
            description=data.description.strip() if data.description else None,
            start_time=data.start_time,
            end_time=data.end_time,
            organizer_id=current_user.id,
            project_id=data.project_id,
            company_id=target_company_id,
            meeting_link=data.meeting_link.strip() if data.meeting_link else None,
            is_private=data.is_private,
            status=initial_status,
        )
        db.add(new_meeting)
        await db.flush()

        # 2. Add Organizer as accepted participant
        db.add(
            MeetingParticipant(
                meeting_id=new_meeting.id,
                user_id=current_user.id,
                role="organizer",
                status="accepted",
            )
        )

        # 3. Add Invited Attendees
        for target in targets:
            db.add(
                MeetingParticipant(
                    meeting_id=new_meeting.id,
                    user_id=target.id,
                    role="attendee",
                    status="pending" if requires_approval else "accepted",
                )
            )

        # 4. Add Approval Record if required
        if requires_approval and approver:
            approval_rec = MeetingApproval(
                meeting_id=new_meeting.id,
                requester_id=current_user.id,
                approver_id=approver.id,
                status="Pending",
            )
            db.add(approval_rec)

            # In-app notification to Approver
            db.add(
                InAppNotification(
                    user_id=approver.id,
                    title="Meeting Request for Approval",
                    message=f"{current_user.full_name or 'A team member'} requested a meeting: '{new_meeting.title}'. Your approval is required.",
                    type="meeting_approval_required",
                    action_url=f"/meeting/{new_meeting.id}",
                )
            )

            # In-app notification to Requester
            db.add(
                InAppNotification(
                    user_id=current_user.id,
                    title="Meeting Request Submitted",
                    message=f"Your meeting '{new_meeting.title}' has been submitted for management approval.",
                    type="meeting_approval_required",
                    action_url=f"/meeting/{new_meeting.id}",
                )
            )
        else:
            # Direct Confirmation: In-app notification to all participants
            for target in targets:
                db.add(
                    InAppNotification(
                        user_id=target.id,
                        title="New Meeting Scheduled",
                        message=f"{current_user.full_name or 'Organizer'} scheduled a meeting: '{new_meeting.title}'",
                        type="meeting_scheduled",
                        action_url=f"/meeting/{new_meeting.id}",
                    )
                )

        # Commit Authoritative DB Transaction
        await db.commit()
        await db.refresh(new_meeting)

        # 5. Non-blocking push notification dispatch (failure must NOT corrupt meeting creation)
        try:
            if requires_approval and approver:
                await push_service.send_to_user(
                    db=db,
                    user_id=approver.id,
                    title="Meeting Request for Approval",
                    body=f"{current_user.full_name or 'A team member'} requested a meeting: '{new_meeting.title}'",
                    data={
                        "action_url": f"/meeting/{new_meeting.id}",
                        "url": f"/meeting/{new_meeting.id}",
                        "type": "meeting",
                        "meeting_id": str(new_meeting.id),
                    },
                )
            else:
                for target in targets:
                    await push_service.send_to_user(
                        db=db,
                        user_id=target.id,
                        title="New Meeting Scheduled",
                        body=f"{current_user.full_name or 'Organizer'} scheduled a meeting: '{new_meeting.title}'",
                        data={
                            "action_url": f"/meeting/{new_meeting.id}",
                            "url": f"/meeting/{new_meeting.id}",
                            "type": "meeting",
                            "meeting_id": str(new_meeting.id),
                        },
                    )
        except Exception as pe:
            logger.warning(f"Non-critical push notification dispatch failed for meeting: {pe}")

        return new_meeting

    @staticmethod
    async def process_approval(
        db: AsyncSession,
        identifier: UUID,
        current_user: User,
        action: str,
        reason: Optional[str] = None,
        new_start_time: Optional[datetime] = None,
        new_end_time: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Processes approval, rejection, postponement, or preponement for a meeting request.
        `identifier` can be either the approval_id or the meeting_id.
        """
        # Find approval record
        stmt = (
            select(MeetingApproval)
            .options(
                selectinload(MeetingApproval.meeting).selectinload(Meeting.participants),
                selectinload(MeetingApproval.meeting).selectinload(Meeting.organizer),
            )
            .where(
                or_(
                    MeetingApproval.id == identifier,
                    MeetingApproval.meeting_id == identifier,
                ),
                MeetingApproval.status == "Pending",
            )
        )
        res = await db.execute(stmt)
        approval = res.scalar_one_or_none()

        if not approval:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pending meeting approval request not found.",
            )

        meeting = approval.meeting
        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated meeting not found.",
            )

        # Authorization: Requester cannot self-approve
        if current_user.id == approval.requester_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requesters are not permitted to approve their own meeting requests.",
            )

        # Authorization: Must be assigned approver, Super Admin, company Founder, or invited DH/Manager
        is_assigned_approver = current_user.id == approval.approver_id
        is_super_admin = current_user.role == "Super Admin"
        is_company_founder = current_user.role == "Founder" and meeting.company_id == current_user.company_id
        is_company_dh = (
            current_user.role == "Department Head"
            and meeting.company_id == current_user.company_id
            and any(p.user_id == current_user.id for p in meeting.participants)
        )
        is_company_manager = (
            current_user.role == "Manager"
            and meeting.company_id == current_user.company_id
            and any(p.user_id == current_user.id for p in meeting.participants)
        )

        if not (is_assigned_approver or is_super_admin or is_company_founder or is_company_dh or is_company_manager):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have authorization to process this meeting approval.",
            )

        act_lower = (action or "").lower().strip()
        if act_lower in ["approved", "approve"]:
            clean_action = "Approved"
        elif act_lower in ["rejected", "reject", "decline", "declined"]:
            clean_action = "Rejected"
        elif act_lower in ["postponed", "postpone"]:
            clean_action = "Postponed"
        elif act_lower in ["preponed", "prepone"]:
            clean_action = "Preponed"
        else:
            clean_action = "Approved"

        if clean_action in ["Postponed", "Preponed"]:
            if not new_start_time or not new_end_time:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Both new start time and end time are required to {clean_action.lower()} a meeting.",
                )
            if new_end_time <= new_start_time:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="New meeting end time must be after new start time.",
                )
            meeting.start_time = new_start_time
            meeting.end_time = new_end_time
            meeting.status = "Scheduled"
            approval.status = "Approved"
            reschedule_note = f"Meeting {clean_action.lower()} by {current_user.full_name or current_user.role}."
            approval.decision_reason = f"{reschedule_note} Reason: {reason}" if reason else reschedule_note

            # Update participants status to accepted
            for p in meeting.participants:
                p.status = "accepted"

            # In-app notification to requester
            start_str = new_start_time.strftime("%b %d, %H:%M")
            db.add(
                InAppNotification(
                    user_id=approval.requester_id,
                    title=f"Meeting {clean_action}",
                    message=f"Your meeting '{meeting.title}' has been {clean_action.lower()} to {start_str} by {current_user.full_name or current_user.role}.",
                    type="meeting_scheduled",
                    action_url=f"/meeting/{meeting.id}",
                )
            )

            # In-app notification to all participants
            for p in meeting.participants:
                if p.user_id != approval.requester_id and p.user_id != current_user.id:
                    db.add(
                        InAppNotification(
                            user_id=p.user_id,
                            title=f"Meeting {clean_action}",
                            message=f"Meeting '{meeting.title}' has been {clean_action.lower()} to {start_str}.",
                            type="meeting_scheduled",
                            action_url=f"/meeting/{meeting.id}",
                        )
                    )
        elif clean_action == "Approved":
            meeting.status = "Scheduled"
            approval.status = "Approved"
            approval.decision_reason = reason

            # Update participants status to accepted
            for p in meeting.participants:
                p.status = "accepted"

            # In-app notification to requester
            db.add(
                InAppNotification(
                    user_id=approval.requester_id,
                    title="Meeting Approved",
                    message=f"Your meeting request '{meeting.title}' has been approved.",
                    type="meeting_approved",
                    action_url=f"/meeting/{meeting.id}",
                )
            )

            # In-app notification to all participants
            for p in meeting.participants:
                if p.user_id != approval.requester_id and p.user_id != current_user.id:
                    db.add(
                        InAppNotification(
                            user_id=p.user_id,
                            title="Meeting Confirmed",
                            message=f"Meeting '{meeting.title}' has been confirmed.",
                            type="meeting_scheduled",
                            action_url=f"/meeting/{meeting.id}",
                        )
                    )
        else:
            meeting.status = "Rejected"
            approval.status = "Rejected"
            approval.decision_reason = reason
            reason_text = f" Reason: {reason}" if reason else ""
            db.add(
                InAppNotification(
                    user_id=approval.requester_id,
                    title="Meeting Request Declined",
                    message=f"Your meeting request '{meeting.title}' was declined.{reason_text}",
                    type="meeting_rejected",
                    action_url=f"/meeting/{meeting.id}",
                )
            )

        await db.commit()

        # Non-blocking push notification
        try:
            target_uid = approval.requester_id
            await push_service.send_to_user(
                db=db,
                user_id=target_uid,
                title=f"Meeting {clean_action}",
                body=f"Your meeting '{meeting.title}' has been {clean_action.lower()}.",
                data={
                    "action_url": f"/meeting/{meeting.id}",
                    "url": f"/meeting/{meeting.id}",
                    "type": "meeting",
                    "meeting_id": str(meeting.id),
                },
            )
        except Exception as pe:
            logger.warning(f"Non-critical push notification dispatch failed: {pe}")

        return {
            "status": "success",
            "action": clean_action,
            "meeting_id": str(meeting.id),
            "approval_id": str(approval.id),
            "message": f"Meeting request has been {clean_action.lower()}.",
        }

    @staticmethod
    async def cancel_meeting(
        db: AsyncSession, meeting_id: UUID, current_user: User
    ) -> Meeting:
        """
        Authoritatively cancels a meeting while enforcing hierarchy rules:
        - Super Admin: can cancel any meeting.
        - Founder: can cancel any meeting in their company.
        - Department Head: can cancel if organizer, OR if within department without Founder/Super Admin.
        - Manager: can cancel if organizer AND no DH, Founder, or Super Admin is involved.
        - Employee: can cancel ONLY if organizer AND all participants are Employees.
        - Junior participants CANNOT unilaterally cancel a senior's meeting.
        """
        stmt = (
            select(Meeting)
            .options(
                selectinload(Meeting.organizer),
                selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
            )
            .where(Meeting.id == meeting_id)
        )
        res = await db.execute(stmt)
        meeting = res.scalar_one_or_none()

        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found.",
            )

        # Company boundary check
        if current_user.role != "Super Admin" and meeting.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-company access violation.",
            )

        # State check
        if meeting.status in ["Completed", "Cancelled", "Rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel a meeting that is already {meeting.status.lower()}.",
            )

        # Determine all participant roles
        participant_roles = [p.user.role for p in meeting.participants if p.user]
        organizer_role = meeting.organizer.role if meeting.organizer else "Employee"
        all_involved_roles = set(participant_roles + [organizer_role])

        user_role = current_user.role
        is_organizer = current_user.id == meeting.organizer_id

        # Authorization hierarchy enforcement
        has_authority = False

        if user_role == "Super Admin":
            has_authority = True
        elif user_role == "Founder":
            has_authority = True
        elif user_role == "Department Head":
            # DH can cancel if organizer, or if within their department, provided NO Founder/Super Admin is involved
            if "Founder" not in all_involved_roles and "Super Admin" not in all_involved_roles:
                if is_organizer or (meeting.organizer and meeting.organizer.department_id == current_user.department_id):
                    has_authority = True
        elif user_role == "Manager":
            # Manager can cancel ONLY if organizer, and NO DH, Founder, or Super Admin is involved
            if is_organizer and not any(r in ["Department Head", "Founder", "Super Admin"] for r in all_involved_roles):
                has_authority = True
        elif user_role == "Employee":
            # Employee can cancel ONLY if organizer and only other Employees are participating
            if is_organizer and all(r == "Employee" for r in all_involved_roles):
                has_authority = True

        if not has_authority:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have cancellation authority for this meeting under hierarchy rules.",
            )

        meeting.status = "Cancelled"

        # Notify all participants
        for p in meeting.participants:
            if p.user_id != current_user.id:
                db.add(
                    InAppNotification(
                        user_id=p.user_id,
                        title="Meeting Cancelled",
                        message=f"{current_user.full_name or 'Organizer'} cancelled the meeting: '{meeting.title}'.",
                        type="meeting_cancelled",
                        action_url=f"/meeting/{meeting.id}",
                    )
                )

        # Also notify organizer if someone else cancelled (e.g. Founder cancelled Employee's meeting)
        if not is_organizer and meeting.organizer_id != current_user.id:
            db.add(
                InAppNotification(
                    user_id=meeting.organizer_id,
                    title="Meeting Cancelled",
                    message=f"{current_user.full_name or 'Leadership'} cancelled your meeting: '{meeting.title}'.",
                    type="meeting_cancelled",
                    action_url=f"/meeting/{meeting.id}",
                )
            )

        await db.commit()
        await db.refresh(meeting)

        # Push notification
        try:
            for p in meeting.participants:
                if p.user_id != current_user.id:
                    await push_service.send_to_user(
                        db=db,
                        user_id=p.user_id,
                        title="Meeting Cancelled",
                        body=f"{current_user.full_name or 'Organizer'} cancelled the meeting: '{meeting.title}'.",
                        data={
                            "action_url": f"/meeting/{meeting.id}",
                            "type": "meeting",
                            "meeting_id": str(meeting.id),
                        },
                    )
        except Exception as pe:
            logger.warning(f"Push notification failed for meeting cancellation: {pe}")

        return meeting

    @staticmethod
    async def cleanup_completed_meetings(db: AsyncSession) -> int:
        """Marks past meetings as Completed."""
        try:
            await db.execute(text("SELECT public.cleanup_and_complete_meetings()"))
            await db.commit()
            return 1
        except Exception:
            await db.rollback()
            stmt = (
                update(Meeting)
                .where(Meeting.end_time < datetime.now(timezone.utc), Meeting.status == "Scheduled")
                .values(status="Completed")
            )
            res = await db.execute(stmt)
            await db.commit()
            return res.rowcount


meeting_service = MeetingService()
