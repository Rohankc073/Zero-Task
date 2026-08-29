import { User, Task, Meeting, UserRole } from '../types';

/**
 * Centralized Permission Policy Engine for ZeroTask
 * Strictly enforces organizational hierarchy, operational access, and Founder privacy protections.
 */

// ── Role Identifier Helpers ──────────────────────────────────────────

export function isFounder(profile?: User | null): boolean {
  return profile?.role === 'Founder';
}

export function isSuperAdmin(profile?: User | null): boolean {
  return profile?.role === 'Super Admin';
}

export function isExecutiveOrAdmin(profile?: User | null): boolean {
  return profile?.role === 'Founder' || profile?.role === 'Super Admin';
}

export function isDepartmentHead(profile?: User | null): boolean {
  return profile?.role === 'Department Head';
}

export function isManager(profile?: User | null): boolean {
  return profile?.role === 'Manager';
}

export function isEmployee(profile?: User | null): boolean {
  return profile?.role === 'Employee';
}

export function isManagement(profile?: User | null): boolean {
  return (
    profile?.role === 'Founder' ||
    profile?.role === 'Super Admin' ||
    profile?.role === 'Department Head' ||
    profile?.role === 'Manager'
  );
}

// ── User Management & Protection Policies ────────────────────────────

export function canAccessTeamAndAccess(profile?: User | null): boolean {
  return isExecutiveOrAdmin(profile);
}

export function canCreateUser(actorProfile?: User | null, targetRole?: UserRole): boolean {
  if (!actorProfile) return false;
  if (isSuperAdmin(actorProfile)) return true;
  if (isFounder(actorProfile)) return targetRole !== 'Super Admin';
  return false;
}

export function canEditTargetUser(actorProfile?: User | null, targetUser?: User | null): boolean {
  if (!actorProfile || !targetUser) return false;
  if (isSuperAdmin(actorProfile)) return true;
  if (isFounder(actorProfile)) return targetUser.role !== 'Super Admin';
  return false;
}

export function canDeleteTargetUser(actorProfile?: User | null, targetUser?: User | null): boolean {
  if (!actorProfile || !targetUser) return false;
  if (actorProfile.id === targetUser.id) return false; // Cannot delete self
  if (isSuperAdmin(actorProfile)) return true;
  if (isFounder(actorProfile)) return targetUser.role !== 'Super Admin';
  return false;
}

export function canResetTargetUserPassword(actorProfile?: User | null, targetUser?: User | null): boolean {
  if (!actorProfile || !targetUser) return false;
  if (isSuperAdmin(actorProfile)) return true;
  if (isFounder(actorProfile)) return targetUser.role !== 'Super Admin';
  return false;
}

export function canDeactivateTargetUser(actorProfile?: User | null, targetUser?: User | null): boolean {
  if (!actorProfile || !targetUser) return false;
  if (actorProfile.id === targetUser.id) return false;
  if (isSuperAdmin(actorProfile)) return true;
  if (isFounder(actorProfile)) return targetUser.role !== 'Super Admin';
  return false;
}

// ── Task Operational & Privacy Policies ──────────────────────────────

export function isFounderPrivateTask(task?: Task | null): boolean {
  if (!task) return false;
  return Boolean(task.is_private && task.creator?.role === 'Founder');
}

export function canViewTask(profile?: User | null, task?: Task | null): boolean {
  if (!profile || !task) return false;
  if (isSuperAdmin(profile)) return true; // Super Admin has global operational access
  if (isFounder(profile)) return true; // Founder has global company access

  // Founder Privacy: Hide Founder private self-assigned tasks from all other roles
  if (task.is_private && task.created_by !== profile.id && task.creator?.role === 'Founder') {
    return false;
  }

  const isAssignee = (task as any).assignees?.some((a: any) => a.user?.id === profile.id || a.user_id === profile.id) || task.user_id === profile.id || task.assignee?.id === profile.id;
  const isCreator = task.created_by === profile.id;

  if (isAssignee || isCreator) return true;

  if (isDepartmentHead(profile) || isManager(profile)) {
    if (task.department_id && task.department_id === profile.department_id) {
      return true;
    }
  }

  return false;
}

export function canManageTask(profile?: User | null, task?: Task | null): boolean {
  if (!profile || !task) return false;
  if (isSuperAdmin(profile)) return true;
  if (isFounder(profile)) return true;

  // Founder Privacy Protection
  if (task.is_private && task.created_by !== profile.id && task.creator?.role === 'Founder') {
    return false;
  }

  const isCreator = task.created_by === profile.id;
  const isDeptHead = isDepartmentHead(profile) && task.department_id === profile.department_id;
  const isMgr = isManager(profile) && task.department_id === profile.department_id;

  return isCreator || isDeptHead || isMgr;
}

export function canDeleteTask(profile?: User | null, task?: Task | null): boolean {
  if (!profile || !task) return false;
  
  // Super Admin has global operational access across all companies
  if (isSuperAdmin(profile)) return true;

  // Founder of the workspace has global task administration within their company
  if (isFounder(profile)) return true;

  // Otherwise, ONLY the user who created the task is authorized to delete it
  return task.created_by === profile.id;
}

export function canSegregateTask(profile?: User | null, task?: Task | null): boolean {
  return canManageTask(profile, task);
}

// ── Meeting Operational & Privacy Policies ───────────────────────────

export function canViewMeeting(profile?: User | null, meeting?: Meeting | null): boolean {
  if (!profile || !meeting) return false;
  if (isFounder(profile)) return true;

  if (meeting.is_private && meeting.organizer_id !== profile.id) {
    return false;
  }

  if (isSuperAdmin(profile)) return true;

  return meeting.organizer_id === profile.id;
}

export function canManageMeeting(profile?: User | null, meeting?: Meeting | null): boolean {
  if (!profile || !meeting) return false;
  if (isFounder(profile)) return true;

  if (meeting.is_private && meeting.organizer_id !== profile.id) {
    return false;
  }

  if (isSuperAdmin(profile)) return true;

  return meeting.organizer_id === profile.id;
}

// ── Feature & Screen Access Policies ─────────────────────────────────

export function canAccessReports(profile?: User | null): boolean {
  return isManagement(profile);
}

export function canAccessAuditLogs(profile?: User | null): boolean {
  return isExecutiveOrAdmin(profile);
}

export function canAccessExecutionPortal(profile?: User | null): boolean {
  return isExecutiveOrAdmin(profile) || profile?.role === 'Execution Team';
}

export function canAccessApprovals(profile?: User | null): boolean {
  return isManagement(profile);
}

export function canManageDepartments(profile?: User | null): boolean {
  return isExecutiveOrAdmin(profile);
}

export function canManageDesignations(profile?: User | null): boolean {
  return isExecutiveOrAdmin(profile);
}
