import { User } from '../../types';

export interface ApprovalStep {
  approverId: string;
  approverRole: 'Manager' | 'Department Head' | 'Founder';
  approverName: string;
  sequenceOrder: number;
  status: 'Pending' | 'Waiting' | 'Approved' | 'Rejected';
}

export interface MeetingPermissionResult {
  requiresApproval: boolean;
  approvalSteps: ApprovalStep[];
  reason?: string;
}

export class MeetingPolicyService {
  /**
   * Returns list of eligible users the organizer is allowed to select.
   */
  static getEligibleParticipants(
    organizer: User,
    allUsers: User[]
  ): { eligibleUsers: User[]; canSelectEveryone: boolean; everyoneScopeLabel: string } {
    const isFounder = organizer.role === 'Founder';
    const isSuperAdmin = organizer.role === 'Super Admin';
    const isDeptHead = organizer.role === 'Department Head';
    const isManager = organizer.role === 'Manager';
    const isEmployee = organizer.role === 'Employee';

    // Exclude organizer themselves
    const candidateUsers = allUsers.filter(u => u.id !== organizer.id && u.is_approved !== false);

    if (isFounder || isSuperAdmin) {
      return {
        eligibleUsers: candidateUsers,
        canSelectEveryone: true,
        everyoneScopeLabel: 'All Organization Members',
      };
    }

    if (isDeptHead) {
      const myDeptId = organizer.department_id;
      const eligible = candidateUsers.filter(u => 
        u.department_id === myDeptId || u.role === 'Founder' || u.role === 'Department Head'
      );
      return {
        eligibleUsers: eligible,
        canSelectEveryone: true,
        everyoneScopeLabel: 'All Department Members',
      };
    }

    if (isManager) {
      const myDeptId = organizer.department_id;
      const eligible = candidateUsers.filter(u => 
        u.department_id === myDeptId || u.role === 'Founder' || u.role === 'Department Head'
      );
      return {
        eligibleUsers: eligible,
        canSelectEveryone: false,
        everyoneScopeLabel: '',
      };
    }

    // Employee: can select Manager, Department Head, Founder, or teammates
    if (isEmployee) {
      const myDeptId = organizer.department_id;
      const eligible = candidateUsers.filter(u => 
        u.department_id === myDeptId || u.role === 'Founder'
      );
      return {
        eligibleUsers: eligible,
        canSelectEveryone: false,
        everyoneScopeLabel: '',
      };
    }

    return {
      eligibleUsers: candidateUsers,
      canSelectEveryone: false,
      everyoneScopeLabel: '',
    };
  }

  /**
   * Computes whether a meeting requires sequential approvals and generates the exact approval chain.
   */
  static determineApprovalChain(
    organizer: User,
    selectedParticipants: User[],
    allUsers: User[]
  ): MeetingPermissionResult {
    const orgRole = organizer.role;

    // 1. Founder & Super Admin never require approval
    if (orgRole === 'Founder' || orgRole === 'Super Admin') {
      return { requiresApproval: false, approvalSteps: [] };
    }

    // 2. Department Head directly confirms within scope
    if (orgRole === 'Department Head') {
      return { requiresApproval: false, approvalSteps: [] };
    }

    // 3. Manager directly confirms within scope
    if (orgRole === 'Manager') {
      return { requiresApproval: false, approvalSteps: [] };
    }

    // 4. Employee & Non-Executive Rules
    if (orgRole === 'Employee' || orgRole === 'Execution Team') {
      const approvalSteps: ApprovalStep[] = [];
      let stepIndex = 1;

      // Find organizer's direct Manager or invited Manager
      const invitedManager = selectedParticipants.find(u => u.role === 'Manager');
      const deptManager = allUsers.find(
        u => u.role === 'Manager' && u.department_id === organizer.department_id
      ) || invitedManager;

      // Step 1: Manager approval
      if (deptManager && deptManager.id !== organizer.id) {
        approvalSteps.push({
          approverId: deptManager.id,
          approverRole: 'Manager',
          approverName: deptManager.full_name || 'Department Manager',
          sequenceOrder: stepIndex,
          status: stepIndex === 1 ? 'Pending' : 'Waiting',
        });
        stepIndex++;
      }

      // Find organizer's Department Head or invited Dept Head
      const invitedDeptHead = selectedParticipants.find(u => u.role === 'Department Head');
      const deptHead = allUsers.find(
        u => u.role === 'Department Head' && u.department_id === organizer.department_id
      ) || invitedDeptHead;

      // Step 2: Department Head approval
      if (deptHead && deptHead.id !== organizer.id && deptHead.id !== deptManager?.id) {
        approvalSteps.push({
          approverId: deptHead.id,
          approverRole: 'Department Head',
          approverName: deptHead.full_name || 'Department Head',
          sequenceOrder: stepIndex,
          status: stepIndex === 1 ? 'Pending' : 'Waiting',
        });
        stepIndex++;
      }

      // Step 3: Founder approval (if Founder is invited)
      const invitedFounder = selectedParticipants.find(u => u.role === 'Founder' || u.role === 'Super Admin');
      const founderUser = allUsers.find(u => u.role === 'Founder' || u.role === 'Super Admin') || invitedFounder;

      if (invitedFounder && founderUser && founderUser.id !== organizer.id && founderUser.id !== deptHead?.id) {
        approvalSteps.push({
          approverId: founderUser.id,
          approverRole: 'Founder',
          approverName: founderUser.full_name || 'Founder',
          sequenceOrder: stepIndex,
          status: stepIndex === 1 ? 'Pending' : 'Waiting',
        });
      }

      // Fallback: If no manager or dept head found, route to Founder/SuperAdmin
      if (approvalSteps.length === 0 && founderUser && founderUser.id !== organizer.id) {
        approvalSteps.push({
          approverId: founderUser.id,
          approverRole: 'Founder',
          approverName: founderUser.full_name || 'Founder',
          sequenceOrder: 1,
          status: 'Pending',
        });
      }

      if (approvalSteps.length > 0) {
        return {
          requiresApproval: true,
          approvalSteps,
          reason: 'Employee meeting requests require management approval.',
        };
      }
    }

    return { requiresApproval: false, approvalSteps: [] };
  }

  /**
   * Checks if user can edit or reschedule a meeting.
   */
  static canEditMeeting(user: User, meeting: any): boolean {
    if (meeting.is_private && meeting.organizer_id !== user.id) return false;
    if (user.role === 'Founder') return true;
    if (user.role === 'Super Admin') return true;
    if (meeting.organizer_id === user.id) return true;
    return false;
  }

  /**
   * Checks if user can cancel a meeting.
   */
  static canCancelMeeting(user: User, meeting: any): boolean {
    if (meeting.is_private && meeting.organizer_id !== user.id) return false;
    if (user.role === 'Founder') return true;
    if (user.role === 'Super Admin') return true;
    if (meeting.organizer_id === user.id) return true;
    if (user.role === 'Department Head' && meeting.department_id === user.department_id) return true;
    return false;
  }
}
