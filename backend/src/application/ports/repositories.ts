import type {
  AccountUser, AvailabilityWindow, PersonalState, Project, ProjectInput, ProjectPatch,
  SessionRecord, StudyItem, StudyPreference, StudyResourceName, Task, TaskInput, TaskPatch,
} from '../models.js';

export interface AccountRepository {
  createAccount(user: AccountUser, initialState: PersonalState, session: SessionRecord): Promise<void>;
  findUserByEmail(email: string): Promise<AccountUser | undefined>;
  findUserById(userId: string): Promise<AccountUser | undefined>;
  updateProfile(userId: string, patch: Pick<Partial<AccountUser>, 'fullName' | 'dob' | 'avatarUrl' | 'phone' | 'location' | 'bio'>, updatedAt: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string, updatedAt: string): Promise<void>;
  createSession(session: SessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | undefined>;
  deleteSession(sessionId: string): Promise<void>;
  deleteOtherSessions(userId: string, keepSessionId: string): Promise<void>;
}

export type TaskScope = { projectId: string } | { personalUserId: string };

export interface ProjectRepository {
  listProjects(userId: string): Promise<Project[]>;
  findProject(userId: string, projectId: string): Promise<Project | undefined>;
  createProject(userId: string, input: ProjectInput, id: string, now: string): Promise<Project>;
  updateProject(userId: string, projectId: string, patch: ProjectPatch, now: string): Promise<Project | undefined>;
  deleteProject(userId: string, projectId: string): Promise<boolean>;
  listTasks(scope: TaskScope): Promise<Task[]>;
  createTask(scope: TaskScope, input: TaskInput, id: string, now: string): Promise<Task>;
  updateTask(scope: TaskScope, taskId: string, patch: TaskPatch, now: string): Promise<Task | undefined>;
  deleteTask(scope: TaskScope, taskId: string): Promise<boolean>;
}

export interface StudyRepository {
  listStudyItems(userId: string, resource: StudyResourceName): Promise<StudyItem[]>;
  createStudyItem(userId: string, resource: StudyResourceName, item: Record<string, unknown>, id: string, now: string): Promise<StudyItem>;
  updateStudyItem(userId: string, resource: StudyResourceName, id: string, patch: Record<string, unknown>, now: string): Promise<StudyItem | undefined>;
  deleteStudyItem(userId: string, resource: StudyResourceName, id: string): Promise<boolean>;
  ownsCourse(userId: string, courseId: string): Promise<boolean>;
}

export interface PersonalRepository {
  findPersonalState(userId: string): Promise<PersonalState | undefined>;
  savePersonalState(userId: string, state: PersonalState): Promise<PersonalState>;
}

export interface PlanningRepository {
  findAvailability(userId: string): Promise<AvailabilityWindow[] | null>;
  saveAvailability(userId: string, windows: AvailabilityWindow[]): Promise<void>;
  listStudyFeedback(userId: string): Promise<{ courseId: string; preference: StudyPreference }[]>;
  saveStudyFeedback(userId: string, courseId: string, preference: StudyPreference | null): Promise<boolean>;
}

export interface LifeOsRepositories extends AccountRepository, ProjectRepository, StudyRepository, PersonalRepository, PlanningRepository {}
