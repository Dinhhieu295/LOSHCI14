import type { Generated } from 'kysely';

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
  project_id: string;
  title: string;
  priority: string;
  subtasks_done: number;
  subtasks_total: number;
  due_date: string | null;
  assignee: string;
  status: string;
  is_done: number;
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
  attendance: number;
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
  coins: number;
  growth_xp: number;
  streak: number;
  last_login_date: string;
  selected_seed: string;
  shop_items_json: string;
  history_json: string;
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
}

export type NewRow<T> = Omit<T, keyof { id: Generated<string> }>;
