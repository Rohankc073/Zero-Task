export type TaskStatus = 'To Do' | 'In Progress' | 'Awaiting Review' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface Company {
  id: string;
  name: string;
  code?: string;
  industry?: string;
  is_active?: boolean;
  status?: 'Active' | 'Inactive' | 'Suspended';
  created_at: string;
  founder?: User | null; // Joined founder
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  user_id: string;
  project_id?: string | null;
  parent_task_id?: string | null;
  milestone_id?: string | null;
  progress?: number;
  department_id?: string | null;
  company_id?: string | null;
  execution_classification?: string;
  meeting_id?: string | null;
  created_by?: string | null;
  is_private?: boolean | null;
  created_at?: string;
  updated_at?: string;
  subtasks?: Task[]; // Nested tasks for Execution Tree
  assignee?: User;
  creator?: User;
}

export type NewTask = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'subtasks'>;

export interface TaskFile {
  id: string;
  task_id: string;
  user_id: string;
  file_url: string;
  file_type: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  storage_path?: string | null;
  created_at: string;
  user?: User;
}

export type TaskAttachment = TaskFile;

export type UserRole = 'Founder' | 'Super Admin' | 'Department Head' | 'Manager' | 'Employee' | 'Execution Team';

export interface User {
  id: string;
  email?: string;
  name?: string;
  full_name?: string;
  avatar_url?: string | null;
  phone_number?: string | null;
  push_token?: string | null;
  role?: UserRole;
  department_id?: string | null;
  designation_id?: string | null;
  company_id?: string | null;
  onboarding_completed?: boolean;
  organization_name?: string | null;
  subscription_status?: string | null;
  is_approved?: boolean;
  is_active?: boolean;
  is_deleted?: boolean;
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

export interface Department {
  id: string;
  name: string;
  company_id?: string | null;
  description?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Designation {
  id: string;
  company_id?: string | null;
  name: string;
  description?: string | null;
  base_role?: UserRole;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'Active' | 'On Hold' | 'Completed';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string;
  department_id?: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  owner_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  progress?: number; // Calculated percentage
}

export interface ExecutionActivity {
  id: string;
  task_id?: string | null;
  project_id?: string | null;
  milestone_id?: string | null;
  user_id?: string | null;
  event_type: string;
  metadata?: any;
  created_at: string;
  user?: User; // Joined user data
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
  is_private?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface MeetingParticipant {
  meeting_id: string;
  user_id: string;
  user?: User; // Joined user data
}

export interface MeetingFile {
  id: string;
  meeting_id: string;
  user_id: string | null;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  created_at: string;
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

export type ChatChannelType = 'public' | 'department' | 'management' | 'direct';

export interface ChatChannel {
  id: string;
  name: string;
  type: ChatChannelType;
  department_id?: string | null;
  company_id?: string | null;
  participant_one_id?: string | null;
  participant_two_id?: string | null;
  other_user?: User;
  is_private?: boolean | null;
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

export type EntityNotificationState = 
  | 'TASK_CREATED' 
  | 'TASK_ASSIGNED' 
  | 'TASK_SELF_ASSIGNED' 
  | 'TASK_IN_PROGRESS' 
  | 'TASK_COMPLETED' 
  | 'TASK_DELETED' 
  | 'TASK_DEADLINE_CHANGED' 
  | 'TASK_OVERDUE' 
  | 'TASK_SEGREGATED' 
  | 'PENDING' 
  | 'APPROVED' 
  | 'REJECTED';

export interface InAppNotification {
  id: string;
  user_id: string;
  task_id?: string | null;
  entity_type?: string;
  entity_id?: string | null;
  entity_title?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  department_name?: string | null;
  entity_state?: EntityNotificationState | string | null;
  metadata?: Record<string, any> | null;
  title: string;
  message: string;
  is_read: boolean;
  action_url?: string | null;
  type: string;
  created_at: string;
  updated_at?: string;
}

export type PhoneChangeStatus = 'Pending' | 'Approved' | 'Rejected';

export interface PhoneChangeRequest {
  id: string;
  user_id: string;
  new_phone_number: string;
  status: PhoneChangeStatus;
  approver_id?: string | null;
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  requester?: User;
  approver?: User;
}
