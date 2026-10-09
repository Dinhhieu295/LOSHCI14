export interface User { id: string; email: string; fullName: string; dob: string | null; avatarUrl: string | null; phone: string | null; location: string | null; bio: string | null }
export interface Project { id: string; title: string; description: string; tag: string; priority: string; status: string; progress: number; daysLeft: number; isPinned: boolean; members: string[]; updatedAt: string }
export interface ProjectTask { id: string; projectId: string; title: string; priority: string; dueDate: string | null; status: string; isDone: boolean; assignee: string; estimate: string; createdAt: string; updatedAt: string }
export interface Course { id: string; name: string; code: string; semester: string; instructor: string; grade: string; credits: number; progress: number; color: string }
export interface CourseSession { id: string; courseId: string; weekday: number; startTime: string; endTime: string; periodStart: number; periodEnd: number; location: string; room: string; color: string }
export interface StudyLog { id: string; courseId: string | null; date: string; durationMinutes: number; note: string }
export interface Assignment { id: string; title: string; deadline: string; status: string; priority: string; courseId: string | null }
export interface StudySummary { activeCourses: number; totalStudyHours: number; targetStudyHours: number; pendingAssignments: number; assignments: number }
export interface PersonalState { coins: number; growthXP: number; streak: number; lastLoginDate: string; selectedSeed: string; shopItems: unknown[]; history: unknown[] }

const TOKEN_KEY = 'lifeos_token';
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/api${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/register') setToken(null);
    throw new Error(payload?.error?.message || 'Không thể kết nối tới máy chủ.');
  }
  return payload as T;
}

export function signIn(email: string, password: string, mode: 'login' | 'register', fullName?: string) {
  return api<{ user: User; token: string; expiresAt: string }>(`/auth/${mode}`, {
    method: 'POST', body: JSON.stringify(mode === 'login' ? { email, password } : { email, password, fullName }),
  });
}
