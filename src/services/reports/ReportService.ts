import { Period } from '../../components/ui/PeriodSelector';
import { getPeriodDateRanges } from '../../hooks/useDashboards';

export interface ReportSummary {
  totalTasks: number;
  activeTasks: number;
  inProgressTasks: number;
  toDoTasks: number;
  completedTasks: number;
  overdueTasks: number;
  remainingTasks: number;
  avgProgress: number;
  completionRate: number;
  onTimeCompletions: number;
  lateCompletions: number;
  deadlineAdherenceRate: number;
}

export interface ProgressDistribution {
  zero: number;         // 0%
  tier1: number;        // 1-25%
  tier2: number;        // 26-50%
  tier3: number;        // 51-75%
  tier4: number;        // 76-99%
  complete: number;     // 100%
}

export interface OverdueAnalysis {
  totalOverdue: number;
  oneDay: number;
  twoToThreeDays: number;
  fourToSevenDays: number;
  eightToFourteenDays: number;
  fifteenPlusDays: number;
  byPriority: Record<string, number>;
  byDepartment: Record<string, number>;
}

export interface DepartmentReportItem {
  id: string;
  name: string;
  totalTasks: number;
  activeTasks: number;
  toDoTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  remainingTasks: number;
  avgProgress: number;
  completionRate: number;
}

export interface TeamReportItem {
  managerId: string;
  managerName: string;
  departmentName: string;
  totalTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  remainingTasks: number;
  avgProgress: number;
  completionRate: number;
}

export interface IndividualReportItem {
  id: string;
  name: string;
  role: string;
  departmentName: string;
  assignedTasks: number;
  selfAssignedTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  remainingTasks: number;
  avgProgress: number;
  completionRate: number;
}

export interface PriorityReportItem {
  priority: string;
  total: number;
  inProgress: number;
  completed: number;
  overdue: number;
  remaining: number;
}

export interface ScopeReportItem {
  scope: string;
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
}

export interface SelfAssignedReportItem {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  remaining: number;
  completionRate: number;
}

export interface CompleteReportData {
  period: Period;
  generatedAt: string;
  summary: ReportSummary;
  progressDistribution: ProgressDistribution;
  overdueAnalysis: OverdueAnalysis;
  departmentPerformance: DepartmentReportItem[];
  teamPerformance: TeamReportItem[];
  individualPerformance: IndividualReportItem[];
  priorityAnalysis: PriorityReportItem[];
  scopeAnalysis: ScopeReportItem[];
  selfAssignedAnalysis: SelfAssignedReportItem;
  filteredTasks: any[];
}

export interface ReportFilterOptions {
  departmentId?: string;
  priority?: string;
  status?: string;
  scope?: string;
  assigneeId?: string;
}

export class ReportService {
  /**
   * Generates a complete canonical report from raw database collections.
   */
  static generateReport(
    allTasks: any[],
    users: any[],
    departments: any[],
    period: Period = 'All Time',
    filters: ReportFilterOptions = {}
  ): CompleteReportData {
    const now = new Date();
    const { start, end } = getPeriodDateRanges(period);

    // 1. Period Filtering (Distinct Task Identity)
    let periodTasks = allTasks.filter(t => {
      if (!start && !end) return true; // All Time
      const taskDate = new Date(t.created_at || t.completed_at || now);
      const completedDate = t.completed_at ? new Date(t.completed_at) : null;
      const dueDate = t.due_date ? new Date(t.due_date) : null;

      if (start && end) {
        return (
          (taskDate >= start && taskDate <= end) ||
          (completedDate && completedDate >= start && completedDate <= end) ||
          (dueDate && dueDate >= start && dueDate <= end)
        );
      }
      if (start) {
        return taskDate >= start || (completedDate && completedDate >= start);
      }
      return true;
    });

    // 2. Custom Criteria Filtering
    if (filters.departmentId && filters.departmentId !== 'ALL') {
      periodTasks = periodTasks.filter(t => t.department_id === filters.departmentId);
    }
    if (filters.priority && filters.priority !== 'ALL') {
      periodTasks = periodTasks.filter(t => t.priority?.toUpperCase() === filters.priority?.toUpperCase());
    }
    if (filters.status && filters.status !== 'ALL') {
      if (filters.status === 'Overdue') {
        periodTasks = periodTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'Done' && t.status !== 'Completed');
      } else {
        periodTasks = periodTasks.filter(t => t.status?.toLowerCase() === filters.status?.toLowerCase());
      }
    }
    if (filters.scope && filters.scope !== 'ALL') {
      if (filters.scope === 'General') periodTasks = periodTasks.filter(t => !t.department_id);
      if (filters.scope === 'Department') periodTasks = periodTasks.filter(t => !!t.department_id);
      if (filters.scope === 'Cross-Functional') periodTasks = periodTasks.filter(t => t.execution_classification === 'Cross-Functional');
      if (filters.scope === 'Executive') periodTasks = periodTasks.filter(t => t.execution_classification === 'Executive');
    }
    if (filters.assigneeId && filters.assigneeId !== 'ALL') {
      periodTasks = periodTasks.filter(t => 
        t.task_assignees?.some((a: any) => a.user_id === filters.assigneeId) || t.created_by === filters.assigneeId
      );
    }

