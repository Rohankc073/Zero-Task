export type TaskStatus = 'To Do' | 'In Progress' | 'Awaiting Review' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  user_id: string;
  parent_task_id?: string | null;
  progress?: number;
  department_id?: string | null;
  meeting_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type NewTask = Omit<Task, 'id' | 'created_at' | 'updated_at'>;

export interface TaskFile {
  id: string;
  task_id: string;
  user_id: string;
  file_url: string;
  file_type: string | null;
  file_name?: string | null;
  created_at: string;
}

export type TaskAttachment = TaskFile;

export type UserRole = 'Founder' | 'Department Head' | 'Manager' | 'Employee';

export interface User {
  id: string;
  email?: string;
  name?: string;
  full_name?: string;
  avatar_url?: string | null;
  push_token?: string | null;
  role?: UserRole;
  department_id?: string | null;
  onboarding_completed?: boolean;
  organization_name?: string | null;
  subscription_status?: string | null;
  is_approved?: boolean;
  preferences?: {
    push_notifications?: boolean;
    in_app_alerts?: boolean;
  } | null;
}

export type RegistrationStatus = 'Pending' | 'Approved' | 'Rejected';

export interface RegistrationRequest {
  id: string;
  email: string;
  requested_role: UserRole;
  status: RegistrationStatus;
  rejected_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityComment {
  id: string;
  content: string;
  user_id: string;
  task_id: string;
  created_at: string;
  user?: User; // Joined user data
}

export type Comment = ActivityComment;

export type ProjectStatus = 'Active' | 'On Hold' | 'Completed';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  agenda: string | null;
  start_time: string;
  end_time: string;
  organizer_id: string;
  project_id?: string | null;
  project?: { id: string; name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface MeetingParticipant {
  meeting_id: string;
  user_id: string;
  user?: User; // Joined user data
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  task_id: string;
  requester_id: string;
  approver_id: string;
  status: ApprovalStatus;
  comments?: string | null;
  created_at: string;
  updated_at: string;
  task?: Task; // Joined task
  requester?: User; // Joined user
  approver?: User; // Joined user
}

export type NotificationType = 'approval' | 'mention' | 'reminder';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  is_read: boolean;
  type?: NotificationType;
  created_at: string;
}

export type ChatChannelType = 'public' | 'department' | 'management';

export interface ChatChannel {
  id: string;
  name: string;
  type: ChatChannelType;
  department_id?: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string | null;
  attachment_url?: string;
  attachment_name?: string;
  created_at: string;
  user?: User; // Joined user data
}

export type SystemAlertType = 'Milestone' | 'Critical' | 'System';
export type MilestoneType = 'Early Completion' | 'Streak' | 'High Priority Close';

export interface SystemAlert {
  id: string;
  department_id?: string | null;
  message: string;
  type: SystemAlertType;
  created_at: string;
}

export interface TaskMilestone {
  id: string;
  user_id: string;
  milestone_type: MilestoneType;
  points: number;
  created_at: string;
}

export interface DepartmentMilestone {
  id: string;
  department_id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  is_achieved: boolean;
  created_at: string;
}

export type AuditActionType = 'TASK_CREATE' | 'TASK_UPDATE' | 'TASK_DELETE' | 'MILESTONE_UPDATE' | 'USER_APPROVED';

export interface AuditLog {
  id: string;
  user_id: string;
  action_type: AuditActionType;
  description: string;
  created_at: string;
  user?: User; // Joined user data
}
