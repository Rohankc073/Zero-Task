import { supabase } from '../../lib/supabase';

export interface UserWorkload {
  userId: string;
  fullName: string;
  role: string;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  capacityPercentage?: number; // Just a mock calculation based on active tasks
}

export class WorkloadService {
  /**
   * Fetch workload for a specific department or all users if no department specified.
   */
  static async getWorkload(departmentId?: string): Promise<UserWorkload[]> {
    let usersQuery = supabase
      .from('users')
      .select('id, full_name, role');
      
    if (departmentId) {
      usersQuery = usersQuery.eq('department_id', departmentId);
    }

    const { data: users, error: usersError } = await usersQuery;
    
    if (usersError || !users) {
      console.error('Error fetching users for workload:', usersError);
      return [];
    }

    // Now fetch tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, user_id, status, due_date')
      .in('user_id', users.map(u => u.id));

    if (tasksError) {
      console.error('Error fetching tasks for workload:', tasksError);
      return [];
    }

    const workloads: UserWorkload[] = users.map(user => {
      const userTasks = tasks?.filter(t => t.user_id === user.id) || [];
      const active = userTasks.filter(t => t.status === 'To Do' || t.status === 'In Progress').length;
      const completed = userTasks.filter(t => t.status === 'Done').length;
      const overdue = userTasks.filter(t => {
        if (t.status === 'Done' || !t.due_date) return false;
        return new Date(t.due_date) < new Date();
      }).length;
      
      // Calculate capacity: assume 10 tasks is 100% capacity
      const capacityPercentage = Math.min(Math.round((active / 10) * 100), 100);

      return {
        userId: user.id,
        fullName: user.full_name || 'Unknown',
        role: user.role,
        activeTasks: active,
        completedTasks: completed,
        overdueTasks: overdue,
        capacityPercentage
      };
    });

    return workloads;
  }
}
