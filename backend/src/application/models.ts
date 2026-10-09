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

export interface Task {
  id: string;
  projectId: string;
  title: string;
  priority: string;
  subtasksDone: number;
  subtasksTotal: number;
  dueDate: string | null;
  assignee: string;
  status: string;
  isDone: boolean;
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

export type TaskInput = Omit<Task, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>;
export type TaskPatch = Partial<TaskInput>;

export type StudyResourceName = 'courses' | 'assignments' | 'exams' | 'notes' | 'schedule';
export type StudyItem = Record<string, unknown> & { id: string; createdAt: string; updatedAt: string };

export interface StudySummary {
  semester: string | null;
  gpa: number;
  activeCourses: number;
  totalStudyHours: number;
  targetStudyHours: number;
  pendingAssignments: number;
  assignments: number;
}

export interface PersonalState {
  userId: string;
  coins: number;
  growthXP: number;
  streak: number;
  lastLoginDate: string;
  selectedSeed: string;
  shopItems: unknown[];
  history: unknown[];
  updatedAt: string;
}

export type PersonalStatePatch = Partial<Pick<PersonalState,
  'coins' | 'growthXP' | 'streak' | 'selectedSeed' | 'shopItems' | 'history'>>;
