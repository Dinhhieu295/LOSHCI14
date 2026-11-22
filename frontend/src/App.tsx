import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  Eye,
  EyeOff,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Pin,
  RefreshCw,
  Settings,
  Sparkles,
  Sprout,
  Sun,
  Target,
  TrendingUp,
  UserRound,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {
  api,
  getToken,
  setToken,
  signIn,
  type Assignment,
  type Course,
  type CourseSession,
  type Exam,
  type NoticeInput,
  type NoticePayload,
  type NoticeType,
  type PersonalState,
  type Project,
  type ProjectTask,
  type ScheduleItem,
  type StudyLog,
  type StudyNote,
  type StudySummary,
  type User,
} from './api';
import ProjectsPage, { type ProjectView } from './ProjectsPage';
import ProfileEditor from './ProfileEditor';
import GlobalSearch, { type SearchTarget } from './GlobalSearch';
import StudyPage, { computeUnifiedStudyHours, type StudyTab } from './StudyPage';
import WorkPage, { type WorkView } from './WorkPage';
import StudyRecommendations from './StudyRecommendations';
import TimetablePage from './TimetablePage';
import SettingsPage from './SettingsPage';
import { calculateGpa } from './studyPlanning';
import './profile.css';

type Section = 'overview' | 'projects' | 'study' | 'calendar' | 'work' | 'personal' | 'settings';

const validSections: Section[] = ['overview', 'projects', 'study', 'calendar', 'work', 'personal', 'settings'];
const validStudyTabs: StudyTab[] = ['courses', 'assignments', 'exams', 'notes', 'time', 'recommendations', 'documents', 'course-schedule'];

interface UrlState {
  section: Section;
  projectId: string | null;
  taskId: string | null;
  courseId: string | null;
  assignmentId: string | null;
  examId: string | null;
  noteId: string | null;
  studyTab: StudyTab;
  projectView: ProjectView;
  workView: WorkView;
  calendarWeek: string | null;
  calendarAvailability: boolean;
}

