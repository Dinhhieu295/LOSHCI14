export interface AccountUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  dob: string | null;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PublicUser = Omit<AccountUser, 'passwordHash'>;

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  tag: string;
  priority: string;
  status: string;
  progress: number;
  daysLeft: number;
  isPinned: boolean;
  members: string[];
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type ProjectPatch = Partial<ProjectInput>;

export interface CalendarTime {
  date: string;
  start: number;
  end: number;
}

export type TaskCategory = 'employment' | 'personal';

export interface Task {
  id: string;
  projectId: string | null;
  category: TaskCategory | null;
  fixedSlot: CalendarTime | null;
  title: string;
  priority: string;
  subtasksDone: number;
  subtasksTotal: number;
  dueDate: string | null;
  assignee: string;
  status: string;
  isDone: boolean;
  completedAt: string | null;
  estimate: string;
  actual: string;
  startDay: number;
  durationDays: number;
  baselineStart: number;
  baselineDuration: number;
  isMilestone: boolean;
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
}

export type TaskInput = Omit<Task, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'completedAt' | 'fixedSlot' | 'category'> &
  { fixedSlot?: CalendarTime | null; category?: TaskCategory };
export type TaskPatch = Partial<TaskInput>;

export type StudyResourceName = 'courses' | 'assignments' | 'exams' | 'notes' | 'schedule' | 'course-sessions' | 'study-logs';
export type StudyItem = Record<string, unknown> & { id: string; createdAt: string; updatedAt: string };

export interface StudySummary {
  semester: string | null;
  activeCourses: number;
  totalStudyHours: number;
  targetStudyHours: number;
  pendingAssignments: number;
  assignments: number;
}

export interface PersonalState {
  userId: string;
  streak: number;
  lastLoginDate: string;
  updatedAt: string;
}

export interface AvailabilityWindow {
  weekday: number;
  start: string;
  end: string;
}

export type StudyPreference = 'more' | 'less';
