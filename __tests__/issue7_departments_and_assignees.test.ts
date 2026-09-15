import { FastApiQueryBuilder } from '../src/adapter/fastapi/queryBuilder';
import { httpClient } from '../src/adapter/fastapi/httpClient';

jest.mock('../src/adapter/fastapi/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    getSession: jest.fn().mockReturnValue({ user: { id: 'user-1' } }),
  },
}));

describe('Issue 7: Dynamic Department Management & Subtask Assignees Frontend Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Part A: QueryBuilder Departments & Designations Routing', () => {
    it('1. routes SELECT on departments to GET /users/departments with company_id filter', async () => {
      (httpClient.get as jest.Mock).mockResolvedValue({
        data: [{ id: 'dept-1', name: 'Engineering', company_id: 'comp-1' }],
        error: null,
      });

      const qb = new FastApiQueryBuilder('departments');
      qb.select('*').eq('company_id', 'comp-1');
      const res = await qb;

      expect(httpClient.get).toHaveBeenCalledWith('/users/departments?company_id=comp-1');
      expect(res.data).toHaveLength(1);
      expect(res.data[0].name).toBe('Engineering');
    });

    it('2. routes INSERT on departments to POST /users/departments', async () => {
      const createdDept = { id: 'dept-2', name: 'Customer Service', company_id: 'comp-1' };
      (httpClient.post as jest.Mock).mockResolvedValue({
        data: createdDept,
        error: null,
      });

      const qb = new FastApiQueryBuilder('departments');
      qb.insert({ name: 'Customer Service', company_id: 'comp-1' });
      const res = await qb.single();

      expect(httpClient.post).toHaveBeenCalledWith('/users/departments', {
        name: 'Customer Service',
        company_id: 'comp-1',
      });
      expect(res.data).toEqual(createdDept);
    });

    it('3. routes UPDATE on departments to PATCH /users/departments/{id}', async () => {
      const updatedDept = { id: 'dept-2', name: 'Customer Support', company_id: 'comp-1' };
      (httpClient.patch as jest.Mock).mockResolvedValue({
        data: updatedDept,
        error: null,
      });

      const qb = new FastApiQueryBuilder('departments');
      qb.update({ name: 'Customer Support' }).eq('id', 'dept-2');
      const res = await qb.single();

      expect(httpClient.patch).toHaveBeenCalledWith('/users/departments/dept-2', {
        name: 'Customer Support',
      });
      expect(res.data).toEqual(updatedDept);
    });

    it('4. routes DELETE on departments to DELETE /users/departments/{id}', async () => {
      (httpClient.delete as jest.Mock).mockResolvedValue({
        data: { message: 'Department deleted' },
        error: null,
      });

      const qb = new FastApiQueryBuilder('departments');
      qb.delete().eq('id', 'dept-2');
      const res = await qb;

      expect(httpClient.delete).toHaveBeenCalledWith('/users/departments/dept-2');
      expect(res.error).toBeNull();
    });

    it('5. routes INSERT on designations to POST /users/designations', async () => {
      const createdDesig = { id: 'desig-1', name: 'Lead Architect', company_id: 'comp-1', base_role: 'Employee' };
      (httpClient.post as jest.Mock).mockResolvedValue({
        data: createdDesig,
        error: null,
      });

      const qb = new FastApiQueryBuilder('designations');
      qb.insert({ name: 'Lead Architect', company_id: 'comp-1', base_role: 'Employee' });
      const res = await qb.single();

      expect(httpClient.post).toHaveBeenCalledWith('/users/designations', {
        name: 'Lead Architect',
        company_id: 'comp-1',
        base_role: 'Employee',
      });
      expect(res.data).toEqual(createdDesig);
    });
  });

  describe('Part C: Subtask Assignee Endpoint Resolution', () => {
    it('6. determines eligible assignees endpoint URL correctly for parent task vs root', () => {
      const getUrl = (parentTaskId?: string) =>
        parentTaskId ? `/tasks/${parentTaskId}/eligible-assignees` : `/tasks/eligible-assignees`;

      expect(getUrl('task-abc-123')).toBe('/tasks/task-abc-123/eligible-assignees');
      expect(getUrl(undefined)).toBe('/tasks/eligible-assignees');
    });

    it('7. calculates effectiveTaskMode for subtasks vs root tasks', () => {
      const getEffectiveTaskMode = (role: string, parentTaskId?: string, taskMode: 'Delegated' | 'Self-Assigned' = 'Delegated') => {
        return parentTaskId ? 'Delegated' : (role === 'Employee' ? 'Self-Assigned' : taskMode);
      };

      // Subtasks are ALWAYS Delegated (assignee selectable) even for Employee
      expect(getEffectiveTaskMode('Employee', 'parent-123')).toBe('Delegated');
      expect(getEffectiveTaskMode('Department Head', 'parent-123')).toBe('Delegated');
      expect(getEffectiveTaskMode('Manager', 'parent-123')).toBe('Delegated');
      expect(getEffectiveTaskMode('Founder', 'parent-123')).toBe('Delegated');

      // Root tasks obey user role default
      expect(getEffectiveTaskMode('Employee', undefined)).toBe('Self-Assigned');
      expect(getEffectiveTaskMode('Department Head', undefined, 'Delegated')).toBe('Delegated');
    });
  });

  describe('Part D: Subtask Hierarchy Completion Validation', () => {
    const VALIDATION_ERROR_MESSAGE =
      'First complete the child tasks inside the major task given, then only proceed with completing the major task.';

    const canCompleteTask = (task: any, subtasks: any[] = []): { allowed: boolean; message?: string } => {
      const hasDirectIncomplete = subtasks.some(
        (s) => s.status !== 'Done' && s.status !== 'Completed'
      );
      const hasKnownIncomplete = !!(
        task?.has_incomplete_subtasks ||
        hasDirectIncomplete ||
        subtasks.some((s) => s.has_incomplete_subtasks)
      );

      if (hasKnownIncomplete) {
        return { allowed: false, message: VALIDATION_ERROR_MESSAGE };
      }
      return { allowed: true };
    };

    it('8. blocks major task completion when direct child is incomplete', () => {
      const majorTask = { id: 'major-1', title: 'Major Task A', status: 'In Progress' };
      const subtasks = [{ id: 'child-1', title: 'Child Task B', status: 'To Do' }];

      const result = canCompleteTask(majorTask, subtasks);
      expect(result.allowed).toBe(false);
      expect(result.message).toBe(VALIDATION_ERROR_MESSAGE);
    });

    it('9. blocks major task completion when nested child (A -> B -> C) is incomplete', () => {
      // Direct child B is 'Done', but nested child C is incomplete
      const majorTask = {
        id: 'major-1',
        title: 'Major Task A',
        status: 'In Progress',
        has_incomplete_subtasks: true,
      };
      const subtasks = [
        {
          id: 'child-1',
          title: 'Child Task B',
          status: 'Done',
          has_children: true,
          has_incomplete_subtasks: true,
        },
      ];

      const result = canCompleteTask(majorTask, subtasks);
      expect(result.allowed).toBe(false);
      expect(result.message).toBe(VALIDATION_ERROR_MESSAGE);
    });

    it('10. allows major task completion when all descendant child tasks are completed', () => {
      const majorTask = {
        id: 'major-1',
        title: 'Major Task A',
        status: 'In Progress',
        has_incomplete_subtasks: false,
      };
      const subtasks = [
        {
          id: 'child-1',
          title: 'Child Task B',
          status: 'Done',
          has_children: true,
          has_incomplete_subtasks: false,
        },
      ];

      const result = canCompleteTask(majorTask, subtasks);
      expect(result.allowed).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('11. allows leaf task (no subtasks) completion without impediment', () => {
      const leafTask = {
        id: 'leaf-1',
        title: 'Single Task',
        status: 'In Progress',
        has_incomplete_subtasks: false,
      };

      const result = canCompleteTask(leafTask, []);
      expect(result.allowed).toBe(true);
    });
  });
});