function readUrlState(): UrlState {
  const pathSeg = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] as Section;
  const params = new URLSearchParams(window.location.search);
  const querySection = params.get('section') as Section | null;
  let section: Section = validSections.includes(pathSeg)
    ? pathSeg
    : querySection && validSections.includes(querySection)
      ? querySection
      : 'overview';
  const projectId = params.get('project') || null;
  const taskId = params.get('task') || null;
  const courseId = params.get('course') || null;
  const assignmentId = params.get('assignment') || null;
  const examId = params.get('exam') || null;
  const noteId = params.get('note') || null;
  const tabParam = params.get('tab') as StudyTab | null;
  let studyTab: StudyTab = tabParam && validStudyTabs.includes(tabParam)
    ? tabParam
    : assignmentId ? 'assignments' : examId ? 'exams' : noteId ? 'notes' : 'courses';
  const view = params.get('view');
  const legacyPlanning = String(pathSeg) === 'planning' || String(querySection) === 'planning';
  if (legacyPlanning) {
    section = view === 'availability' ? 'calendar' : view === 'work' ? 'work' : 'study';
    if (section === 'study') studyTab = 'recommendations';
  }
  if (String(pathSeg) === 'gpa' || String(querySection) === 'gpa') {
    section = 'study';
    studyTab = 'courses';
  }
  if (section === 'study' && params.get('tab') === 'schedule') section = 'calendar';
  if (section === 'study' && courseId) {
    if (params.get('tab') === 'course-info') studyTab = 'course-schedule';
    else if (studyTab === 'courses') studyTab = 'assignments';
  }
  if (!courseId && (studyTab === 'documents' || studyTab === 'course-schedule')) studyTab = 'courses';
  const week = params.get('week');
  const date = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T12:00:00Z`) : null;
  const calendarWeek = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === week ? week : null;
  return { section, projectId, taskId, courseId, assignmentId, examId, noteId, studyTab, calendarWeek,
    projectView: section === 'projects' && view === 'deadlines' ? 'deadlines' : 'list',
    workView: view === 'projects' || (legacyPlanning && view === 'work') ? 'projects'
      : view === 'employment' ? 'employment' : 'personal',
    calendarAvailability: section === 'calendar' && view === 'availability' };
}

function buildUrl(
  section: Section,
  opts: {
    projectId?: string | null;
    taskId?: string | null;
    courseId?: string | null;
    assignmentId?: string | null;
    examId?: string | null;
    noteId?: string | null;
    studyTab?: StudyTab;
    projectView?: ProjectView;
    workView?: WorkView;
    calendarWeek?: string | null;
    calendarAvailability?: boolean;
  } = {},
) {
  const basePath = section === 'overview' ? '/' : `/${section}`;
  const params = new URLSearchParams();
  if (section === 'projects') {
    if (opts.projectId) params.set('project', opts.projectId);
    if (opts.taskId) params.set('task', opts.taskId);
    if (opts.projectView === 'deadlines') params.set('view', 'deadlines');
  }
  if (section === 'study') {
    if (opts.studyTab && opts.studyTab !== 'courses') params.set('tab', opts.studyTab);
    if (opts.courseId) params.set('course', opts.courseId);
    if (opts.assignmentId) params.set('assignment', opts.assignmentId);
    if (opts.examId) params.set('exam', opts.examId);
    if (opts.noteId) params.set('note', opts.noteId);
  }
  if (section === 'work') {
    if (opts.workView === 'projects') params.set('view', 'projects');
    else {
      if (opts.workView === 'employment') params.set('view', 'employment');
      if (opts.taskId) params.set('task', opts.taskId);
    }
  }
  if (section === 'calendar') {
    if (opts.calendarWeek) params.set('week', opts.calendarWeek);
    if (opts.calendarAvailability) params.set('view', 'availability');
  }
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'projects', label: 'Dự án', icon: FolderKanban },
  { id: 'study', label: 'Học tập', icon: GraduationCap },
  { id: 'work', label: 'Công việc', icon: ClipboardList },
  { id: 'calendar', label: 'Lịch trình', icon: CalendarDays },
  { id: 'personal', label: 'Cá nhân', icon: UserRound },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
];

const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

function inferNoticeType(msg: string): NoticeType {
  if (/^(không|lỗi|vui lòng|trễ|quá hạn)/i.test(msg.trim())) return 'error';
  if (/^(cảnh báo|hãy|nhắc hạn)/i.test(msg.trim())) return 'warning';
  return 'success';
}

function normalizeNotice(input: NoticeInput): NoticePayload {
  if (typeof input === 'string') {
    return { message: input, type: inferNoticeType(input) };
  }
  return {
    message: input.message,
    type: input.type ?? inferNoticeType(input.message),
    retry: input.retry,
    retryLabel: input.retryLabel,
  };
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('lifeos_theme') === 'dark' ? 'dark' : 'light',
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const initialUrl = useMemo(() => readUrlState(), []);
  const [section, setSectionState] = useState<Section>(initialUrl.section);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialUrl.projectId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialUrl.taskId);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialUrl.courseId);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(initialUrl.assignmentId);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(initialUrl.examId);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialUrl.noteId);
  const [studyTab, setStudyTab] = useState<StudyTab>(initialUrl.studyTab);
  const [projectView, setProjectView] = useState<ProjectView>(initialUrl.projectView);
  const [workView, setWorkView] = useState<WorkView>(initialUrl.workView);
  const [calendarWeek, setCalendarWeek] = useState<string | null>(initialUrl.calendarWeek);
  const [calendarAvailability, setCalendarAvailability] = useState(initialUrl.calendarAvailability);

  const [mobileNav, setMobileNav] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const helpDialogRef = useRef<HTMLElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<string, ProjectTask[]>>({});
  const [personalTasks, setPersonalTasks] = useState<ProjectTask[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSessions, setCourseSessions] = useState<CourseSession[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [personal, setPersonal] = useState<PersonalState | null>(null);

  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [notice, setNoticeState] = useState<NoticePayload | null>(null);
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  const loadGenRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  const showNotice = useCallback((input: NoticeInput) => {
    if (!input || (typeof input === 'string' && !input.trim())) {
      setNoticeState(null);
      return;
    }
    setNoticeState(normalizeNotice(input));
  }, []);

  const clearUserData = useCallback(() => {
    loadGenRef.current += 1;
    setProjects([]);
    setTasksByProject({});
    setCourses([]);
    setCourseSessions([]);
    setStudyLogs([]);
    setAssignments([]);
    setExams([]);
    setNotes([]);
    setScheduleItems([]);
    setPersonalTasks([]);
    setSummary(null);
    setPersonal(null);
    setSearchTarget(null);
    setLoadError('');
    setLoading(false);
    setDataReady(false);
  }, []);

  useEffect(() => {
    activeUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // Global 401 unauthorized listener across all screens
  useEffect(() => {
    const onUnauthorized = () => {
      clearUserData();
      setUser(null);
      window.history.replaceState(null, '', '/');
      setSectionState('overview');
    };
    window.addEventListener('lifeos:unauthorized', onUnauthorized);
    return () => window.removeEventListener('lifeos:unauthorized', onUnauthorized);
  }, [clearUserData]);

  const navigateSection = useCallback(
    (
      nextSection: Section,
      opts: {
        projectId?: string | null;
        taskId?: string | null;
        courseId?: string | null;
        assignmentId?: string | null;
        examId?: string | null;
        noteId?: string | null;
        studyTab?: StudyTab;
        projectView?: ProjectView;
        workView?: WorkView;
        calendarWeek?: string | null;
        calendarAvailability?: boolean;
        replace?: boolean;
      } = {},
    ) => {
      setSectionState(nextSection);
      const nextProj = opts.projectId !== undefined ? opts.projectId : nextSection === 'projects' ? selectedProjectId : null;
      const nextTask = opts.taskId !== undefined ? opts.taskId
        : nextSection === section && (nextSection === 'projects' || nextSection === 'work') ? selectedTaskId : null;
      const nextCourse = opts.courseId !== undefined ? opts.courseId : nextSection === 'study' ? selectedCourseId : null;
      const nextAssignment =
        opts.assignmentId !== undefined ? opts.assignmentId : nextSection === 'study' ? selectedAssignmentId : null;
      const nextExam = opts.examId !== undefined ? opts.examId : nextSection === 'study' ? selectedExamId : null;
      const nextNote = opts.noteId !== undefined ? opts.noteId : nextSection === 'study' ? selectedNoteId : null;
      const nextTab = opts.studyTab !== undefined ? opts.studyTab : studyTab;

      setSelectedProjectId(nextProj);
      setSelectedTaskId(nextTask);
      setSelectedCourseId(nextCourse);
      setSelectedAssignmentId(nextAssignment);
      setSelectedExamId(nextExam);
      setSelectedNoteId(nextNote);
      if (opts.studyTab !== undefined) setStudyTab(opts.studyTab);
      const nextProjectView = opts.projectView ?? (section === 'projects' && nextSection === 'projects' ? projectView : 'list');
      const nextWorkView = opts.workView ?? workView;
      const nextWeek = opts.calendarWeek !== undefined ? opts.calendarWeek : calendarWeek;
      const nextAvailability = opts.calendarAvailability ?? (section === 'calendar' && nextSection === 'calendar' && calendarAvailability);
      setWorkView(nextWorkView);
      setProjectView(nextProjectView);
      setCalendarWeek(nextWeek);
      setCalendarAvailability(nextAvailability);

      const nextUrl = buildUrl(nextSection, {
        projectId: nextProj,
        taskId: nextTask,
        courseId: nextCourse,
        assignmentId: nextAssignment,
        examId: nextExam,
        noteId: nextNote,
        studyTab: nextTab,
        projectView: nextProjectView,
        workView: nextWorkView,
        calendarWeek: nextWeek,
        calendarAvailability: nextAvailability,
      });
      if (window.location.pathname + window.location.search !== nextUrl) {
        if (opts.replace) window.history.replaceState(null, '', nextUrl);
        else window.history.pushState(null, '', nextUrl);
      }
    },
    [
      selectedProjectId,
      selectedTaskId,
      selectedCourseId,
      selectedAssignmentId,
      selectedExamId,
      selectedNoteId,
      studyTab,
      section,
      projectView,
      workView,
      calendarWeek,
      calendarAvailability,
    ],
  );

  const selectProject = useCallback((id: string | null, taskId?: string | null) => {
    navigateSection('projects', { projectId: id, taskId: taskId ?? null, replace: id === selectedProjectId });
  }, [navigateSection, selectedProjectId]);

  useEffect(() => {
    const onPopState = () => {
      const state = readUrlState();
      setSectionState(state.section);
      setSelectedProjectId(state.projectId);
      setSelectedTaskId(state.taskId);
      setSelectedCourseId(state.courseId);
      setSelectedAssignmentId(state.assignmentId);
      setSelectedExamId(state.examId);
      setSelectedNoteId(state.noteId);
      setStudyTab(state.studyTab);
      setProjectView(state.projectView);
      setWorkView(state.workView);
      setCalendarWeek(state.calendarWeek);
      setCalendarAvailability(state.calendarAvailability);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Accessible Help Dialog: Escape key, Focus Trap, and restore focus to trigger button
  useEffect(() => {
    if (!helpOpen) return;
    const dialog = helpDialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setHelpOpen(false);
        helpButtonRef.current?.focus();
      } else if (event.key === 'Tab' && focusable && focusable.length > 0) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen]);

  const closeHelp = () => {
    setHelpOpen(false);
    helpButtonRef.current?.focus();
  };

  useEffect(() => {
    if (!user) return;
    setRemindersEnabled(localStorage.getItem(`lifeos:deadline-reminders-enabled:${user.id}`) !== 'false');
  }, [user?.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('lifeos_theme', theme);
  }, [theme]);

  const reloadTasksOnly = useCallback(async (projectRows: Project[], gen: number, expectedUserId: string | null) => {
    if (!projectRows.length) {
      if (gen === loadGenRef.current && expectedUserId === activeUserIdRef.current) {
        setTasksByProject({});
      }
      return;
    }
    const rows = await Promise.all(
      projectRows.map(async (project) => [project.id, await api<ProjectTask[]>(`/projects/${project.id}/tasks`)] as const),
    );
    if (gen === loadGenRef.current && expectedUserId === activeUserIdRef.current) {
      setTasksByProject(Object.fromEntries(rows));
    }
  }, []);

  const loadData = useCallback(
    async (opts?: { throwOnError?: boolean }) => {
      const currentGen = ++loadGenRef.current;
      const expectedUserId = activeUserIdRef.current;
      setLoading(true);
      setLoadError('');
      try {
        const [
          projectRows,
          personalTaskRows,
          courseRows,
          assignmentRows,
          examRows,
          noteRows,
          scheduleRows,
          sessionRows,
          logRows,
          study,
          state,
        ] = await Promise.all([
          api<Project[]>('/projects'),
          api<ProjectTask[]>('/tasks'),
          api<Course[]>('/study/courses'),
          api<Assignment[]>('/study/assignments'),
          api<Exam[]>('/study/exams'),
          api<StudyNote[]>('/study/notes'),
          api<ScheduleItem[]>('/study/schedule'),
          api<CourseSession[]>('/study/course-sessions'),
          api<StudyLog[]>('/study/study-logs'),
          api<StudySummary>('/study/summary'),
          api<PersonalState>('/personal/state'),
        ]);
        if (currentGen !== loadGenRef.current || expectedUserId !== activeUserIdRef.current) return;

        setProjects(projectRows);
        setPersonalTasks(personalTaskRows);
        setCourses(courseRows);
        setAssignments(assignmentRows);
        setExams(examRows);
        setNotes(noteRows);
        setScheduleItems(scheduleRows);
        setCourseSessions(sessionRows);
        setStudyLogs(logRows);
        setSummary(study);
        setPersonal(state);

        await reloadTasksOnly(projectRows, currentGen, expectedUserId);
      } catch (error) {
        if (currentGen !== loadGenRef.current) return;
        if (!getToken()) {
          clearUserData();
          setUser(null);
          return;
        }
        const message = error instanceof Error ? error.message : 'Không tải được dữ liệu.';
        setLoadError(message);
        if (opts?.throwOnError) {
          throw error;
        }
        showNotice({
          message,
          type: 'error',
          retry: () => void loadData(),
          retryLabel: 'Thử tải lại',
        });
      } finally {
        if (currentGen === loadGenRef.current) {
          setLoading(false);
          setDataReady(true);
        }
      }
    },
    [clearUserData, reloadTasksOnly, showNotice],
  );

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      showNotice({ message: 'Đã kết nối lại mạng.', type: 'info' });
      if (user) void loadData();
    };
    const onOffline = () => {
      setIsOffline(true);
      showNotice({
        message: 'Không có kết nối mạng. Một số thao tác lưu sẽ cần thử lại khi có mạng.',
        type: 'warning',
      });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [user, loadData, showNotice]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    api<{ user: User }>('/auth/me')
      .then(({ user: current }) => {
        activeUserIdRef.current = current.id;
        setUser(current);
      })
      .catch(() => setToken(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (user) {
      activeUserIdRef.current = user.id;
      void loadData();
    }
  }, [user?.id, loadData]);

  useEffect(() => {
    if (!notice) return;
    const duration = notice.retry || notice.type === 'error' ? 6500 : 4200;
    const timer = window.setTimeout(() => setNoticeState(null), duration);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!user || (!projects.length && !assignments.length) || !remindersEnabled) return;
    let active = true;
    const checkDeadlines = () => {
      if (!active) return;
      const now = new Date();
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      for (const task of Object.values(tasksByProject).flat()) {
        if (!task.dueDate || task.isDone || task.status === 'done') continue;
        const [year, month, day] = task.dueDate.split('-').map(Number);
        if (Math.round((Date.UTC(year, month - 1, day) - todayUtc) / 86_400_000) !== 1) continue;
        const key = `lifeos:deadline-reminder:${task.id}:${task.dueDate}`;
        if (localStorage.getItem(key)) continue;
        const message = `“${task.title}” sẽ đến hạn ngày mai.`;
        showNotice({ message: `Nhắc hạn: ${message}`, type: 'warning' });
        if ('Notification' in window && Notification.permission === 'granted')
          new Notification('Nhắc hạn task', { body: message, tag: key });
        localStorage.setItem(key, new Date().toISOString());
      }
      for (const assignment of assignments) {
        if (!assignment.deadline || assignment.status === 'Completed') continue;
        const dueDate = assignment.deadline.slice(0, 10);
        const [year, month, day] = dueDate.split('-').map(Number);
        if (Math.round((Date.UTC(year, month - 1, day) - todayUtc) / 86_400_000) !== 1) continue;
        const key = `lifeos:assignment-reminder:${assignment.id}:${assignment.deadline}`;
        if (localStorage.getItem(key)) continue;
        const message = `Bài tập “${assignment.title}” sẽ đến hạn ngày mai.`;
        showNotice({ message: `Nhắc hạn: ${message}`, type: 'warning' });
        if ('Notification' in window && Notification.permission === 'granted')
          new Notification('Nhắc hạn bài tập', { body: message, tag: key });
        localStorage.setItem(key, new Date().toISOString());
      }
    };
    checkDeadlines();
    const timer = window.setInterval(checkDeadlines, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user, projects, tasksByProject, assignments, remindersEnabled, showNotice]);

  const toggleReminders = (enabled: boolean) => {
    if (user) localStorage.setItem(`lifeos:deadline-reminders-enabled:${user.id}`, String(enabled));
    setRemindersEnabled(enabled);
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  }, []);

  const handleLogin = async (email: string, password: string, mode: 'login' | 'register', fullName?: string) => {
    clearUserData();
    const result = await signIn(email, password, mode, fullName);
    setToken(result.token);
    activeUserIdRef.current = result.user.id;
    setUser(result.user);
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* local session is still cleared */
    }
    setToken(null);
    activeUserIdRef.current = null;
    clearUserData();
    setUser(null);
    setNoticeState(null);
    window.history.replaceState(null, '', '/');
    setSectionState('overview');
  };

  const openSearchTarget = (target: SearchTarget) => {
    setSearchTarget(target);
    if (target.kind === 'course') {
      navigateSection('study', {
        studyTab: 'assignments',
        courseId: target.courseId ?? null,
        assignmentId: null,
        examId: null,
        noteId: null,
      });
    } else if (target.kind === 'assignment') {
      navigateSection('study', {
        studyTab: 'assignments',
        courseId: assignments.find((item) => item.id === target.assignmentId)?.courseId ?? null,
        assignmentId: target.assignmentId ?? null,
        examId: null,
        noteId: null,
      });
    } else if (target.kind === 'exam') {
      navigateSection('study', {
        studyTab: 'exams',
        courseId: exams.find((item) => item.id === target.examId)?.courseId ?? null,
        assignmentId: null,
        examId: target.examId ?? null,
        noteId: null,
      });
    } else if (target.kind === 'note') {
      navigateSection('study', {
        studyTab: 'notes',
        courseId: notes.find((item) => item.id === target.noteId)?.courseId ?? null,
        assignmentId: null,
        examId: null,
        noteId: target.noteId ?? null,
      });
    } else {
      navigateSection('projects', {
        projectId: target.projectId ?? null,
        taskId: target.taskId ?? null,
      });
    }
  };

  if (!authReady)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <Leaf size={20} />
        </div>
        <span>Đang mở LifeOS…</span>
      </div>
    );
  if (!user) return <AuthScreen onSubmit={handleLogin} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Leaf size={19} strokeWidth={2.4} />
          </div>
          <span>
            life<span className="brand-light">os</span>
          </span>
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileNav(false)}
            aria-label="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
        <div className="workspace-switch">
          <div className="workspace-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user.fullName}</strong>
            <span>Không gian cá nhân</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav" aria-label="Điều hướng chính">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${section === id ? 'active' : ''}`}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => {
                navigateSection(id, id === 'projects' ? { projectId: null, taskId: null, projectView: 'list' }
                  : id === 'study' ? { studyTab: 'courses', courseId: null, assignmentId: null, examId: null, noteId: null } : undefined);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'projects' && projects.length > 0 && <small aria-hidden="true">{projects.length}</small>}
              {id === 'study' && courses.length > 0 && <small aria-hidden="true">{courses.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            ref={helpButtonRef}
            className="nav-item muted-nav"
            onClick={() => {
              setHelpOpen(true);
              setMobileNav(false);
            }}
          >
            <CircleHelp size={18} />
            <span>Trợ giúp</span>
          </button>
        </div>
        <div className="sidebar-user">
          <div className="user-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
          <div className="user-details">
            <strong>{user.fullName}</strong>
            <span>{user.email}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => void logout()}
            aria-label="Đăng xuất"
            title="Đăng xuất"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Đóng menu" />}
      {helpOpen && (
        <div className="help-backdrop" onClick={closeHelp}>
          <section
            ref={helpDialogRef}
            className="help-dialog panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="icon-button help-close" onClick={closeHelp} aria-label="Đóng trợ giúp">
              <X size={18} />
            </button>
            <h2 id="help-title">Sử dụng LifeOS</h2>
            <p>Chọn một khu vực để bắt đầu:</p>
            <ul>
              <li>
                <strong>Tổng quan:</strong> xem việc sắp đến hạn, tiến độ dự án và thống kê học tập.
              </li>
              <li>
                <strong>Dự án:</strong> tạo/sửa dự án, chia nhỏ thành task, quản lý subtasks, phụ thuộc và timeline.
              </li>
              <li>
                <strong>Học tập:</strong> quản lý môn học, bài tập, kỳ thi, ghi chú và nhật ký học.
              </li>
              <li>
                <strong>Công việc:</strong> quản lý việc làm, việc cá nhân và theo dõi tiến độ dự án.
              </li>
              <li>
                <strong>Lịch trình:</strong> xem lịch học, hạn công việc và xếp giờ theo từng tuần.
              </li>
              <li>
                <strong>Cá nhân:</strong> cập nhật hồ sơ và đổi mật khẩu.
              </li>
            </ul>
            <p>
              Dùng biểu tượng kính lúp để tìm nhanh dự án, task, môn học, bài tập, kỳ thi hoặc ghi chú; nhấn phím{' '}
              <kbd>Esc</kbd> để đóng hộp thoại.
            </p>
            <button className="primary-button" onClick={closeHelp}>
              Đã hiểu
            </button>
          </section>
        </div>
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="Mở menu"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>LifeOS</span>
              <span className="crumb-slash">/</span>
              <strong>{navItems.find((item) => item.id === section)?.label}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <div className="date-chip">
              <CalendarDays size={15} />
              <span>{today}</span>
            </div>
            <button
              className="icon-button appearance-toggle"
              type="button"
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <GlobalSearch
              projects={projects}
              courses={courses}
              assignments={assignments}
              exams={exams}
              notes={notes}
              onSelect={openSearchTarget}
            />
            <div className="top-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <div className="page-content">
          {isOffline && (
            <div className="offline-banner" role="status">
              <WifiOff size={16} />
              <span>Bạn đang ngoại tuyến (Offline). Dữ liệu sẽ được đồng bộ khi kết nối mạng phục hồi.</span>
              <button type="button" className="soft-button compact-btn" onClick={() => void loadData()}>
                <RefreshCw size={13} /> Thử lại
              </button>
            </div>
          )}

          {loadError && !loading && (
            <div className="error-retry-banner" role="alert">
              <AlertCircle size={16} />
              <span>{loadError}</span>
              <button type="button" className="soft-button compact-btn" onClick={() => void loadData()}>
                <RefreshCw size={13} /> Thử lại ngay
              </button>
            </div>
          )}

          {notice && (
            <div
              className={`toast toast-${notice.type ?? 'info'}`}
              role={notice.type === 'error' ? 'alert' : 'status'}
              aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
            >
              <span>{notice.message}</span>
              <div className="toast-actions">
                {notice.retry && (
                  <button
                    type="button"
                    className="toast-retry-btn"
                    onClick={() => {
                      const retryFn = notice.retry;
                      setNoticeState(null);
                      retryFn?.();
                    }}
                  >
                    {notice.retryLabel || 'Thử lại'}
                  </button>
                )}
                <button onClick={() => setNoticeState(null)} aria-label="Đóng">
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {section === 'overview' && (
            <Overview
              user={user}
              greeting={greeting}
              projects={projects}
              tasksByProject={tasksByProject}
              courses={courses}
              assignments={assignments}
              exams={exams}
              scheduleItems={scheduleItems}
              studyLogs={studyLogs}
              summary={summary}
              personal={personal}
              loading={loading || !dataReady}
              onNavigate={(s, opts) => navigateSection(s, opts)}
              onRefresh={loadData}
            />
          )}
          {section === 'projects' && (
            <ProjectsPage
              userId={user.id}
              projects={projects}
              tasksByProject={tasksByProject}
              onTasksUpdated={() => reloadTasksOnly(projects, loadGenRef.current, activeUserIdRef.current)}
              loading={loading || !dataReady}
              refresh={() => loadData({ throwOnError: true })}
              onNotice={showNotice}
              openTarget={searchTarget}
              onTargetOpened={() => setSearchTarget(null)}
              remindersEnabled={remindersEnabled}
              onToggleReminders={toggleReminders}
              view={projectView}
              onViewChange={(view) => navigateSection('projects', { projectView: view, projectId: null, taskId: null })}
              selectedProjectId={selectedProjectId}
              selectedTaskId={selectedTaskId}
              onSelectProject={selectProject}
            />
          )}
          {section === 'study' && (
            <StudyPage
              key={user.id}
              userId={user.id}
              courses={courses}
              sessions={courseSessions}
              logs={studyLogs}
              assignments={assignments}
              exams={exams}
              notes={notes}
              summary={summary}
              loading={loading || !dataReady}
              onRefresh={() => loadData({ throwOnError: true })}
              onNotice={showNotice}
              activeTab={studyTab}
              onTabChange={(t) => navigateSection('study', {
                studyTab: t, courseId: null, assignmentId: null, examId: null, noteId: null,
              })}
              selectedCourseId={selectedCourseId}
              selectedAssignmentId={selectedAssignmentId}
              selectedExamId={selectedExamId}
              selectedNoteId={selectedNoteId}
              onSelectStudyTarget={(opts) =>
                navigateSection('study', {
                  studyTab: opts.tab ?? studyTab,
                  courseId: opts.courseId ?? null,
                  assignmentId: opts.assignmentId ?? null,
                  examId: opts.examId ?? null,
                  noteId: opts.noteId ?? null,
                })
              }
              openTarget={searchTarget}
              onTargetOpened={() => setSearchTarget(null)}
              recommendations={<StudyRecommendations
                courses={courses} assignments={assignments} exams={exams}
                sessions={courseSessions} schedule={scheduleItems} personalTasks={personalTasks} onNotice={showNotice}
                onOpenCourses={() => navigateSection('study', { studyTab: 'courses' })}
                onOpenAvailability={() => navigateSection('calendar', { calendarAvailability: true })}
              />}
            />
          )}
          {(section === 'work' || section === 'calendar') && !dataReady && (
            <p role="status">Đang tải dữ liệu…</p>
          )}
          {section === 'calendar' && dataReady && (
            <TimetablePage
              key={user.id}
              courses={courses}
              sessions={courseSessions}
              schedule={scheduleItems}
              projects={projects}
              tasksByProject={tasksByProject}
              personalTasks={personalTasks}
              setSchedule={setScheduleItems}
              weekDate={calendarWeek}
              onWeekChange={(week) => navigateSection('calendar', { calendarWeek: week })}
              showAvailability={calendarAvailability}
              onAvailabilityChange={(show) => navigateSection('calendar', { calendarAvailability: show, replace: true })}
              onNotice={showNotice}
              onOpenCourse={(courseId) => navigateSection('study', { studyTab: courseId ? 'course-schedule' : 'courses', courseId: courseId ?? null })}
              onOpenTask={(projectId, taskId) => projectId
                ? navigateSection('projects', { projectId, taskId })
                : navigateSection('work', { workView: personalTasks.find((task) => task.id === taskId)?.category ?? 'personal', taskId })}
            />
          )}
          {section === 'work' && dataReady && (
            <WorkPage
              key={user.id}
              view={workView}
              activeTaskId={selectedTaskId}
              personalTasks={personalTasks}
              setPersonalTasks={setPersonalTasks}
              projects={projects}
              tasksByProject={tasksByProject}
              onViewChange={(view) => navigateSection('work', { workView: view, taskId: null })}
              onSelectTask={(taskId) => navigateSection('work', { taskId, replace: true })}
              onOpenProjectTask={(projectId, taskId) => navigateSection('projects', { projectId, taskId })}
              onNotice={showNotice}
            />
          )}
          {section === 'personal' && (
            <ProfileEditor
              user={user}
              onSaved={setUser}
              onNotice={showNotice}
              onSessionExpired={() => {
                clearUserData();
                setUser(null);
              }}
            />
          )}
          {section === 'settings' && <SettingsPage key={user.id} dark={theme === 'dark'} reminders={remindersEnabled}
            onTheme={(enabled) => setTheme(enabled ? 'dark' : 'light')} onReminders={toggleReminders} />}
        </div>
      </main>
    </div>
  );
}

function AuthScreen({
  onSubmit,
}: {
  onSubmit: (email: string, password: string, mode: 'login' | 'register', fullName?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(email, password, mode, fullName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đăng nhập chưa thành công.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-screen">
      <div className="auth-decoration">
        <div className="auth-orbit orbit-one" />
        <div className="auth-orbit orbit-two" />
        <div className="auth-leaf">
          <Sprout size={68} strokeWidth={1.1} />
        </div>
        <div className="auth-quote">
          <div className="quote-icon">
            <Sparkles size={18} />
          </div>
          <p>
            “Cuộc sống không cần hoàn hảo.
            <br />
            Chỉ cần tiến về phía trước.”
          </p>
          <span>KHÔNG GIAN PHÁT TRIỂN CỦA BẠN</span>
        </div>
        <div className="auth-decoration-footer">
          <div className="mini-avatars">
            <i>L</i>
            <i>M</i>
            <i>H</i>
            <i>+</i>
          </div>
          <span>Bắt đầu xây dựng nhịp sống của riêng bạn</span>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-brand">
          <div className="brand-mark">
            <Leaf size={19} />
          </div>
          life<span>os</span>
        </div>
        <div className="auth-form-wrap">
          <div className="eyebrow">
            <span /> KHÔNG GIAN CỦA BẠN
          </div>
          <h1>{mode === 'login' ? 'Chào mừng trở lại' : 'Bắt đầu hành trình mới'}</h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Đăng nhập để tiếp tục hành trình phát triển của bạn.'
              : 'Tạo tài khoản và xây dựng nhịp sống bạn mong muốn.'}
          </p>
          <form onSubmit={(event) => void submit(event)} className="auth-form">
            {mode === 'register' && (
              <label>
                Họ và tên
                <input
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tên của bạn"
                  required
                  maxLength={120}
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@email.com"
                required
                maxLength={320}
              />
            </label>
            <label>
              Mật khẩu
              <span className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ít nhất 8 ký tự"
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
            {mode === 'register' && (
              <label>
                Nhập lại mật khẩu
                <span className="password-field">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    aria-label={showConfirmPassword ? 'Ẩn mật khẩu nhập lại' : 'Hiện mật khẩu nhập lại'}
                    title={showConfirmPassword ? 'Ẩn mật khẩu nhập lại' : 'Hiện mật khẩu nhập lại'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
            )}
            {mode === 'register' && confirmPassword && password !== confirmPassword && (
              <div className="form-error" role="alert">
                Mật khẩu nhập lại chưa khớp.
              </div>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button auth-submit" disabled={busy}>
              {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-switch">
            {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </div>
        </div>
        <div className="auth-legal">Bằng việc tiếp tục, bạn đồng ý với các điều khoản sử dụng của LifeOS.</div>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow"><span />{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Overview({
  user,
  greeting,
  projects,
  tasksByProject,
  courses,
  assignments,
  exams,
  scheduleItems,
  studyLogs,
  summary,
  personal,
  loading,
  onNavigate,
  onRefresh,
}: {
  user: User;
  greeting: string;
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  courses: Course[];
  assignments: Assignment[];
  exams: Exam[];
  scheduleItems: ScheduleItem[];
  studyLogs: StudyLog[];
  summary: StudySummary | null;
  personal: PersonalState | null;
  loading: boolean;
  onNavigate: (
    s: Section,
    opts?: {
      projectId?: string | null;
      taskId?: string | null;
      courseId?: string | null;
      studyTab?: StudyTab;
    },
  ) => void;
  onRefresh: () => Promise<void>;
}) {
  const firstName = user.fullName.split(' ')[0];
  const gpa = calculateGpa(courses);
  const totalStudyHours = useMemo(() => computeUnifiedStudyHours(courses, studyLogs), [courses, studyLogs]);
  const pendingAssignments = useMemo(
    () =>
      [...assignments]
        .filter((a) => a.status !== 'Completed')
        .sort((a, b) => a.deadline.localeCompare(b.deadline)),
    [assignments],
  );
  const upcomingExams = useMemo(
    () =>
      [...exams]
        .filter((e) => {
          const [y, m, d] = e.date.slice(0, 10).split('-').map(Number);
          const now = new Date();
          return Date.UTC(y, m - 1, d) >= Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    [exams],
  );
  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      }),
    [projects],
  );

  return (
    <>
      <PageHeading
        eyebrow={today.toLocaleUpperCase('vi-VN')}
        title={`${greeting}, ${firstName} 👋`}
        subtitle="Một ngày mới là một cơ hội mới để tiến gần hơn đến điều bạn muốn."
        action={
          <button className="soft-button" onClick={() => void onRefresh()}>
            <TrendingUp size={16} /> Cập nhật
          </button>
        }
      />
      {loading && (
        <div className="loading-bar">
          <span />
        </div>
      )}
      <div className="overview-banner">
        <div className="banner-copy">
          <div className="banner-kicker">
            <Sparkles size={15} /> TẬP TRUNG VÀO ĐIỀU QUAN TRỌNG
          </div>
          <h2>
            Mỗi ngày một chút,
            <br />
            bạn đang tiến bộ.
          </h2>
          <p>Hãy chọn một việc nhỏ và bắt đầu ngay hôm nay.</p>
          <button className="banner-button" onClick={() => onNavigate('work')}>
            Xem công việc <ArrowRight size={16} />
          </button>
        </div>
        <div className="banner-art">
          <div className="sun-disc" />
          <div className="hill hill-back" />
          <div className="hill hill-front" />
          <div className="art-plant plant-a">
            <span />
            <i />
            <b />
          </div>
          <div className="art-plant plant-b">
            <span />
            <i />
            <b />
          </div>
          <div className="art-star">
            <Sparkles size={17} />
          </div>
        </div>
      </div>

      {/* Việc sắp đến hạn ưu tiên hiển thị trước thống kê */}
      <div className="bottom-grid overview-priority-grid">
        <section className="panel tasks-panel">
          <div className="panel-heading">
            <div>
              <h3>Việc cần hoàn thành & Sắp đến hạn</h3>
              <p>Bài tập và kỳ thi cần ưu tiên xử lý trước</p>
            </div>
            <span className="count-pill">{pendingAssignments.length} việc</span>
          </div>
          {loading && !assignments.length ? (
            <div className="skeleton-list" aria-busy="true">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : pendingAssignments.slice(0, 4).length ? (
            pendingAssignments.slice(0, 4).map((item) => (
              <AssignmentRow key={item.id} item={item} courses={courses} />
            ))
          ) : (
            <EmptyState
              icon={Check}
              title="Bạn đã bắt kịp rồi!"
              text="Hiện không có bài tập nào đang chờ."
            />
          )}
          {upcomingExams.length > 0 && (
            <div className="overview-exams-strip">
              {upcomingExams.slice(0, 2).map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  className="overview-exam-pill"
                  onClick={() => onNavigate('study', { studyTab: 'exams' })}
                >
                  <Award size={14} />
                  <span>
                    <strong>{exam.title}</strong> ({exam.type}) · {formatDate(exam.date)} · Ôn tập {exam.prepProgress}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel focus-panel">
          <div className="panel-heading">
            <div>
              <h3>Học tập hôm nay</h3>
              <p>Tiến độ của bạn đang đi lên</p>
            </div>
            <button className="round-icon" onClick={() => onNavigate('study')}>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="study-overview-summary">
            <strong>
              {courses.filter((c) => (c.status || 'Active') === 'Active').length || (summary?.activeCourses ?? 0)} môn học
              đang hoạt động
            </strong>
            <span>
              {pendingAssignments.length} bài tập đang chờ · {upcomingExams.length} kỳ thi sắp tới
              {scheduleItems.length > 0 ? ` · ${scheduleItems.length} lịch cá nhân` : ''}
            </span>
            <span className="positive-line">
              <TrendingUp size={14} /> Tiếp tục giữ nhịp nhé
            </span>
          </div>
          <div className="focus-divider" />
          <div className="focus-footer">
            <span>
              <Clock3 size={15} /> Giờ học tích lũy
            </span>
            <strong>{totalStudyHours} <small>giờ</small></strong>
          </div>
          <button className="focus-link" onClick={() => onNavigate('study')}>
            Mở không gian học tập <ArrowRight size={15} />
          </button>
        </section>
      </div>

      {/* Thống kê tổng quan */}
      <div className="stats-grid">
        <StatCard
          label="Dự án đang chạy"
          value={String(projects.filter((p) => p.status.toLowerCase() !== 'completed').length).padStart(2, '0')}
          detail={`${projects.length} dự án tất cả`}
          icon={Target}
          tone="green"
          trend={<ArrowUpRight size={14} />}
        />
        <StatCard
          label="Tiến độ học tập"
          value={`${Math.round(courses.length ? courses.reduce((n, c) => n + (c.progress || 0), 0) / Math.max(courses.length, 1) : 0)}%`}
          detail={`${courses.filter((c) => (c.status || 'Active') === 'Active').length || (summary?.activeCourses ?? 0)} môn đang học`}
          icon={BookOpen}
          tone="violet"
          trend={<ArrowUpRight size={14} />}
        />
        <StatCard
          label="Chuỗi ngày"
          value={`${personal?.streak ?? 0} ngày`}
          detail="Giữ nhịp mỗi ngày"
          icon={Zap}
          tone="amber"
          trend={<span className="trend-neutral">+1</span>}
        />
        <StatCard
          label="GPA hiện tại"
          value={gpa.value === null ? '—' : `${gpa.value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} / 4`}
          detail={gpa.credits > 0 ? `${gpa.credits} tín chỉ có điểm` : 'Chưa có điểm để tính GPA'}
          icon={BarChart3}
          tone="blue"
        />
      </div>

      <section className="panel projects-panel">
        <div className="panel-heading">
          <div>
            <h3>Dự án của bạn</h3>
            <p>Những điều bạn đang xây dựng</p>
          </div>
          <button className="text-button" onClick={() => onNavigate('projects')}>
            Tất cả <ArrowRight size={15} />
          </button>
        </div>
        {loading && !projects.length ? (
          <div className="skeleton-list" aria-busy="true">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        ) : sortedProjects.length ? (
          <div className="project-list">
            {sortedProjects.slice(0, 4).map((project, i) => (
              <ProjectRow
                key={project.id}
                project={project}
                tasks={tasksByProject[project.id] ?? []}
                index={i}
                onOpen={() => onNavigate('projects', { projectId: project.id })}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="Chưa có dự án nào"
            text="Tạo dự án đầu tiên để bắt đầu sắp xếp kế hoạch."
            action="Tạo dự án"
            onClick={() => onNavigate('projects')}
          />
        )}
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Target;
  tone: string;
  trend?: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <div className="stat-foot">
        <span>{detail}</span>
        {trend && <span className={`stat-trend ${tone}`}>{trend}</span>}
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  tasks,
  index,
  onOpen,
}: {
  project: Project;
  tasks: ProjectTask[];
  index: number;
  onOpen: () => void;
}) {
  const completed = tasks.filter((t) => t.isDone || t.status === 'done').length;
  const displayedProgress = tasks.length ? Math.round((completed / tasks.length) * 100) : Math.round(project.progress ?? 0);
  return (
    <a className="project-row overview-project-link" href={buildUrl('projects', { projectId: project.id })} onClick={(event) => {
      if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      onOpen();
    }}>
      <div className={`project-symbol project-symbol-${index % 3}`}>
        <Compass size={18} />
      </div>
      <div className="project-row-main">
        <div className="project-title">
          <strong>{project.title}</strong>
          {project.isPinned && <Pin size={12} className="pin-inline" />}
          <span className={`status-dot status-${project.status.toLowerCase().replace(/\s+/g, '-')}`} />
        </div>
        <span>
          {[
            project.tag,
            tasks.length ? `${completed}/${tasks.length} task` : '',
            project.priority ? `Ưu tiên: ${project.priority}` : '',
            project.description,
          ]
            .filter(Boolean)
            .join(' · ') || 'Dự án cá nhân'}
        </span>
      </div>
      <div className="project-progress">
        <div className="progress-label">
          <span>{project.status}</span>
          <strong>{displayedProgress}%</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${displayedProgress}%` }} />
        </div>
      </div>
    </a>
  );
}

function AssignmentRow({ item, courses }: { item: Assignment; courses: Course[] }) {
  const course = courses.find((c) => c.id === item.courseId);
  return (
    <div className="assignment-row">
      <div className={`assignment-check ${item.priority.toLowerCase()}`}>
        <span />
      </div>
      <div className="assignment-copy">
        <strong>{item.title}</strong>
        <span>
          {course?.name ?? 'Bài tập'} ·{' '}
          {item.priority === 'High' ? 'Ưu tiên cao' : item.priority === 'Low' ? 'Ưu tiên thấp' : 'Ưu tiên vừa'}
        </span>
      </div>
      <span className="assignment-date">{formatDate(item.deadline)}</span>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short' }).format(date);
}

function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: typeof Check;
  title: string;
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty-state">
      <div>
        <Icon size={19} />
      </div>
      <strong>{title}</strong>
      <span>{text}</span>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
