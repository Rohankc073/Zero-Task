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
    const isDeptHead = organizer.role === 'Department Head';
    const isManager = organizer.role === 'Manager';
    const isEmployee = organizer.role === 'Employee';

    // Exclude organizer themselves
    const candidateUsers = allUsers.filter(u => u.id !== organizer.id && u.is_approved !== false);

    if (isFounder) {
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

    // 1. Founder never requires approval
    if (orgRole === 'Founder') {
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

    // 4. Employee Rules
    if (orgRole === 'Employee') {
      const hasFounder = selectedParticipants.some(u => u.role === 'Founder');
      const hasDeptHead = selectedParticipants.some(u => u.role === 'Department Head');
      const hasManager = selectedParticipants.some(u => u.role === 'Manager');

      // If only teammates or manager: directly scheduled
      if (!hasFounder && !hasDeptHead) {
        return { requiresApproval: false, approvalSteps: [] };
      }

      // Find organizer's direct Manager in same department
      const deptManager = allUsers.find(
        u => u.role === 'Manager' && u.department_id === organizer.department_id
      );

      // Find organizer's Department Head
      const deptHead = allUsers.find(
        u => u.role === 'Department Head' && u.department_id === organizer.department_id
      );

      // Find Founder
      const founderUser = allUsers.find(u => u.role === 'Founder');

      const approvalSteps: ApprovalStep[] = [];
      let stepIndex = 1;

      // Step 1: Manager approval is ALWAYS mandatory for Employee escalations
      if (deptManager) {
        approvalSteps.push({
          approverId: deptManager.id,
          approverRole: 'Manager',
          approverName: deptManager.full_name || 'Department Manager',
          sequenceOrder: stepIndex,
          status: stepIndex === 1 ? 'Pending' : 'Waiting',
        });
        stepIndex++;
      }

      // Step 2: Department Head approval (if Dept Head is invited or if escalations require it)
      if (hasDeptHead && deptHead && deptHead.id !== deptManager?.id) {
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
      if (hasFounder && founderUser) {
        approvalSteps.push({
          approverId: founderUser.id,
          approverRole: 'Founder',
          approverName: founderUser.full_name || 'Founder',
          sequenceOrder: stepIndex,
          status: stepIndex === 1 ? 'Pending' : 'Waiting',
        });
      }

      if (approvalSteps.length > 0) {
        return {
          requiresApproval: true,
          approvalSteps,
          reason: 'Meetings with higher leadership require sequential hierarchical approval.',
        };
      }
    }

    return { requiresApproval: false, approvalSteps: [] };
  }

  /**
   * Checks if user can edit or reschedule a meeting.
   */
  static canEditMeeting(user: User, meeting: any): boolean {
    if (user.role === 'Founder') return true;
    if (meeting.organizer_id === user.id) return true;
    return false;
  }

  /**
   * Checks if user can cancel a meeting.
   */
  static canCancelMeeting(user: User, meeting: any): boolean {
    if (user.role === 'Founder') return true;
    if (meeting.organizer_id === user.id) return true;
    if (user.role === 'Department Head' && meeting.department_id === user.department_id) return true;
    return false;
  }
}
