import { httpClient } from './httpClient';
import { AdapterResponse } from '../types';

type QueryOp = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

interface FilterCondition {
  column: string;
  op: 'eq' | 'neq' | 'in' | 'gte' | 'lte';
  value: any;
}

export class FastApiQueryBuilder<T = any> implements PromiseLike<AdapterResponse<T>> {
  private operation: QueryOp = 'SELECT';
  private selectedColumns: string = '*';
  private payload: any = null;
  private filters: FilterCondition[] = [];
  private orderColumn?: string;
  private orderAscending: boolean = true;
  private limitCount?: number;
  private isSingleResult: boolean = false;
  private isMaybeSingleResult: boolean = false;

  constructor(private table: string) {}

  select(columns: string = '*', _options?: { count?: string; head?: boolean }): this {
    if (this.operation !== 'INSERT' && this.operation !== 'UPDATE' && this.operation !== 'DELETE') {
      this.operation = 'SELECT';
    }
    this.selectedColumns = columns;
    return this;
  }

  insert(values: any): this {
    this.operation = 'INSERT';
    this.payload = values;
    return this;
  }

  update(values: any): this {
    this.operation = 'UPDATE';
    this.payload = values;
    return this;
  }

  upsert(values: any): this {
    this.operation = 'INSERT';
    this.payload = values;
    return this;
  }

  delete(): this {
    this.operation = 'DELETE';
    return this;
  }

  or(_filterString: string): this {
    return this;
  }

  not(column: string, _operator: string, value: any): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  eq(column: string, value: any): this {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: any): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  in(column: string, values: any[]): this {
    this.filters.push({ column, op: 'in', value: values });
    return this;
  }

  gte(column: string, value: any): this {
    this.filters.push({ column, op: 'gte', value });
    return this;
  }

