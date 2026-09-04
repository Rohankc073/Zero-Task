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

  select(columns: string = '*'): this {
    this.operation = 'SELECT';
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

  delete(): this {
    this.operation = 'DELETE';
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
          const res = await httpClient.post('/notes', this.payload);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE') {
          if (idVal) {
            const res = await httpClient.patch(`/notes/${idVal}`, this.payload);
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
          const res = await httpClient.post('/tasks', this.payload);
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
          const qs = deptVal ? `?department_id=${encodeURIComponent(deptVal)}` : '';
          const res = await httpClient.get(`/users${qs}`);
          return this.formatResult(res);
        } else if (this.operation === 'UPDATE' && idVal) {
          const res = await httpClient.patch(`/users/${idVal}`, this.payload);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 4. DEPARTMENTS & DESIGNATIONS (/users/departments, /users/designations)
      // -------------------------------------------------------------
      if (table === 'departments') {
        const res = await httpClient.get('/users/departments');
        return this.formatResult(res);
      }
      if (table === 'designations') {
        const res = await httpClient.get('/users/designations');
        return this.formatResult(res);
      }

      // -------------------------------------------------------------
      // 5. PROJECTS TABLE (/projects)
      // -------------------------------------------------------------
      if (table === 'projects') {
        if (this.operation === 'SELECT') {
          const res = await httpClient.get('/projects');
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const res = await httpClient.post('/projects', this.payload);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 6. MEETINGS TABLE (/meetings)
      // -------------------------------------------------------------
      if (table === 'meetings') {
        if (this.operation === 'SELECT') {
          const res = await httpClient.get('/meetings');
          return this.formatResult(res);
        } else if (this.operation === 'INSERT') {
          const res = await httpClient.post('/meetings', this.payload);
          return this.formatResult(res);
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
        } else if (this.operation === 'UPDATE' && idVal) {
          const res = await httpClient.patch(`/notifications/${idVal}/read`);
          return this.formatResult(res);
        }
      }

      // -------------------------------------------------------------
      // 9. COMPANIES (/superadmin/companies)
      // -------------------------------------------------------------
      if (table === 'companies') {
        const res = await httpClient.get('/superadmin/companies');
        return this.formatResult(res);
      }

      // -------------------------------------------------------------
      // 10. APPROVALS (/approvals)
      // -------------------------------------------------------------
      if (table === 'approvals' || table === 'meeting_approvals') {
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

    return { data: data as T, error: null };
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
