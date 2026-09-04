import { authAdapter } from './authAdapter';
import { storageAdapter } from './storageAdapter';
import { realtimeManager } from './realtimeAdapter';
import { FastApiQueryBuilder } from './queryBuilder';
import { httpClient } from './httpClient';
import { AdapterResponse, IRealtimeChannel, IStorageClient } from '../types';

export class FastApiClient {
  readonly auth = authAdapter;
  readonly storage: IStorageClient = storageAdapter;

  from<T = any>(table: string): FastApiQueryBuilder<T> {
    return new FastApiQueryBuilder<T>(table);
  }

  channel(name: string): IRealtimeChannel {
    return realtimeManager.channel(name);
  }

  removeChannel(channel: IRealtimeChannel): void {
    realtimeManager.removeChannel(channel);
  }

  /**
   * Translates legacy Supabase RPC function calls directly to FastAPI endpoints
   */
  async rpc(functionName: string, args: Record<string, any> = {}): Promise<AdapterResponse<any>> {
    try {
      switch (functionName) {
        // Direct chat channel creation
        case 'get_or_create_direct_channel': {
          const targetUserId = args.p_target_user_id || args.target_user_id;
          const res = await httpClient.post('/chat/direct', {
            target_user_id: targetUserId,
          });
          return { data: res.data, error: res.error };
        }

        // Task segregation
        case 'segregate_task': {
          const taskId = args.p_parent_task_id || args.task_id;
          const res = await httpClient.post(`/tasks/${taskId}/segregate`, {
            parent_task_id: taskId,
            subtasks: args.p_subtasks || args.subtasks || [],
          });
          return { data: res.data, error: res.error };
        }

        // Meeting approval processing
        case 'process_meeting_approval': {
          const meetingId = args.p_meeting_id || args.meeting_id;
          const action = args.p_decision || args.decision || 'Approved';
          const reason = args.p_decision_reason || args.decision_reason;
          const res = await httpClient.post(`/meetings/${meetingId}/approval`, {
            action,
            decision_reason: reason,
          });
          return { data: res.data, error: res.error };
        }

        // Phone change approval processing
        case 'process_phone_change_approval': {
          const reqId = args.p_request_id || args.request_id;
          const action = args.p_decision || args.decision || 'Approved';
          const res = await httpClient.post(`/approvals/phone-change/${reqId}/process`, {
            action,
          });
          return { data: res.data, error: res.error };
        }

        // Submit registration request
        case 'submit_registration_request': {
          const email = args.p_email || args.email;
          const role = args.p_role || args.role;
          const res = await httpClient.post('/approvals/registration', {
            email,
            requested_role: role,
          });
          return { data: res.data, error: res.error };
        }

        // Phone change request
        case 'request_phone_change': {
          const phone = args.p_new_phone || args.new_phone;
          const res = await httpClient.post('/approvals/phone-change', {
            new_phone: phone,
          });
          return { data: res.data, error: res.error };
        }

        // Password reset request
        case 'request_password_reset': {
          const email = args.p_email || args.email;
          const res = await httpClient.post('/auth/request-password-reset', {
            email,
          });
          return { data: res.data, error: res.error };
        }

        // Analytics & Reports
        case 'get_employee_dashboard_metrics': {
          const res = await httpClient.get('/reports/employee-metrics');
          return { data: res.data, error: res.error };
        }

        case 'get_manager_project_analytics': {
          const res = await httpClient.get('/reports/manager-analytics');
          return { data: res.data, error: res.error };
        }

        case 'get_team_workload': {
          const deptId = args.p_department_id || args.department_id;
          const qs = deptId ? `?department_id=${encodeURIComponent(deptId)}` : '';
          const res = await httpClient.get(`/reports/team-workload${qs}`);
          return { data: res.data, error: res.error };
        }

        // Superadmin company management
        case 'create_company_and_founder': {
          const res = await httpClient.post('/superadmin/companies', {
            company_name: args.p_company_name,
            founder_name: args.p_founder_name,
            founder_email: args.p_founder_email,
            founder_phone: args.p_founder_phone,
            initial_password: args.p_initial_password,
          });
          return { data: res.data, error: res.error };
        }

        case 'delete_company_and_users': {
          const companyId = args.p_company_id || args.company_id;
          const res = await httpClient.delete(`/superadmin/companies/${companyId}`);
          return { data: res.data, error: res.error };
        }

        // Administrative user management
        case 'admin_update_user': {
          const userId = args.p_user_id || args.user_id;
          const res = await httpClient.patch(`/users/${userId}`, {
            full_name: args.p_full_name,
            role: args.p_role,
            department_id: args.p_department_id,
            designation_id: args.p_designation_id,
          });
          return { data: res.data, error: res.error };
        }

        case 'admin_delete_user': {
          const userId = args.p_user_id || args.user_id;
          const res = await httpClient.patch(`/users/${userId}`, {
            is_deleted: true,
            is_active: false,
          });
          return { data: res.data, error: res.error };
        }

        case 'admin_reset_password': {
          const res = await httpClient.post('/auth/change-password', {
            current_password: '',
            new_password: args.p_new_password || args.new_password,
          });
          return { data: res.data, error: res.error };
        }

        case 'mock_checkout': {
          return { data: { success: true }, error: null };
        }

        case 'cleanup_and_complete_meetings': {
          return { data: { count: 0 }, error: null };
        }

        default:
          console.warn(`[FastApiClient.rpc] Unhandled RPC call '${functionName}', returning null`);
          return { data: null, error: null };
      }
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || `RPC ${functionName} failed` },
      };
    }
  }

  /**
   * Emulates Supabase Edge Functions invocations
   */
  readonly functions = {
    invoke: async (functionName: string, options: { body?: any } = {}): Promise<AdapterResponse<any>> => {
      if (functionName === 'approve-user') {
        const reqId = options.body?.request_id;
        const res = await httpClient.post(`/approvals/registration/${reqId}/approve`, options.body);
        return { data: res.data, error: res.error };
      }

      if (functionName === 'sync-calendar') {
        const res = await httpClient.post('/integrations/google-calendar/sync', options.body);
        return { data: res.data, error: res.error };
      }

      return { data: null, error: null };
    },
  };
}

export const createFastApiClient = (): FastApiClient => {
  return new FastApiClient();
};
