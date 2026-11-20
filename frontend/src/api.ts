export type NoticeType = 'success' | 'error' | 'info' | 'warning';

export interface NoticePayload {
  message: string;
  type?: NoticeType;
  retry?: () => void;
  retryLabel?: string;
}

export type NoticeInput = string | NoticePayload;
export type NoticeHandler = (notice: NoticeInput) => void;

export interface User {
  id: string;
  email: string;
  fullName: string;
  dob: string | null;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
}

export interface Project {
  id: string;
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
  createdAt?: string;
  updatedAt: string;
}

export type TaskCategory = 'employment' | 'personal';

export interface ProjectTask {
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

export interface Course {
  id: string;
  name: string;
  code: string;
  semester: string;
  instructor: string;
  credits: number;
  progress: number;
  score10: number | null;
  grade: string;
  attendance: number;
  studyHours: number;
  aimStudyHours: number;
  color: string;
  status: 'Active' | 'Archived';
}

export interface CourseSession {
  id: string;
  courseId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  periodStart: number;
  periodEnd: number;
  location: string;
  room: string;
  color: string;
}

export interface StudyLog {
  id: string;
  courseId: string | null;
  date: string;
  durationMinutes: number;
  note: string;
}

export interface Assignment {
  id: string;
  title: string;
  deadline: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Overdue' | string;
  prevStatus?: 'Not Started' | 'In Progress' | 'Overdue' | null;
  priority: 'High' | 'Medium' | 'Low' | string;
  courseId: string | null;
  estimatedTime?: string;
}

export interface Exam {
  id: string;
  title: string;
  courseId: string | null;
  date: string;
  type: 'Quiz' | 'Midterm' | 'Final' | 'Certification';
  weight: number;
  prepProgress: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudyNote {
  id: string;
  title: string;
  courseId: string | null;
  content: string;
  date: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  time: string;
  color: string;
  date: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudySummary {
  semester?: string | null;
  activeCourses: number;
  totalStudyHours: number;
  targetStudyHours: number;
  pendingAssignments: number;
  assignments: number;
}

export interface PersonalState {
  streak: number;
  lastLoginDate: string;
}

export interface AvailabilityWindow {
  weekday: number;
  start: string;
  end: string;
}

export type StudyPreference = 'more' | 'less';

export interface PlanningSettings {
  availability: AvailabilityWindow[] | null;
  feedback: { courseId: string; preference: StudyPreference }[];
}

export interface CalendarTime {
  date: string;
  start: number;
  end: number;
}

export interface CalendarTaskInput extends CalendarTime {
  taskId: string;
}

export interface CalendarTaskBlock extends CalendarTaskInput {
  id: string;
}

const TOKEN_KEY = 'lifeos_token';
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/api${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
      setToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('lifeos:unauthorized'));
      }
    }
    throw new Error(payload?.error?.message || 'Không thể kết nối tới máy chủ.');
  }
  return payload as T;
}

export function signIn(email: string, password: string, mode: 'login' | 'register', fullName?: string) {
  return api<{ user: User; token: string; expiresAt: string }>(`/auth/${mode}`, {
    method: 'POST',
    body: JSON.stringify(mode === 'login' ? { email, password } : { email, password, fullName }),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api<void>('/profile/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
