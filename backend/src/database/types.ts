import type { Generated } from 'kysely';

export type AiProvider = 'openai' | 'gemini' | 'groq' | 'ollama';

export interface UsersTable {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  dob: string | null;
  avatar_url: string | null;
  phone: string | null | undefined;
  location: string | null | undefined;
  bio: string | null | undefined;
  created_at: string;
  updated_at: string;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface ProjectsTable {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  tag: string;
  priority: string;
  status: string;
  progress: number;
  days_left: number;
  is_pinned: number;
  members_json: string;
  created_at: string;
  updated_at: string;
}

export interface TasksTable {
  id: string;
  project_id: string | null;
  personal_user_id: string | null;
  category: 'employment' | 'personal' | null;
  fixed_date: string | null;
  fixed_start_minute: number | null;
  fixed_end_minute: number | null;
  title: string;
  priority: string;
  subtasks_done: number;
  subtasks_total: number;
  due_date: string | null;
  assignee: string;
  status: string;
  is_done: number;
  completed_at: string | null;
  estimate: string;
  actual: string;
  start_day: number;
  duration_days: number;
  baseline_start: number;
  baseline_duration: number;
  is_milestone: number;
  dependencies_json: string;
  created_at: string;
  updated_at: string;
}

export interface CoursesTable {
  id: string;
  user_id: string;
  name: string;
  code: string;
  instructor: string;
  credits: number;
  semester: string;
  progress: number;
  score10: number | null;
  grade: string;
  grade_components_json: string;
  attendance: number;
  absences: number | null;
  study_hours: number;
  aim_study_hours: number;
  color: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AssignmentsTable {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  priority: string;
  deadline: string;
  status: string;
  prev_status: string | null;
  estimated_time: string;
  dependencies_json: string;
  created_at: string;
  updated_at: string;
}

export interface ExamsTable {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  date: string;
  type: string;
  weight: number;
  prep_progress: number;
  created_at: string;
  updated_at: string;
}

export interface NotesTable {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  content: string;
  note_date: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItemsTable {
  id: string;
  user_id: string;
  title: string;
  time: string;
  color: string;
  schedule_date: string;
  created_at: string;
  updated_at: string;
}

export interface CourseSessionsTable {
  id: string;
  user_id: string;
  course_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  period_start: number;
  period_end: number;
  location: string;
  room: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface StudyLogsTable {
  id: string;
  user_id: string;
  course_id: string | null;
  log_date: string;
  duration_minutes: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalStatesTable {
  user_id: string;
  streak: number;
  last_login_date: string;
  updated_at: string;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  projects: ProjectsTable;
  tasks: TasksTable;
  courses: CoursesTable;
  assignments: AssignmentsTable;
  exams: ExamsTable;
  notes: NotesTable;
  schedule_items: ScheduleItemsTable;
  course_sessions: CourseSessionsTable;
  study_logs: StudyLogsTable;
  personal_states: PersonalStatesTable;
  study_availability: { user_id: string; windows_json: string };
  study_feedback: { user_id: string; course_id: string; preference: 'more' | 'less' };
  assistant_settings: {
    user_id: string;
    provider: AiProvider;
    model: string;
    encrypted_key: string;
  };
  assistant_connections: Database['assistant_settings'];
  assistant_conversations: {
    user_id: string;
    scope: string;
    messages_json: string;
  };
  task_schedule_blocks: {
    id: string;
    user_id: string;
    task_id: string;
    scheduled_date: string;
    start_minute: number;
    end_minute: number;
  };
  project_task_files: {
    id: string;
    task_id: string | null;
    assignment_id: string | null;
    project_id: string | null;
    course_id: string | null;
    name: string;
    size_bytes: number;
    contents: Buffer;
    created_at: string;
  };
  project_timer_sessions: {
    id: string;
    project_id: string | null;
    course_id: string | null;
    task_id: string | null;
    assignment_id: string | null;
    task_title: string | null;
    started_at: string;
    stopped_at: string | null;
    duration_seconds: number | null;
  };
}

export type NewRow<T> = Omit<T, keyof { id: Generated<string> }>;