    // 3. KPI Summaries & Progress Calculation
    let totalTasks = periodTasks.length;
    let inProgressTasks = 0;
    let toDoTasks = 0;
    let completedTasks = 0;
    let overdueTasks = 0;
    let totalProgress = 0;
    let onTimeCompletions = 0;
    let lateCompletions = 0;

    const progressDistribution: ProgressDistribution = {
      zero: 0,
      tier1: 0,
      tier2: 0,
      tier3: 0,
      tier4: 0,
      complete: 0,
    };

    const overdueAnalysis: OverdueAnalysis = {
      totalOverdue: 0,
      oneDay: 0,
      twoToThreeDays: 0,
      fourToSevenDays: 0,
      eightToFourteenDays: 0,
      fifteenPlusDays: 0,
      byPriority: { Urgent: 0, High: 0, Medium: 0, Low: 0 },
      byDepartment: {},
    };

    periodTasks.forEach(t => {
      const isDone = t.status === 'Done' || t.status === 'Completed';
      const isProg = t.status === 'In Progress';
      const isToDo = t.status === 'To Do' || t.status === 'Pending';
      const dueDate = t.due_date ? new Date(t.due_date) : null;
      const isOverdue = !!(dueDate && dueDate < now && !isDone);

      if (isDone) completedTasks++;
      if (isProg) inProgressTasks++;
      if (isToDo) toDoTasks++;
      if (isOverdue) overdueTasks++;

      // Progress value
      let p = 0;
      if (t.progress !== null && t.progress !== undefined && !isNaN(Number(t.progress))) {
        p = Number(t.progress);
      } else if (isDone) {
        p = 100;
      } else if (isProg) {
        p = 50;
      } else {
        p = 0;
      }
      p = Math.min(100, Math.max(0, p));
      totalProgress += p;

      // Progress Brackets
      if (p === 0) progressDistribution.zero++;
      else if (p <= 25) progressDistribution.tier1++;
      else if (p <= 50) progressDistribution.tier2++;
      else if (p <= 75) progressDistribution.tier3++;
      else if (p < 100) progressDistribution.tier4++;
      else progressDistribution.complete++;

      // Deadline adherence
      if (isDone) {
        if (dueDate) {
          const compDate = t.completed_at ? new Date(t.completed_at) : new Date(t.updated_at || now);
          if (compDate <= dueDate) {
            onTimeCompletions++;
          } else {
            lateCompletions++;
          }
        } else {
          onTimeCompletions++;
        }
      }

      // Overdue duration analysis
      if (isOverdue && dueDate) {
        overdueAnalysis.totalOverdue++;
        const days = Math.max(1, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        if (days === 1) overdueAnalysis.oneDay++;
        else if (days <= 3) overdueAnalysis.twoToThreeDays++;
        else if (days <= 7) overdueAnalysis.fourToSevenDays++;
        else if (days <= 14) overdueAnalysis.eightToFourteenDays++;
        else overdueAnalysis.fifteenPlusDays++;

        // Priority breakdown of overdue
        const pKey = t.priority || 'Medium';
        overdueAnalysis.byPriority[pKey] = (overdueAnalysis.byPriority[pKey] || 0) + 1;

        // Department breakdown of overdue
        const deptName = t.departments?.name || 'General';
        overdueAnalysis.byDepartment[deptName] = (overdueAnalysis.byDepartment[deptName] || 0) + 1;
      }
    });

    const activeTasks = inProgressTasks + toDoTasks;
    const remainingTasks = Math.max(0, totalTasks - completedTasks);
    const avgProgress = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const totalFinishedWithDeadlines = onTimeCompletions + lateCompletions;
    const deadlineAdherenceRate = totalFinishedWithDeadlines > 0
      ? Math.round((onTimeCompletions / totalFinishedWithDeadlines) * 100)
      : 100;

    const summary: ReportSummary = {
      totalTasks,
      activeTasks,
      inProgressTasks,
      toDoTasks,
      completedTasks,
      overdueTasks,
      remainingTasks,
      avgProgress,
      completionRate,
      onTimeCompletions,
      lateCompletions,
      deadlineAdherenceRate,
    };

    // 4. Department Performance Breakdown
    const deptMap: Record<string, DepartmentReportItem> = {};
    departments.forEach(d => {
      deptMap[d.id] = {
        id: d.id,
        name: d.name,
        totalTasks: 0,
        activeTasks: 0,
        toDoTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        remainingTasks: 0,
        avgProgress: 0,
        completionRate: 0,
      };
    });

    // Also include General (no department) if tasks exist
    deptMap['general'] = {
      id: 'general',
      name: 'General',
      totalTasks: 0,
      activeTasks: 0,
      toDoTasks: 0,
      inProgressTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      remainingTasks: 0,
      avgProgress: 0,
      completionRate: 0,
    };

    const deptProgressSums: Record<string, number> = {};

    periodTasks.forEach(t => {
      const dId = t.department_id || 'general';
      if (deptMap[dId]) {
        const item = deptMap[dId];
        const isDone = t.status === 'Done' || t.status === 'Completed';
        const isProg = t.status === 'In Progress';
        const isToDo = t.status === 'To Do' || t.status === 'Pending';
        const isOver = t.due_date && new Date(t.due_date) < now && !isDone;

        item.totalTasks++;
        if (isDone) item.completedTasks++;
        if (isProg) item.inProgressTasks++;
        if (isToDo) item.toDoTasks++;
        if (isOver) item.overdueTasks++;

        let p = 0;
        if (t.progress !== null && t.progress !== undefined && !isNaN(Number(t.progress))) p = Number(t.progress);
        else if (isDone) p = 100;
        else if (isProg) p = 50;
        deptProgressSums[dId] = (deptProgressSums[dId] || 0) + p;
      }
    });

    const departmentPerformance: DepartmentReportItem[] = Object.values(deptMap)
      .map(item => {
        const total = item.totalTasks;
        item.activeTasks = item.inProgressTasks + item.toDoTasks;
        item.remainingTasks = Math.max(0, total - item.completedTasks);
        item.avgProgress = total > 0 ? Math.round((deptProgressSums[item.id] || 0) / total) : 0;
        item.completionRate = total > 0 ? Math.round((item.completedTasks / total) * 100) : 0;
        return item;
      })
      .filter(item => item.totalTasks > 0)
      .sort((a, b) => b.totalTasks - a.totalTasks);

    // 5. Individual Performance Breakdown
    const userMap: Record<string, IndividualReportItem> = {};
    const userProgressSums: Record<string, number> = {};

    users.forEach(u => {
      const dept = departments.find(d => d.id === u.department_id);
      userMap[u.id] = {
        id: u.id,
        name: u.full_name || 'User',
        role: u.role || 'Employee',
        departmentName: dept?.name || 'General',
        assignedTasks: 0,
        selfAssignedTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        overdueTasks: 0,
        remainingTasks: 0,
        avgProgress: 0,
        completionRate: 0,
      };
    });

    periodTasks.forEach(t => {
      const isDone = t.status === 'Done' || t.status === 'Completed';
      const isProg = t.status === 'In Progress';
      const isOver = t.due_date && new Date(t.due_date) < now && !isDone;
      const isSelf = t.created_by && t.task_assignees?.some((a: any) => a.user_id === t.created_by);

      let p = 0;
      if (t.progress !== null && t.progress !== undefined && !isNaN(Number(t.progress))) p = Number(t.progress);
      else if (isDone) p = 100;
      else if (isProg) p = 50;

      // Track assignees
      if (t.task_assignees && t.task_assignees.length > 0) {
        t.task_assignees.forEach((a: any) => {
          const uid = a.user_id;
          if (uid && userMap[uid]) {
            const item = userMap[uid];
            item.assignedTasks++;
            if (isDone) item.completedTasks++;
            if (isProg) item.inProgressTasks++;
            if (isOver) item.overdueTasks++;
            if (isSelf && t.created_by === uid) item.selfAssignedTasks++;
            userProgressSums[uid] = (userProgressSums[uid] || 0) + p;
          }
        });
      }
    });

    const individualPerformance: IndividualReportItem[] = Object.values(userMap)
      .map(item => {
        const total = item.assignedTasks;
        item.remainingTasks = Math.max(0, total - item.completedTasks);
        item.avgProgress = total > 0 ? Math.round((userProgressSums[item.id] || 0) / total) : 0;
        item.completionRate = total > 0 ? Math.round((item.completedTasks / total) * 100) : 0;
        return item;
      })
      .filter(item => item.assignedTasks > 0)
      .sort((a, b) => b.assignedTasks - a.assignedTasks);

    // 6. Team / Manager Performance
    const managers = users.filter(u => u.role === 'Manager' || u.role === 'Department Head');
    const teamPerformance: TeamReportItem[] = managers
      .map(mgr => {
        const dept = departments.find(d => d.id === mgr.department_id);
        const deptTasks = periodTasks.filter(t => t.department_id === mgr.department_id);
        const total = deptTasks.length;
        const comp = deptTasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
        const inProg = deptTasks.filter(t => t.status === 'In Progress').length;
        const over = deptTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'Done' && t.status !== 'Completed').length;
        const progSum = deptTasks.reduce((acc, t) => {
          let p = t.progress ? Number(t.progress) : (t.status === 'Done' ? 100 : (t.status === 'In Progress' ? 50 : 0));
          return acc + p;
        }, 0);

        return {
          managerId: mgr.id,
          managerName: mgr.full_name,
          departmentName: dept?.name || 'General',
          totalTasks: total,
          inProgressTasks: inProg,
          completedTasks: comp,
          overdueTasks: over,
          remainingTasks: Math.max(0, total - comp),
          avgProgress: total > 0 ? Math.round(progSum / total) : 0,
          completionRate: total > 0 ? Math.round((comp / total) * 100) : 0,
        };
      })
      .filter(t => t.totalTasks > 0)
      .sort((a, b) => b.totalTasks - a.totalTasks);

