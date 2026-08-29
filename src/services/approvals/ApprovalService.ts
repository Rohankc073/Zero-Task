import { supabase } from '../../lib/supabase';
import { User } from '../../types';
import { isFounder, isSuperAdmin, isExecutiveOrAdmin } from '../../utils/permissions';

export type ApprovalCategory = 'all' | 'meetings' | 'phones' | 'tasks' | 'access';
export type ApprovalStatusTab = 'pending' | 'approved' | 'rejected';

export interface ApprovalTimelineStep {
  role: string;
  name?: string;
  status: 'Approved' | 'Pending' | 'Waiting' | 'Rejected';
  sequenceOrder: number;
  approvedAt?: string;
}

export interface UnifiedApprovalItem {
  id: string;
  type: 'meeting' | 'phone' | 'task' | 'password' | 'user_registration';
  category: 'meetings' | 'phones' | 'tasks' | 'access';
  title: string;
  description?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  requester: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    departmentName?: string;
  };
  details: {
    meeting?: any;
    phone?: {
      currentPhone: string;
      newPhone: string;
    };
    task?: any;
    passwordReset?: any;
    userRegistration?: {
      userId: string;
      fullName?: string;
      email?: string;
      role?: string;
      departmentId?: string;
    };
  };
  currentStage: string;
  isFinalApproval: boolean;
  timeline: ApprovalTimelineStep[];
  rawItem: any;
}

