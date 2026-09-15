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
   * Uses candidate users provided by the backend eligible-participants endpoint.
   */
  static getEligibleParticipants(
    organizer: User,
    allUsers: User[]
  ): { eligibleUsers: User[]; canSelectEveryone: boolean; everyoneScopeLabel: string } {
    const isFounder = organizer.role === 'Founder';
    const isSuperAdmin = organizer.role === 'Super Admin';

    // Exclude organizer themselves
    const candidateUsers = allUsers.filter(u => u.id !== organizer.id && (u as any).is_active !== false);

    return {
      eligibleUsers: candidateUsers,
      canSelectEveryone: isFounder || isSuperAdmin,
      everyoneScopeLabel: isFounder || isSuperAdmin ? 'All Organization Members' : '',
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

    // 1. Super Admin never requires approval
    if (orgRole === 'Super Admin') {
      return { requiresApproval: false, approvalSteps: [] };
    }

    // 2. Founder scheduling
    if (orgRole === 'Founder') {
      const saTarget = selectedParticipants.find(u => u.role === 'Super Admin');
      if (saTarget) {
        return {
          requiresApproval: true,
          approvalSteps: [{
            approverId: saTarget.id,
            approverRole: 'Founder', // Platform Super Admin approver
            approverName: saTarget.full_name || 'Super Admin',
            sequenceOrder: 1,
            status: 'Pending',
          }],
          reason: 'Meetings with Super Admin require Super Admin approval.',
        };
      }
      return { requiresApproval: false, approvalSteps: [] };
    }

    // 3. Department Head scheduling
    if (orgRole === 'Department Head') {
      const founderTarget = selectedParticipants.find(u => u.role === 'Founder');
      if (founderTarget) {
        return {
          requiresApproval: true,
          approvalSteps: [{
            approverId: founderTarget.id,
            approverRole: 'Founder',
            approverName: founderTarget.full_name || 'Founder',
            sequenceOrder: 1,
            status: 'Pending',
          }],
          reason: 'Meetings with Founder require Founder approval.',
        };
      }
      return { requiresApproval: false, approvalSteps: [] };
    }

    // 4. Manager scheduling
    if (orgRole === 'Manager') {
      const founderTarget = selectedParticipants.find(u => u.role === 'Founder');
      if (founderTarget) {
        return {
          requiresApproval: true,
          approvalSteps: [{
            approverId: founderTarget.id,
            approverRole: 'Founder',
            approverName: founderTarget.full_name || 'Founder',
            sequenceOrder: 1,
            status: 'Pending',
          }],
          reason: 'Meetings with Founder require Founder approval.',
        };
      }
      const dhTarget = selectedParticipants.find(u => u.role === 'Department Head');
      if (dhTarget) {
        return {
          requiresApproval: true,
          approvalSteps: [{
            approverId: dhTarget.id,
            approverRole: 'Department Head',
            approverName: dhTarget.full_name || 'Department Head',
            sequenceOrder: 1,
            status: 'Pending',
          }],
          reason: 'Meetings with Department Head require Department Head approval.',
        };
      }
      // Manager -> Manager or Manager -> Employee requires no approval
      return { requiresApproval: false, approvalSteps: [] };
    }

    // 5. Employee scheduling
    if (orgRole === 'Employee' || orgRole === 'Execution Team') {
      const founderTarget = selectedParticipants.find(u => u.role === 'Founder');
      if (founderTarget) {
        return {
          requiresApproval: true,
          approvalSteps: [{
            approverId: founderTarget.id,
            approverRole: 'Founder',
            approverName: founderTarget.full_name || 'Founder',
            sequenceOrder: 1,
            status: 'Pending',
          }],
          reason: 'Meetings with Founder require Founder approval.',
        };
      }
      const dhTarget = selectedParticipants.find(u => u.role === 'Department Head');
      if (dhTarget) {
        return {
          requiresApproval: true,
          approvalSteps: [{
            approverId: dhTarget.id,
            approverRole: 'Department Head',
            approverName: dhTarget.full_name || 'Department Head',
            sequenceOrder: 1,
            status: 'Pending',
          }],
          reason: 'Meetings with Department Head require Department Head approval.',
        };
      }
      const mgrTarget = selectedParticipants.find(u => u.role === 'Manager');
      if (mgrTarget) {
        return {
          requiresApproval: true,
          approvalSteps: [{
            approverId: mgrTarget.id,
            approverRole: 'Manager',
            approverName: mgrTarget.full_name || 'Manager',
            sequenceOrder: 1,
            status: 'Pending',
          }],
          reason: 'Meetings with Manager require Manager approval.',
        };
      }
      // Employee -> Employee requires no approval
      return { requiresApproval: false, approvalSteps: [] };
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
   * Checks if user can cancel a meeting based on role hierarchy.
   */
  static canCancelMeeting(user: User, meeting: any): boolean {
    if (!meeting || !user) return false;
    const userRole = user.role;
    if (userRole === 'Super Admin') return true;
    if (userRole === 'Founder') {
      return !user.company_id || meeting.company_id === user.company_id;
    }

    const participants: any[] = meeting.participants || meeting.meeting_participants || [];
    const participantRoles = participants.map((p: any) => p.user?.role || p.role).filter(Boolean);
    const hasSuperAdmin = meeting.organizer?.role === 'Super Admin' || participantRoles.includes('Super Admin');
    const hasFounder = meeting.organizer?.role === 'Founder' || participantRoles.includes('Founder');
    const hasDH = meeting.organizer?.role === 'Department Head' || participantRoles.includes('Department Head');
    const hasManager = meeting.organizer?.role === 'Manager' || participantRoles.includes('Manager');

    if (userRole === 'Department Head') {
      if (hasSuperAdmin || hasFounder) return false;
      return meeting.organizer_id === user.id || meeting.department_id === user.department_id;
    }

    if (userRole === 'Manager') {
      if (hasSuperAdmin || hasFounder || hasDH) return false;
      return meeting.organizer_id === user.id;
    }

    if (userRole === 'Employee') {
      if (hasSuperAdmin || hasFounder || hasDH || hasManager) return false;
      return meeting.organizer_id === user.id;
    }

    return false;
  }
}
