import { supabase } from '../../lib/supabase';
import { Project, ProjectMilestone, Task } from '../../types';

export class ProjectService {
  /**
   * Fetch a project with its milestones and tasks.
   */
  static async getProjectDetails(projectId: string): Promise<{ project: Project | null, milestones: ProjectMilestone[], tasks: Task[] }> {
    // 1. Fetch Project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('Error fetching project:', projectError);
      return { project: null, milestones: [], tasks: [] };
    }

    // 2. Fetch Milestones
    const { data: milestones, error: milestonesError } = await supabase
      .from('project_milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (milestonesError) {
      console.error('Error fetching project milestones:', milestonesError);
    }

    // 3. Fetch Tasks
    const milestoneIds = (milestones || []).map(m => m.id);
    let tasks: any[] = [];
    if (milestoneIds.length > 0) {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          *,
          assignees:task_assignees(user:users!user_id(id, full_name, role))
        `)
        .in('milestone_id', milestoneIds)
        .order('created_at', { ascending: false });

      if (tasksError) {
        console.error('Error fetching project tasks:', tasksError);
      } else {
        tasks = tasksData || [];
      }
    }

    const processedMilestones = (milestones || []).map(m => {
      const milestoneTasks = (tasks || []).filter((t: any) => t.milestone_id === m.id);
      const total = milestoneTasks.length;
      const completed = milestoneTasks.filter((t: any) => t.status === 'Done').length;
      return {
        ...m,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0
      };
    });

    return { 
      project: project as Project, 
      milestones: processedMilestones as ProjectMilestone[], 
      tasks: (tasks || []) as any[] 
    };
  }

  /**
   * Create a new milestone for a project
   */
  static async createMilestone(
    projectId: string,
    title: string,
    description: string,
    dueDate: string,
    creatorId: string
  ): Promise<ProjectMilestone | null> {
    const { data, error } = await supabase
      .from('project_milestones')
      .insert({
        project_id: projectId,
        title,
        description: description || null,
        due_date: dueDate || null,
        created_by: creatorId,
        owner_id: creatorId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating milestone:', error);
      return null;
    }

    return data as ProjectMilestone;
  }
}