export class ApprovalService {
  /**
   * Fetches all unified approvals for the current user matching the status tab.
   */
  static async fetchApprovalInbox(
    user: User,
    statusTab: ApprovalStatusTab
  ): Promise<UnifiedApprovalItem[]> {
    if (!user || !user.id) return [];

    const isUserFounder = isFounder(user);
    const isUserSuperAdmin = isSuperAdmin(user);
    const isUserExecAdmin = isExecutiveOrAdmin(user);

    const items: UnifiedApprovalItem[] = [];

    // Map statusTab to SQL query status values
    const meetingStatusFilter = statusTab === 'pending' ? 'Pending' : statusTab === 'approved' ? 'Approved' : 'Rejected';
    const phoneStatusFilter = statusTab === 'pending' ? 'Pending' : statusTab === 'approved' ? 'Approved' : 'Rejected';
    const taskStatusFilter = statusTab === 'pending' ? 'pending' : statusTab === 'approved' ? 'approved' : 'rejected';
    const pwdStatusFilter = statusTab === 'pending' ? 'Pending' : statusTab === 'approved' ? 'Approved' : 'Rejected';

    try {
      // ── 1. Fetch Meeting Approvals ──────────────────────────────────
      let meetingQuery = supabase
        .from('meeting_approvals')
        .select(`
          *,
          meeting:meetings(
            id, title, description, start_time, end_time, meeting_platform, meeting_link, 
            status, is_private, organizer_id, department_id, created_at,
            organizer:users!organizer_id(id, full_name, role, email, department:departments(name)),
            participants:meeting_participants(user:users(id, full_name, role, email, department:departments(name))),
            meeting_approvals(id, approver_id, approver_role, sequence_order, status, updated_at, approver:users!approver_id(full_name))
          ),
          requester:users!requester_id(id, full_name, role, email, department:departments(name)),
          approver:users!approver_id(id, full_name, role, email)
        `)
        .eq('status', meetingStatusFilter)
        .order('created_at', { ascending: false });

      if (!isUserExecAdmin) {
        meetingQuery = meetingQuery.eq('approver_id', user.id);
      }

      const { data: meetingData, error: meetingError } = await meetingQuery;
      if (!meetingError && meetingData) {
        for (const m of meetingData) {
          const meetingObj = m.meeting || {};
          // Protect Founder private meetings from Super Admin
          if (meetingObj.is_private && meetingObj.organizer_id !== user.id && isUserSuperAdmin) {
            continue;
          }

          const allSteps: any[] = Array.isArray(meetingObj.meeting_approvals)
            ? [...meetingObj.meeting_approvals].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
            : [];

          const timeline: ApprovalTimelineStep[] = allSteps.map(step => ({
            role: step.approver_role || 'Approver',
            name: step.approver?.full_name || undefined,
            status: step.status as any,
            sequenceOrder: step.sequence_order || 1,
            approvedAt: step.updated_at,
          }));

          const maxOrder = allSteps.length > 0 ? Math.max(...allSteps.map(s => s.sequence_order || 1)) : 1;
          const isFinal = m.sequence_order === maxOrder || m.approver_role === 'Founder';

          items.push({
            id: m.id,
            type: 'meeting',
            category: 'meetings',
            title: meetingObj.title || 'Meeting Request',
            description: meetingObj.description || 'Meeting authorization request',
            status: m.status === 'Approved' ? 'Approved' : m.status === 'Rejected' ? 'Rejected' : 'Pending',
            createdAt: m.created_at,
            requester: {
              id: m.requester?.id || meetingObj.organizer?.id || '',
              fullName: m.requester?.full_name || meetingObj.organizer?.full_name || 'Team Member',
              email: m.requester?.email || meetingObj.organizer?.email || '',
              role: m.requester?.role || meetingObj.organizer?.role || 'Employee',
              departmentName: m.requester?.department?.name || meetingObj.organizer?.department?.name || 'General',
            },
            details: {
              meeting: {
                id: meetingObj.id,
                title: meetingObj.title,
                description: meetingObj.description,
                startTime: meetingObj.start_time,
                endTime: meetingObj.end_time,
                platform: meetingObj.meeting_platform,
                meetingLink: meetingObj.meeting_link,
                participants: (meetingObj.participants || []).map((p: any) => p.user).filter(Boolean),
                status: meetingObj.status,
              },
            },
            currentStage: `${m.approver_role || 'Hierarchical'} Approval (Step ${m.sequence_order || 1} of ${maxOrder})`,
            isFinalApproval: isFinal,
            timeline,
            rawItem: m,
          });
        }
      }

      // ── 2. Fetch Phone Number Change Requests ───────────────────────
      let phoneQuery = supabase
        .from('phone_change_requests')
        .select(`
          *,
          requester:users!user_id(id, email, full_name, role, phone_number, department:departments(name))
        `)
        .eq('status', phoneStatusFilter)
        .order('created_at', { ascending: false });

      if (!isUserExecAdmin) {
        phoneQuery = phoneQuery.eq('approver_id', user.id);
      }

      const { data: phoneData, error: phoneError } = await phoneQuery;
      if (!phoneError && phoneData) {
        for (const p of phoneData) {
          const req = p.requester || {};
          const timeline: ApprovalTimelineStep[] = [
            {
              role: req.role || 'Employee',
              name: req.full_name || 'Requester',
              status: 'Approved',
              sequenceOrder: 1,
              approvedAt: p.created_at,
            },
            {
              role: user.role || 'Approver',
              name: user.full_name || 'Approver',
              status: p.status === 'Approved' ? 'Approved' : p.status === 'Rejected' ? 'Rejected' : 'Pending',
              sequenceOrder: 2,
              approvedAt: p.updated_at,
            },
          ];

          items.push({
            id: p.id,
            type: 'phone',
            category: 'phones',
            title: 'Phone Number Change',
            description: `Request to update contact number to ${p.new_phone_number}`,
            status: p.status === 'Approved' ? 'Approved' : p.status === 'Rejected' ? 'Rejected' : 'Pending',
            createdAt: p.created_at,
            requester: {
              id: req.id || p.user_id || '',
              fullName: req.full_name || 'Team Member',
              email: req.email || '',
              role: req.role || 'Employee',
              departmentName: req.department?.name || 'General',
            },
            details: {
              phone: {
                currentPhone: req.phone_number || 'Not Set',
                newPhone: p.new_phone_number,
              },
            },
            currentStage: isUserFounder ? 'Final Founder Approval' : 'Management Authorization',
            isFinalApproval: isUserFounder,
            timeline,
            rawItem: p,
          });
        }
      }

      // ── 3. Fetch Task Approvals ─────────────────────────────────────
      let taskQuery = supabase
        .from('approvals')
        .select(`
          *,
          task:tasks(id, title, description, priority, due_date, status, is_private, created_by),
          requester:users!requester_id(id, email, full_name, role, department:departments(name)),
          approver:users!approver_id(id, email, full_name, role)
        `)
        .eq('status', taskStatusFilter)
        .order('created_at', { ascending: false });

      if (!isUserExecAdmin) {
        taskQuery = taskQuery.eq('approver_id', user.id);
      }

      const { data: taskData, error: taskError } = await taskQuery;
      if (!taskError && taskData) {
        for (const t of taskData) {
          const taskObj = t.task || {};
          // Protect Founder private tasks from Super Admin
          if (taskObj.is_private && taskObj.created_by !== user.id && isUserSuperAdmin) {
            continue;
          }

          const req = t.requester || {};
          const timeline: ApprovalTimelineStep[] = [
            {
              role: req.role || 'Requester',
              name: req.full_name,
              status: 'Approved',
              sequenceOrder: 1,
              approvedAt: t.created_at,
            },
            {
              role: user.role || 'Approver',
              name: user.full_name,
              status: t.status === 'approved' ? 'Approved' : t.status === 'rejected' ? 'Rejected' : 'Pending',
              sequenceOrder: 2,
              approvedAt: t.updated_at,
            },
          ];

          items.push({
            id: t.id,
            type: 'task',
            category: 'tasks',
            title: taskObj.title || 'Task Authorization',
            description: taskObj.description || 'Task authorization request',
            status: t.status === 'approved' ? 'Approved' : t.status === 'rejected' ? 'Rejected' : 'Pending',
            createdAt: t.created_at,
            requester: {
              id: req.id || t.requester_id || '',
              fullName: req.full_name || 'Team Member',
              email: req.email || '',
              role: req.role || 'Employee',
              departmentName: req.department?.name || 'General',
            },
            details: {
              task: {
                id: taskObj.id,
                title: taskObj.title,
                description: taskObj.description,
                priority: taskObj.priority,
                dueDate: taskObj.due_date,
                status: taskObj.status,
              },
            },
            currentStage: isUserFounder ? 'Executive Approval' : 'Management Authorization',
            isFinalApproval: isUserFounder,
            timeline,
            rawItem: t,
          });
        }
      }

      // ── 4. Fetch Password Reset / Access Requests ───────────────────
      let pwdQuery = supabase
        .from('password_resets')
        .select(`
          *,
          employee:users!user_id(id, email, full_name, role, department_id, department:departments(name))
        `)
        .eq('status', pwdStatusFilter)
        .order('created_at', { ascending: false });

      if (!isUserExecAdmin && user.department_id) {
        // Scope to employees in the same department for Dept Head and Manager
        pwdQuery = pwdQuery.eq('employee.department_id', user.department_id);
      }

      const { data: pwdData, error: pwdError } = await pwdQuery;
      if (!pwdError && pwdData) {
        for (const pwd of pwdData) {
          const emp = pwd.employee || {};
          const timeline: ApprovalTimelineStep[] = [
            {
              role: emp.role || 'Employee',
              name: emp.full_name,
              status: 'Approved',
              sequenceOrder: 1,
              approvedAt: pwd.created_at,
            },
            {
              role: user.role || 'Manager',
              name: user.full_name,
              status: pwd.status === 'Approved' ? 'Approved' : pwd.status === 'Rejected' ? 'Rejected' : 'Pending',
              sequenceOrder: 2,
              approvedAt: pwd.updated_at,
            },
          ];

          items.push({
            id: pwd.id,
            type: 'password',
            category: 'access',
            title: 'Password Reset Request',
            description: `Credential reset request for ${emp.full_name || emp.email}`,
            status: pwd.status === 'Approved' ? 'Approved' : pwd.status === 'Rejected' ? 'Rejected' : 'Pending',
            createdAt: pwd.created_at,
            requester: {
              id: emp.id || pwd.user_id || pwd.employee_id || '',
              fullName: emp.full_name || 'Team Member',
              email: emp.email || '',
              role: emp.role || 'Employee',
              departmentName: emp.department?.name || 'General',
            },
            details: {
              passwordReset: {
                id: pwd.id,
                employeeId: emp.id,
                email: emp.email,
              },
            },
            currentStage: 'Security Credential Verification',
            isFinalApproval: true,
            timeline,
            rawItem: pwd,
          });
        }
      }

      // ── 5. Fetch User Registration Approvals ────────────────────────
      let userRegQuery = supabase
        .from('users')
        .select(`
          id, email, full_name, role, department_id, status, is_approved, created_at,
          department:departments(name)
        `)
        .not('role', 'in', '("Super Admin","Founder")')
        .order('created_at', { ascending: false });

      if (statusTab === 'pending') {
        userRegQuery = userRegQuery.eq('is_approved', false).neq('status', 'Rejected');
      } else if (statusTab === 'approved') {
        userRegQuery = userRegQuery.eq('is_approved', true);
      } else if (statusTab === 'rejected') {
        userRegQuery = userRegQuery.eq('status', 'Rejected');
      }

      if (!isUserExecAdmin && user.department_id) {
        userRegQuery = userRegQuery.eq('department_id', user.department_id);
      }

      const { data: regData, error: regError } = await userRegQuery;
      if (!regError && regData) {
        for (const regUser of regData) {
          items.push({
            id: `reg-${regUser.id}`,
            type: 'user_registration',
            category: 'access',
            title: 'New User Account Registration',
            description: `Registration request for ${regUser.full_name || regUser.email} (${regUser.role || 'Employee'})`,
            status: regUser.is_approved ? 'Approved' : regUser.status === 'Rejected' ? 'Rejected' : 'Pending',
            createdAt: regUser.created_at || new Date().toISOString(),
            requester: {
              id: regUser.id,
              fullName: regUser.full_name || 'New User',
              email: regUser.email || '',
              role: regUser.role || 'Employee',
              departmentName: (regUser.department as any)?.name || 'General',
            },
            details: {
              userRegistration: {
                userId: regUser.id,
                fullName: regUser.full_name,
                email: regUser.email,
                role: regUser.role,
                departmentId: regUser.department_id,
              },
            },
            currentStage: 'User Access Authorization',
            isFinalApproval: isUserFounder || isUserSuperAdmin,
            timeline: [
              {
                role: regUser.role || 'Applicant',
                name: regUser.full_name,
                status: 'Approved',
                sequenceOrder: 1,
                approvedAt: regUser.created_at,
              },
              {
                role: user.role || 'Manager',
                name: user.full_name,
                status: regUser.is_approved ? 'Approved' : regUser.status === 'Rejected' ? 'Rejected' : 'Pending',
                sequenceOrder: 2,
              },
            ],
            rawItem: regUser,
          });
        }
      }

    } catch (err: any) {
      console.error('Error fetching approval inbox:', err);
    }

    // Sort all unified items descending by creation date
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Computes accurate pending approval count for badges without hallucinations.
   */
  static async getPendingCount(user: User): Promise<number> {
    if (!user || !user.id) return 0;
    try {
      const pendingItems = await this.fetchApprovalInbox(user, 'pending');
      return pendingItems.length;
    } catch {
      return 0;
    }
  }

  /**
   * Processes an approval decision (Approve / Reject) with entity state sync.
   */
  static async processDecision(
    item: UnifiedApprovalItem,
    action: 'Approved' | 'Rejected',
    reason?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      if (item.type === 'meeting') {
        const { error } = await supabase.rpc('process_meeting_approval', {
          p_approval_id: item.id,
          p_action: action,
          p_reason: reason || (action === 'Approved' ? 'Approved via Approval Center' : 'Rejected via Approval Center'),
        });
        if (error) throw error;
        return { success: true, message: `Meeting request ${action.toLowerCase()} successfully.` };
      }

      if (item.type === 'phone') {
        const { error } = await supabase.rpc('process_phone_change_approval', {
          p_request_id: item.id,
          p_action: action,
        });
        if (error) throw error;
        return { success: true, message: `Phone number change ${action.toLowerCase()} successfully.` };
      }

      if (item.type === 'task') {
        const taskAction = action === 'Approved' ? 'approved' : 'rejected';
        const { error: updateError } = await supabase
          .from('approvals')
          .update({ status: taskAction, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (updateError) throw updateError;

        if (item.requester?.id) {
          await supabase.from('in_app_notifications').insert({
            user_id: item.requester.id,
            title: `Task Request ${action}`,
            message: `Your task approval request has been ${action.toLowerCase()}${reason ? `: ${reason}` : '.'}`,
          });
        }
        return { success: true, message: `Task request ${action.toLowerCase()} successfully.` };
      }

      if (item.type === 'password') {
        const { error } = await supabase
          .from('password_resets')
          .update({ status: action, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (error) throw error;
        return { success: true, message: `Password reset request ${action.toLowerCase()}.` };
      }

      if (item.type === 'user_registration') {
        const userId = item.details?.userRegistration?.userId || item.rawItem?.id;
        if (action === 'Approved') {
          const { error } = await supabase
            .from('users')
            .update({ is_approved: true, status: 'Approved', updated_at: new Date().toISOString() })
            .eq('id', userId);
          if (error) throw error;
          return { success: true, message: `User account for ${item.requester.fullName} approved successfully.` };
        } else {
          const { error } = await supabase
            .from('users')
            .update({ is_approved: false, status: 'Rejected', updated_at: new Date().toISOString() })
            .eq('id', userId);
          if (error) throw error;
          return { success: true, message: `User account request rejected.` };
        }
      }

      return { success: false, error: 'Unsupported approval type' };
    } catch (err: any) {
      console.error('Error processing approval decision:', err);
      return { success: false, error: err.message || 'Failed to process approval.' };
    }
  }
}