    // 7. Priority Analysis
    const priorities = ['Urgent', 'High', 'Medium', 'Low'];
    const priorityAnalysis: PriorityReportItem[] = priorities.map(pri => {
      const pTasks = periodTasks.filter(t => (t.priority || 'Medium').toUpperCase() === pri.toUpperCase());
      const total = pTasks.length;
      const completed = pTasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
      const inProgress = pTasks.filter(t => t.status === 'In Progress').length;
      const overdue = pTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'Done' && t.status !== 'Completed').length;

      return {
        priority: pri,
        total,
        inProgress,
        completed,
        overdue,
        remaining: Math.max(0, total - completed),
      };
    });

    // 8. Scope Analysis
    const scopeAnalysis: ScopeReportItem[] = [
      {
        scope: 'General',
        total: periodTasks.filter(t => !t.department_id).length,
        completed: periodTasks.filter(t => !t.department_id && (t.status === 'Done' || t.status === 'Completed')).length,
        inProgress: periodTasks.filter(t => !t.department_id && t.status === 'In Progress').length,
        overdue: periodTasks.filter(t => !t.department_id && t.due_date && new Date(t.due_date) < now && t.status !== 'Done').length,
      },
      {
        scope: 'Department',
        total: periodTasks.filter(t => !!t.department_id).length,
        completed: periodTasks.filter(t => !!t.department_id && (t.status === 'Done' || t.status === 'Completed')).length,
        inProgress: periodTasks.filter(t => !!t.department_id && t.status === 'In Progress').length,
        overdue: periodTasks.filter(t => !!t.department_id && t.due_date && new Date(t.due_date) < now && t.status !== 'Done').length,
      },
    ];

    // 9. Self-Assigned Tasks Analysis
    const selfAssignedTasks = periodTasks.filter(t => 
      t.created_by && t.task_assignees?.some((a: any) => a.user_id === t.created_by)
    );
    const selfTotal = selfAssignedTasks.length;
    const selfComp = selfAssignedTasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
    const selfInProg = selfAssignedTasks.filter(t => t.status === 'In Progress').length;
    const selfOver = selfAssignedTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'Done').length;

    const selfAssignedAnalysis: SelfAssignedReportItem = {
      total: selfTotal,
      completed: selfComp,
      inProgress: selfInProg,
      overdue: selfOver,
      remaining: Math.max(0, selfTotal - selfComp),
      completionRate: selfTotal > 0 ? Math.round((selfComp / selfTotal) * 100) : 0,
    };

    return {
      period,
      generatedAt: new Date().toISOString(),
      summary,
      progressDistribution,
      overdueAnalysis,
      departmentPerformance,
      teamPerformance,
      individualPerformance,
      priorityAnalysis,
      scopeAnalysis,
      selfAssignedAnalysis,
      filteredTasks: periodTasks,
    };
  }
}