  lte(column: string, value: any): this {
    this.filters.push({ column, op: 'lte', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderColumn = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.isSingleResult = true;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingleResult = true;
    return this;
  }

  private getFilterValue(column: string): any {
    const f = this.filters.find((c) => c.column === column && c.op === 'eq');
    return f ? f.value : undefined;
  }

  private async execute(): Promise<AdapterResponse<T>> {
    const table = this.table.toLowerCase();
    const idVal = this.getFilterValue('id');

    try {
      // -------------------------------------------------------------
      // 1. NOTES TABLE (/notes)
      // -------------------------------------------------------------
      if (table === 'user_notes') {
        if (this.operation === 'SELECT') {
          const res = await httpClient.get('/notes');
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.post('/notes', body);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE') {
          if (idVal) {
            const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
            const res = await httpClient.patch(`/notes/${idVal}`, body);
            return this.formatResult(res);
          }
        } else if (this.operation === 'DELETE') {
          if (idVal) {
            const res = await httpClient.delete(`/notes/${idVal}`);
            return this.formatResult(res);
          }
        }
      }

      // -------------------------------------------------------------
      // 2. TASKS TABLE (/tasks)
      // -------------------------------------------------------------
      if (table === 'tasks') {
        if (this.operation === 'SELECT') {
          if (idVal) {
            const res = await httpClient.get(`/tasks/${idVal}`);
            return this.formatResult(res);
          }
          const queryParams: string[] = [];
          const statusVal = this.getFilterValue('status');
          const priorityVal = this.getFilterValue('priority');
          const deptVal = this.getFilterValue('department_id');
          const projVal = this.getFilterValue('project_id');

          if (statusVal) queryParams.push(`status_filter=${encodeURIComponent(statusVal)}`);
          if (priorityVal) queryParams.push(`priority_filter=${encodeURIComponent(priorityVal)}`);
          if (deptVal) queryParams.push(`department_id=${encodeURIComponent(deptVal)}`);
          if (projVal) queryParams.push(`project_id=${encodeURIComponent(projVal)}`);

          const qs = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
          const res = await httpClient.get(`/tasks${qs}`);
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.post('/tasks', body);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE' && idVal) {
          const res = await httpClient.patch(`/tasks/${idVal}`, this.payload);
          return this.formatResult(res);
        } else if (this.operation === 'DELETE' && idVal) {
          const res = await httpClient.delete(`/tasks/${idVal}`);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 2b. TASK FILES (/tasks/{task_id}/files)
      // -------------------------------------------------------------
      if (table === 'task_files') {
        const taskId = this.getFilterValue('task_id') || this.payload?.task_id || (Array.isArray(this.payload) ? this.payload[0]?.task_id : undefined);
        if (this.operation === 'SELECT') {
          if (taskId) {
            const res = await httpClient.get(`/tasks/${taskId}/files`);
            return this.formatResult(res);
          }
          return { data: ([] as any) as T, error: null };
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const targetTaskId = body?.task_id || taskId;
          if (targetTaskId) {
            const res = await httpClient.post(`/tasks/${targetTaskId}/files`, body);
            return this.formatResult(res);
          }
        } else if (this.operation === 'DELETE') {
          if (idVal) {
            const res = await httpClient.delete(`/tasks/files/${idVal}`);
            return this.formatResult(res);
          }
        }
      }

      // -------------------------------------------------------------
      // 2c. TASK VOICE NOTES (/tasks/{task_id}/voice-notes)
      // -------------------------------------------------------------
      if (table === 'task_voice_notes') {
        const taskId = this.getFilterValue('task_id') || this.payload?.task_id || (Array.isArray(this.payload) ? this.payload[0]?.task_id : undefined);
        if (this.operation === 'SELECT') {
          if (taskId) {
            const res = await httpClient.get(`/tasks/${taskId}/voice-notes`);
            return this.formatResult(res);
          }
          return { data: ([] as any) as T, error: null };
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const targetTaskId = body?.task_id || taskId;
          if (targetTaskId) {
            const res = await httpClient.post(`/tasks/${targetTaskId}/voice-notes`, body);
            return this.formatResult(res);
          }
        } else if (this.operation === 'DELETE') {
          if (idVal) {
            const res = await httpClient.delete(`/tasks/voice-notes/${idVal}`);
            return this.formatResult(res);
          }
        }
      }

      // -------------------------------------------------------------
      // 2d. TASK COMMENTS (/tasks/{task_id}/comments)
      // -------------------------------------------------------------
      if (table === 'comments') {
        const taskId = this.getFilterValue('task_id') || this.payload?.task_id || (Array.isArray(this.payload) ? this.payload[0]?.task_id : undefined);
        if (this.operation === 'SELECT') {
          if (taskId) {
            const res = await httpClient.get(`/tasks/${taskId}/comments`);
            return this.formatResult(res);
          }
          return { data: ([] as any) as T, error: null };
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const targetTaskId = body?.task_id || taskId;
          if (targetTaskId) {
            const res = await httpClient.post(`/tasks/${targetTaskId}/comments`, { content: body.content });
            return this.formatResult(res);
          }
        } else if (this.operation === 'UPDATE' && idVal && taskId) {
          const body = this.payload;
          const res = await httpClient.patch(`/tasks/${taskId}/comments/${idVal}`, { content: body.content });
          return this.formatResult(res);
        } else if (this.operation === 'DELETE' && idVal && taskId) {
          const res = await httpClient.delete(`/tasks/${taskId}/comments/${idVal}`);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 3. USERS TABLE (/users)
      // -------------------------------------------------------------
      if (table === 'users') {
        if (this.operation === 'SELECT') {
          const session = httpClient.getSession();
          if (idVal && session?.user?.id === idVal) {
            const res = await httpClient.get('/users/me');
            return this.formatResult(res);
          }
          const deptVal = this.getFilterValue('department_id');
          const compVal = this.getFilterValue('company_id');
          const qParams: string[] = [];
          if (deptVal) qParams.push(`department_id=${encodeURIComponent(deptVal)}`);
          if (compVal) qParams.push(`company_id=${encodeURIComponent(compVal)}`);
          const qs = qParams.length > 0 ? `?${qParams.join('&')}` : '';
          const res = await httpClient.get(`/users${qs}`);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE' && idVal) {
          const res = await httpClient.patch(`/users/${idVal}`, this.payload);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 3b. COMPANIES TABLE (/superadmin/companies)
      // -------------------------------------------------------------
      if (table === 'companies') {
        if (this.operation === 'SELECT') {
          if (idVal) {
            const res = await httpClient.get(`/superadmin/companies/${idVal}`);
            return this.formatResult(res);
          }
          const res = await httpClient.get('/superadmin/companies');
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 4. DEPARTMENTS & DESIGNATIONS (/users/departments, /users/designations)
      // -------------------------------------------------------------
      if (table === 'departments') {
        if (this.operation === 'SELECT') {
          const compVal = this.getFilterValue('company_id');
          const qs = compVal ? `?company_id=${encodeURIComponent(compVal)}` : '';
          const res = await httpClient.get(`/users/departments${qs}`);
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.post('/users/departments', body);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE' && idVal) {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.patch(`/users/departments/${idVal}`, body);
          return this.formatResult(res);
        } else if (this.operation === 'DELETE' && idVal) {
          const res = await httpClient.delete(`/users/departments/${idVal}`);
          return this.formatResult(res);
        }
      }
      if (table === 'designations') {
        if (this.operation === 'SELECT') {
          const compVal = this.getFilterValue('company_id');
          const qs = compVal ? `?company_id=${encodeURIComponent(compVal)}` : '';
          const res = await httpClient.get(`/users/designations${qs}`);
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.post('/users/designations', body);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE' && idVal) {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.patch(`/users/designations/${idVal}`, body);
          return this.formatResult(res);
        } else if (this.operation === 'DELETE' && idVal) {
          const res = await httpClient.delete(`/users/designations/${idVal}`);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 5. PROJECTS TABLE (/projects)
      // -------------------------------------------------------------
      if (table === 'projects') {
        if (this.operation === 'SELECT') {
          const res = await httpClient.get('/projects');
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.post('/projects', body);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 6. MEETINGS TABLE (/meetings)
      // -------------------------------------------------------------
      if (table === 'meetings') {
        if (this.operation === 'SELECT') {
          if (idVal) {
            const res = await httpClient.get(`/meetings/${idVal}`);
            return this.formatResult(res);
          }
          const res = await httpClient.get('/meetings');
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const res = await httpClient.post('/meetings', body);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE' && idVal) {
          const res = await httpClient.patch(`/meetings/${idVal}`, this.payload);
          return this.formatResult(res);
        } else if (this.operation === 'DELETE' && idVal) {
          const res = await httpClient.delete(`/meetings/${idVal}`);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 6b. MEETING FILES (/meetings/{meeting_id}/files)
      // -------------------------------------------------------------
      if (table === 'meeting_files') {
        const meetingId = this.getFilterValue('meeting_id') || this.payload?.meeting_id || (Array.isArray(this.payload) ? this.payload[0]?.meeting_id : undefined);
        if (this.operation === 'SELECT') {
          if (meetingId) {
            const res = await httpClient.get(`/meetings/${meetingId}/files`);
            return this.formatResult(res);
          }
          return { data: ([] as any) as T, error: null };
        } else if (this.operation === 'INSERT') {
          const body = Array.isArray(this.payload) && this.payload.length === 1 ? this.payload[0] : this.payload;
          const targetMeetingId = body?.meeting_id || meetingId;
          if (targetMeetingId) {
            const res = await httpClient.post(`/meetings/${targetMeetingId}/files`, body);
            return this.formatResult(res);
          }
        } else if (this.operation === 'DELETE') {
          if (idVal) {
            const res = await httpClient.delete(`/meetings/files/${idVal}`);
            return this.formatResult(res);
          }
        }
      }

      // -------------------------------------------------------------
      // 6c. MEETING PARTICIPANTS (/meetings/{meeting_id}/participants)
      // -------------------------------------------------------------
      if (table === 'meeting_participants') {
        const meetingId = this.getFilterValue('meeting_id') || this.payload?.meeting_id || (Array.isArray(this.payload) ? this.payload[0]?.meeting_id : undefined);
        if (this.operation === 'SELECT') {
          if (meetingId) {
            const res = await httpClient.get(`/meetings/${meetingId}/participants`);
            return this.formatResult(res);
          }
          return { data: ([] as any) as T, error: null };
        } else if (this.operation === 'INSERT') {
          if (meetingId) {
            const res = await httpClient.post(`/meetings/${meetingId}/participants`, this.payload);
            return this.formatResult(res);
          }
          return { data: ([] as any) as T, error: null };
        }
      }

      // -------------------------------------------------------------
      // 7. CHAT CHANNELS & MESSAGES (/chat/channels)
      // -------------------------------------------------------------
      if (table === 'chat_channels') {
        const res = await httpClient.get('/chat/channels');
        return this.formatResult(res);
      }

      if (table === 'chat_messages') {
        const channelId = this.getFilterValue('channel_id');
        if (this.operation === 'SELECT' && channelId) {
          const res = await httpClient.get(`/chat/channels/${channelId}/messages`);
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const chId = this.payload?.channel_id || channelId;
          if (chId) {
            const res = await httpClient.post(`/chat/channels/${chId}/messages`, {
              channel_id: chId,
              content: this.payload.content || '',
              attachment_url: this.payload.attachment_url,
              attachment_name: this.payload.attachment_name,
            });
            return this.formatResult(res);
          }
        }
      }

      // -------------------------------------------------------------
      // 8. NOTIFICATIONS (/notifications)
      // -------------------------------------------------------------
      if (table === 'in_app_notifications' || table === 'notifications') {
        if (this.operation === 'SELECT') {
          const res = await httpClient.get('/notifications');
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE') {
          if (idVal) {
            const res = await httpClient.patch(`/notifications/${idVal}/read`);
            return this.formatResult(res);
          } else {
            const res = await httpClient.patch('/notifications/read-all');
            return this.formatResult(res);
          }
        } else if (this.operation === 'DELETE') {
          if (idVal) {
            const res = await httpClient.delete(`/notifications/${idVal}`);
            return this.formatResult(res);
          } else {
            const res = await httpClient.delete('/notifications');
            return this.formatResult(res);
          }
        }
      }

      // 9. COMPANIES (/superadmin/companies)
      // -------------------------------------------------------------
      if (table === 'companies') {
        const res = await httpClient.get('/superadmin/companies');
        return this.formatResult(res);
      }

      // -------------------------------------------------------------
      // 10. APPROVALS (/approvals, /meetings/{id}/approvals)
      // -------------------------------------------------------------
      if (table === 'meeting_approvals') {
        const meetingId = this.getFilterValue('meeting_id') || this.payload?.meeting_id || (Array.isArray(this.payload) ? this.payload[0]?.meeting_id : undefined);
        if (this.operation === 'SELECT') {
          if (meetingId) {
            const res = await httpClient.get(`/meetings/${meetingId}/approvals`);
            return this.formatResult(res);
          }
          const res = await httpClient.get('/meetings/approvals');
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          // Handled server-side atomically in create_meeting
          return { data: ([] as any) as T, error: null };
        }
      }

      if (table === 'approvals') {
        const res = await httpClient.get('/approvals');
        return this.formatResult(res);
      }

      if (table === 'phone_change_requests' && this.operation === 'INSERT') {
        const res = await httpClient.post('/approvals/phone-change', {
          new_phone: this.payload?.new_phone,
        });
        return this.formatResult(res);
      }

      if (table === 'registration_requests' && this.operation === 'INSERT') {
        const res = await httpClient.post('/approvals/registration', {
          email: this.payload?.email,
          requested_role: this.payload?.requested_role,
        });
        return this.formatResult(res);
      }

      // Fallback for auxiliary relation tables (e.g. task_assignees, task_files, meeting_participants)
      return { data: ([] as any) as T, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || 'Query execution error' },
      };
    }
  }

  private formatResult(res: AdapterResponse<any>): AdapterResponse<T> {
    if (res.error) {
      return { data: null, error: res.error };
    }

    let data = res.data;

    // Filter in-memory if needed
    if (Array.isArray(data)) {
      data = data.filter((item) => {
        for (const f of this.filters) {
          const val = item[f.column];
          if (f.op === 'eq' && val !== undefined && String(val) !== String(f.value)) {
            return false;
          }
          if (f.op === 'neq' && val !== undefined && String(val) === String(f.value)) {
            return false;
          }
          if (f.op === 'in' && Array.isArray(f.value)) {
            const stringValues = f.value.map(String);
            if (!stringValues.includes(String(val))) return false;
          }
        }
        return true;
      });

      // Sorting
      if (this.orderColumn) {
        const col = this.orderColumn;
        const asc = this.orderAscending;
        data.sort((a: any, b: any) => {
          if (a[col] == null) return asc ? 1 : -1;
          if (b[col] == null) return asc ? -1 : 1;
          if (a[col] < b[col]) return asc ? -1 : 1;
          if (a[col] > b[col]) return asc ? 1 : -1;
          return 0;
        });
      }

      // Limit
      if (this.limitCount !== undefined && this.limitCount > 0) {
        data = data.slice(0, this.limitCount);
      }

      // Single / MaybeSingle
      if (this.isSingleResult) {
        if (data.length === 0) {
          return {
            data: null,
            error: { message: 'Row not found', code: 'PGRST116' },
          };
        }
        return { data: data[0] as T, error: null };
      }

      if (this.isMaybeSingleResult) {
        return { data: (data.length > 0 ? data[0] : null) as T, error: null };
      }
    } else if (data != null && (this.isSingleResult || this.isMaybeSingleResult)) {
      return { data: data as T, error: null };
    }

    const count = Array.isArray(data) ? data.length : (data != null ? 1 : 0);
    return { data: data as T, error: null, count };
  }

  then<TResult1 = AdapterResponse<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: AdapterResponse<T>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
