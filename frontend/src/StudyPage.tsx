import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock3,
  FileText,
  FolderOpen,
  GitBranch,
  Lightbulb,
  MapPin,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  api,
  type Assignment,
  type Course,
  type CourseSession,
  type Exam,
  type NoticeHandler,
  type ProjectTimerState,
  type StudyLog,
  type StudyNote,
  type StudySummary,
} from './api';
import type { SearchTarget } from './GlobalSearch';
import { CalendarDialog } from './CalendarEditors';
import { CourseAssessment } from './CourseAssessment';
import { formatProjectTime, ProjectDocuments, ProjectTimer } from './ProjectResources';
import { courseLetterGrade } from './studyPlanning';

export type StudyTab = 'courses' | 'assignments' | 'exams' | 'notes' | 'time' | 'recommendations' | 'documents' | 'course-schedule';

const courseTabs: StudyTab[] = ['assignments', 'documents', 'exams', 'notes'];

type Props = {
  userId: string;
  courses: Course[];
  sessions: CourseSession[];
  logs: StudyLog[];
  assignments: Assignment[];
  exams: Exam[];
  notes: StudyNote[];
  summary: StudySummary | null;
  loading: boolean;
  recommendations: ReactNode;
  onRefresh: () => Promise<void>;
  onNotice: NoticeHandler;
  activeTab?: StudyTab;
  onTabChange?: (tab: StudyTab) => void;
  selectedCourseId?: string | null;
  selectedAssignmentId?: string | null;
  selectedExamId?: string | null;
  selectedNoteId?: string | null;
  onSelectStudyTarget?: (opts: {
    tab?: StudyTab;
    courseId?: string | null;
    assignmentId?: string | null;
    examId?: string | null;
    noteId?: string | null;
  }) => void;
  openTarget?: SearchTarget | null;
  onTargetOpened?: () => void;
};

type CourseDraft = {
  name: string;
  code: string;
  semester: string;
  instructor: string;
  credits: string;
  progress: string;
  color: string;
  status: Course['status'];
};

type SessionDraft = {
  weekday: string;
  startTime: string;
  endTime: string;
  periodStart: string;
  periodEnd: string;
  location: string;
  room: string;
};

type AssignmentDraft = {
  title: string;
  deadline: string;
  priority: string;
  status: string;
  dependencies: string[];
  courseId: string;
};

type ExamDraft = {
  title: string;
  courseId: string;
  date: string;
  type: 'Quiz' | 'Midterm' | 'Final' | 'Certification';
  weight: string;
  prepProgress: string;
};

type NoteDraft = {
  title: string;
  courseId: string;
  date: string;
  tagsText: string;
  content: string;
};

const todayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const blankCourse: CourseDraft = {
  name: '',
  code: '',
  semester: '',
  instructor: '',
  credits: '3',
  progress: '0',
  color: '#4f8259',
  status: 'Active',
};

const blankSession: SessionDraft = {
  weekday: '1',
  startTime: '08:00',
  endTime: '09:30',
  periodStart: '1',
  periodEnd: '2',
  location: '',
  room: '',
};

const emptyAssignment = (): AssignmentDraft => ({
  title: '',
  deadline: todayString(),
  priority: 'Medium',
  status: 'Not Started',
  dependencies: [],
  courseId: '',
});

const emptyExam = (): ExamDraft => ({
  title: '',
  courseId: '',
  date: todayString(),
  type: 'Midterm',
  weight: '30',
  prepProgress: '0',
});

const emptyNote = (): NoteDraft => ({
  title: '',
  courseId: '',
  date: todayString(),
  tagsText: '',
  content: '',
});

const emptyStudyLog = () => ({ date: todayString(), courseId: '', minutes: '', note: '' });
const weekdayNames = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];

const VALID_COURSE_STATUS = ['all', 'Active', 'Completed'];
const courseStatusLabels: Record<Course['status'], string> = { Active: 'Đang học', Completed: 'Hoàn thành' };
const VALID_ASSIGNMENT_STATUS = ['all', 'soon', 'pending', 'Not Started', 'In Progress', 'Completed', 'Overdue'];
const VALID_PRIORITY = ['all', 'High', 'Medium', 'Low'];
const VALID_ASSIGNMENT_SORT = ['deadline', 'priority', 'title'];
const VALID_EXAM_STATE = ['all', 'upcoming', 'past'];

function safeEnum<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );

const daysUntil = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return 0;
  const now = new Date();
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000,
  );
};

const formatDeadline = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day));
};

const assignmentReminderKey = (item: Assignment) => `lifeos:assignment-reminder:${item.id}:${item.deadline}`;

const weekStartFor = (date: Date) => {
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - day);
  return monday;
};

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

function formatCourseStudyTime(seconds: number) {
  const wholeSeconds = Math.round(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const remainder = wholeSeconds % 60;
  return [hours && `${hours} giờ`, minutes && `${minutes} phút`, remainder && `${remainder} giây`]
    .filter(Boolean).join(' ') || '0 giờ';
}

export function computeUnifiedStudyHours(courses: Course[], logs: StudyLog[], includeUnassigned = true) {
  const courseIds = new Set(courses.map(({ id }) => id));
  const minutes = logs.reduce((sum, log) =>
    (log.courseId ? courseIds.has(log.courseId) : includeUnassigned) ? sum + log.durationMinutes : sum, 0);
  const seconds = courses.reduce((sum, course) => sum + (course.trackedSeconds ?? 0), 0);
  return Number(((minutes * 60 + seconds) / 3600).toFixed(1));
}

const priorityRank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

const examTypeLabel: Record<Exam['type'], string> = {
  Quiz: 'Kiểm tra (Quiz)',
  Midterm: 'Giữa kỳ (Midterm)',
  Final: 'Cuối kỳ (Final)',
  Certification: 'Chứng chỉ',
};

export default function StudyPage({
  userId,
  courses,
  sessions,
  logs,
  assignments: allAssignments,
  exams: allExams,
  notes: allNotes,
  summary,
  loading,
  onRefresh,
  onNotice,
  activeTab = 'courses',
  onTabChange,
  selectedCourseId,
  selectedAssignmentId,
  selectedExamId,
  selectedNoteId,
  onSelectStudyTarget,
  openTarget,
  onTargetOpened,
  recommendations,
}: Props) {
  const filterStorageKey = `lifeos:study-filters:${userId}`;
  const initialStored = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(filterStorageKey) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }, [filterStorageKey]);

  const [tabState, setTabState] = useState<StudyTab>(activeTab);
  const courseWorkspace = courses.find((course) => course.id === selectedCourseId);
  const workspaceId = courseWorkspace?.id;
  const tab = workspaceId && !courseTabs.includes(tabState) ? 'assignments' : tabState;
  const assignments = useMemo(() => workspaceId ? allAssignments.filter((item) => item.courseId === workspaceId) : allAssignments, [allAssignments, workspaceId]);
  const exams = useMemo(() => workspaceId ? allExams.filter((item) => item.courseId === workspaceId) : allExams, [allExams, workspaceId]);
  const notes = useMemo(() => workspaceId ? allNotes.filter((item) => item.courseId === workspaceId) : allNotes, [allNotes, workspaceId]);
  const [highlightedId, setHighlightedId] = useState<string | null>(
    selectedAssignmentId || selectedExamId || selectedNoteId || null,
  );

  // Courses state
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(blankCourse);
  const [courseFormError, setCourseFormError] = useState('');
  const [semesterFilter, setSemesterFilter] = useState<string>(() => initialStored.semesterFilter || 'all');
  const [courseStatusFilter, setCourseStatusFilter] = useState<string>(() =>
    safeEnum(initialStored.courseStatusFilter === 'Archived' ? 'Completed' : initialStored.courseStatusFilter, VALID_COURSE_STATUS, 'all'),
  );

  // Assignments state
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft>(emptyAssignment);
  const [assignmentFormError, setAssignmentFormError] = useState('');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<string>(() =>
    safeEnum(initialStored.assignmentStatusFilter, VALID_ASSIGNMENT_STATUS, 'all'),
  );
  const [assignmentPriorityFilter, setAssignmentPriorityFilter] = useState<string>(() =>
    safeEnum(initialStored.assignmentPriorityFilter, VALID_PRIORITY, 'all'),
  );
  const [assignmentCourseFilter, setAssignmentCourseFilter] = useState<string>(
    () => initialStored.assignmentCourseFilter || 'all',
  );
  const [assignmentSort, setAssignmentSort] = useState<string>(() =>
    safeEnum(
      initialStored.assignmentSort || localStorage.getItem('lifeos:assignment-sort'),
      VALID_ASSIGNMENT_SORT,
      'deadline',
    ),
  );

  // Exams state
  const [showExamForm, setShowExamForm] = useState(false);
  const [editingExam, setEditingExam] = useState<string | null>(null);
  const [examDraft, setExamDraft] = useState<ExamDraft>(emptyExam);
  const [examFormError, setExamFormError] = useState('');
  const [examCourseFilter, setExamCourseFilter] = useState<string>(() => initialStored.examCourseFilter || 'all');
  const [examStateFilter, setExamStateFilter] = useState<string>(() =>
    safeEnum(initialStored.examStateFilter, VALID_EXAM_STATE, 'all'),
  );

  // Notes state
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(emptyNote);
  const [noteFormError, setNoteFormError] = useState('');
  const [noteQuery, setNoteQuery] = useState('');
  const [noteCourseFilter, setNoteCourseFilter] = useState<string>(() => initialStored.noteCourseFilter || 'all');
  const [noteTagFilter, setNoteTagFilter] = useState<string>(() => initialStored.noteTagFilter || 'all');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const [sessionCourse, setSessionCourse] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>(blankSession);
  const [sessionFormError, setSessionFormError] = useState('');
  const [showCourseSchedule, setShowCourseSchedule] = useState(false);

  // Study journal
  const [showLogForm, setShowLogForm] = useState(false);
  const [logDraft, setLogDraft] = useState(emptyStudyLog);
  const [logError, setLogError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);
  const [resourceDialog, setResourceDialog] = useState<{ kind: 'files' | 'timer'; assignment: Assignment } | null>(null);
  const [filesBusy, setFilesBusy] = useState(false);
  const [courseTimer, setCourseTimer] = useState<ProjectTimerState | null>(null);
  const [timerRevision, setTimerRevision] = useState(0);
  const refreshTimerSummary = () => {
    setTimerRevision((value) => value + 1);
    void onRefresh().catch(() => undefined);
  };

  const checkedDeepLinkRef = useRef<string | null>(null);

  const setTab = (next: StudyTab) => {
    setTabState(next);
    if (selectedCourseId) onSelectStudyTarget?.({ tab: next, courseId: selectedCourseId });
    else onTabChange?.(next);
  };

  const openCourse = (id: string | null) => {
    onSelectStudyTarget?.({ tab: id ? 'assignments' : 'courses', courseId: id });
  };

  useEffect(() => {
    if (activeTab && activeTab !== tab) setTabState(activeTab);
  }, [activeTab]);

  useEffect(() => {
    setShowCourseForm(false);
    setShowAssignmentForm(false);
    setShowExamForm(false);
    setShowNoteForm(false);
    setSessionCourse(null);
    setShowCourseSchedule(false);
    setResourceDialog(null);
    setFilesBusy(false);
    setCourseTimer(null);
  }, [selectedCourseId]);

  useEffect(() => {
    if (!workspaceId || tab !== 'assignments' || !assignments.length) return;
    const controller = new AbortController();
    void api<ProjectTimerState>(`/study/courses/${workspaceId}/timer`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setCourseTimer(result);
    }).catch(() => {
      if (!controller.signal.aborted) setCourseTimer(null);
    });
    return () => controller.abort();
  }, [workspaceId, assignments.length, tab, timerRevision]);

  const semesters = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) {
      if (c.semester?.trim()) set.add(c.semester.trim());
    }
    return Array.from(set).sort();
  }, [courses]);

  const allNoteTags = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) {
      for (const tag of n.tags ?? []) {
        if (tag.trim()) s.add(tag.trim());
      }
    }
    return Array.from(s).sort();
  }, [notes]);

  // Reset stored semester/course/tag filter if the referenced course/semester/tag no longer exists
  useEffect(() => {
    if (loading) return;
    if (semesterFilter !== 'all' && !semesters.includes(semesterFilter)) setSemesterFilter('all');
    if (assignmentCourseFilter !== 'all' && !courses.some((c) => c.id === assignmentCourseFilter))
      setAssignmentCourseFilter('all');
    if (examCourseFilter !== 'all' && !courses.some((c) => c.id === examCourseFilter)) setExamCourseFilter('all');
    if (noteCourseFilter !== 'all' && !courses.some((c) => c.id === noteCourseFilter)) setNoteCourseFilter('all');
    if (noteTagFilter !== 'all' && !allNoteTags.includes(noteTagFilter)) setNoteTagFilter('all');
  }, [
    loading,
    semesters,
    courses,
    allNoteTags,
    semesterFilter,
    assignmentCourseFilter,
    examCourseFilter,
    noteCourseFilter,
    noteTagFilter,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(
        filterStorageKey,
        JSON.stringify({
          semesterFilter,
          courseStatusFilter,
          assignmentStatusFilter,
          assignmentPriorityFilter,
          assignmentCourseFilter,
          assignmentSort,
          examCourseFilter,
          examStateFilter,
          noteCourseFilter,
          noteTagFilter,
        }),
      );
      localStorage.setItem('lifeos:assignment-sort', assignmentSort);
    } catch {
      /* ignore quota errors */
    }
  }, [
    filterStorageKey,
    semesterFilter,
    courseStatusFilter,
    assignmentStatusFilter,
    assignmentPriorityFilter,
    assignmentCourseFilter,
    assignmentSort,
    examCourseFilter,
    examStateFilter,
    noteCourseFilter,
    noteTagFilter,
  ]);

  // Verify deep link from URL once data is loaded
  useEffect(() => {
    if (loading) return;
    const key = `${selectedCourseId ?? ''}:${selectedAssignmentId ?? ''}:${selectedExamId ?? ''}:${selectedNoteId ?? ''}`;
    if (key === ':::') {
      checkedDeepLinkRef.current = null;
      return;
    }
    if (checkedDeepLinkRef.current === key) return;
    checkedDeepLinkRef.current = key;

    let targetElId = '';
    if (selectedCourseId && !workspaceId) {
      onNotice({ message: 'Không tìm thấy môn học được liên kết hoặc môn học đã bị xóa.', type: 'warning' });
      onSelectStudyTarget?.({ tab: 'courses', courseId: null });
      return;
    }
    if (selectedAssignmentId) {
      if (!assignments.some((a) => a.id === selectedAssignmentId)) {
        onNotice({ message: 'Không tìm thấy bài tập được liên kết hoặc bài tập đã bị xóa.', type: 'warning' });
        onSelectStudyTarget?.({ tab, courseId: workspaceId ?? null, assignmentId: null });
        return;
      }
      setAssignmentStatusFilter('all');
      setAssignmentPriorityFilter('all');
      setAssignmentCourseFilter('all');
      setHighlightedId(selectedAssignmentId);
      targetElId = `assignment-${selectedAssignmentId}`;
    } else if (selectedExamId) {
      if (!exams.some((e) => e.id === selectedExamId)) {
        onNotice({ message: 'Không tìm thấy kỳ thi được liên kết hoặc kỳ thi đã bị xóa.', type: 'warning' });
        onSelectStudyTarget?.({ tab, courseId: workspaceId ?? null, examId: null });
        return;
      }
      setExamCourseFilter('all');
      setExamStateFilter('all');
      setHighlightedId(selectedExamId);
      targetElId = `exam-${selectedExamId}`;
    } else if (selectedNoteId) {
      if (!notes.some((n) => n.id === selectedNoteId)) {
        onNotice({ message: 'Không tìm thấy ghi chú được liên kết hoặc ghi chú đã bị xóa.', type: 'warning' });
        onSelectStudyTarget?.({ tab, courseId: workspaceId ?? null, noteId: null });
        return;
      }
      setNoteCourseFilter('all');
      setNoteTagFilter('all');
      setNoteQuery('');
      setHighlightedId(selectedNoteId);
      targetElId = `note-${selectedNoteId}`;
    }

    if (targetElId) {
      const t = window.setTimeout(() => {
        document.getElementById(targetElId)?.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
        });
      }, 150);
      const ht = window.setTimeout(() => setHighlightedId(null), 4500);
      return () => {
        window.clearTimeout(t);
        window.clearTimeout(ht);
      };
    }
  }, [
    loading,
    courses,
    workspaceId,
    assignments,
    exams,
    notes,
    selectedCourseId,
    selectedAssignmentId,
    selectedExamId,
    selectedNoteId,
    tab,
    onNotice,
    onSelectStudyTarget,
  ]);

  useEffect(() => {
    if (!openTarget) return;
    let targetElId = '';
    if (openTarget.kind === 'course' && openTarget.courseId) {
      setSemesterFilter('all');
      setCourseStatusFilter('all');
      targetElId = `course-${openTarget.courseId}`;
    } else if (openTarget.kind === 'assignment' && openTarget.assignmentId) {
      setAssignmentStatusFilter('all');
      setAssignmentPriorityFilter('all');
      setAssignmentCourseFilter('all');
      targetElId = `assignment-${openTarget.assignmentId}`;
      setHighlightedId(openTarget.assignmentId);
    } else if (openTarget.kind === 'exam' && openTarget.examId) {
      setExamCourseFilter('all');
      setExamStateFilter('all');
      targetElId = `exam-${openTarget.examId}`;
      setHighlightedId(openTarget.examId);
    } else if (openTarget.kind === 'note' && openTarget.noteId) {
      setNoteCourseFilter('all');
      setNoteTagFilter('all');
      setNoteQuery('');
      targetElId = `note-${openTarget.noteId}`;
      setHighlightedId(openTarget.noteId);
    }
    if (!targetElId) return;
    const t = window.setTimeout(() => {
      document.getElementById(targetElId)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
      });
      onTargetOpened?.();
    }, 180);
    const ht = window.setTimeout(() => setHighlightedId(null), 4500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(ht);
    };
  }, [openTarget]);

  const isCourseScoped = semesterFilter !== 'all' || courseStatusFilter !== 'all';

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (semesterFilter !== 'all' && c.semester !== semesterFilter) return false;
      if (courseStatusFilter !== 'all' && (c.status || 'Active') !== courseStatusFilter) return false;
      return true;
    });
  }, [courses, semesterFilter, courseStatusFilter]);

  const filteredCourseIdSet = useMemo(() => new Set(filteredCourses.map((c) => c.id)), [filteredCourses]);

  const scopedLogs = useMemo(() => {
    if (!isCourseScoped) return logs;
    return logs.filter((l) => l.courseId && filteredCourseIdSet.has(l.courseId));
  }, [logs, isCourseScoped, filteredCourseIdSet]);

  const scopedAssignmentsForSummary = useMemo(() => {
    if (!isCourseScoped) return assignments;
    return assignments.filter((a) => a.courseId && filteredCourseIdSet.has(a.courseId));
  }, [assignments, isCourseScoped, filteredCourseIdSet]);

  const scopedExamsForSummary = useMemo(() => {
    if (!isCourseScoped) return exams;
    return exams.filter((e) => e.courseId && filteredCourseIdSet.has(e.courseId));
  }, [exams, isCourseScoped, filteredCourseIdSet]);

  const weekDays = useMemo(() => {
    const monday = weekStartFor(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    return weekdayNames.map((name, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { name, iso, date, weekday: i + 1 };
    });
  }, [weekOffset]);

  const minutesByDate = useMemo(
    () =>
      scopedLogs.reduce<Record<string, number>>((totals, log) => {
        totals[log.date] = (totals[log.date] ?? 0) + log.durationMinutes;
        return totals;
      }, {}),
    [scopedLogs],
  );

  const currentWeekMinutes = weekDays.reduce((sum, day) => sum + (minutesByDate[day.iso] ?? 0), 0);
  const totalStudyHours = useMemo(
    () => computeUnifiedStudyHours(filteredCourses, logs, !isCourseScoped),
    [filteredCourses, logs, isCourseScoped],
  );

  const safeRefreshAfterMutation = async (successMessage: string) => {
    try {
      await onRefresh();
      onNotice({ message: successMessage, type: 'success' });
    } catch {
      onNotice({
        message: `${successMessage} Tuy nhiên chưa tải lại được dữ liệu mới nhất.`,
        type: 'warning',
        retry: () => void onRefresh(),
        retryLabel: 'Tải lại dữ liệu',
      });
    }
  };

  // --- Course CRUD ---
  const executeSaveCourse = async () => {
    if (busy) return;
    setCourseFormError('');
    if (!courseDraft.name.trim()) {
      setCourseFormError('Tên môn học không được để trống.');
      return;
    }
    const credits = Number(courseDraft.credits);
    const progress = Number(courseDraft.progress);

    if (Number.isNaN(credits) || credits < 0 || credits > 100) {
      setCourseFormError('Số tín chỉ phải từ 0 đến 100.');
      return;
    }
    if (Number.isNaN(progress) || progress < 0 || progress > 100) {
      setCourseFormError('Tiến độ môn học phải từ 0 đến 100%.');
      return;
    }

    const isEdit = Boolean(editingCourse);
    const method = isEdit ? 'PATCH' : 'POST';
    const path = isEdit ? `/study/courses/${editingCourse}` : '/study/courses';
    const payload = {
      name: courseDraft.name.trim(),
      code: courseDraft.code.trim(),
      semester: courseDraft.semester.trim(),
      instructor: courseDraft.instructor.trim(),
      credits,
      progress,
      ...(!isEdit ? { absences: 0 } : {}),
      color: courseDraft.color.trim() || '#4f8259',
      status: courseDraft.status,
    };

    setBusy(true);
    try {
      await api(path, { method, body: JSON.stringify(payload) });
      setCourseDraft(blankCourse);
      setEditingCourse(null);
      setShowCourseForm(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không lưu được môn học.';
      setCourseFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveCourse(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation(isEdit ? 'Đã cập nhật môn học.' : 'Đã thêm môn học.');
  };

  const saveCourse = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveCourse();
  };

  const deleteCourse = async (course: Course) => {
    if (itemBusyId === course.id) return;
    if (!window.confirm(`Xóa môn “${course.name}”? Lịch học của môn sẽ bị xóa, bài tập liên quan vẫn được giữ.`)) return;
    setItemBusyId(course.id);
    try {
      await api(`/study/courses/${course.id}`, { method: 'DELETE' });
      if (workspaceId === course.id) openCourse(null);
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được môn học.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa môn học.');
  };

  const startEditCourse = (course: Course) => {
    setCourseFormError('');
    setCourseDraft({
      name: course.name,
      code: course.code ?? '',
      semester: course.semester ?? '',
      instructor: course.instructor ?? '',
      credits: String(course.credits ?? 3),
      progress: String(course.progress ?? 0),
      color: course.color || '#4f8259',
      status: course.status || 'Active',
    });
    setEditingCourse(course.id);
    setShowCourseForm(true);
  };

  // --- Assignment CRUD ---
  const executeSaveAssignment = async () => {
    if (busy) return;
    setAssignmentFormError('');
    if (!assignmentDraft.title.trim()) {
      setAssignmentFormError('Tên bài tập không được để trống.');
      return;
    }
    if (!assignmentDraft.deadline) {
      setAssignmentFormError('Vui lòng chọn ngày nộp bài tập.');
      return;
    }
    const isEdit = Boolean(editingAssignment);
    const targetId = editingAssignment;
    const payload = {
      title: assignmentDraft.title.trim(),
      deadline: assignmentDraft.deadline,
      priority: assignmentDraft.priority,
      status: assignmentDraft.status || 'Not Started',
      courseId: workspaceId || assignmentDraft.courseId || null,
      ...(workspaceId ? { dependencies: assignmentDraft.dependencies } : {}),
    };
    setBusy(true);
    try {
      const path = isEdit ? `/study/assignments/${targetId}` : '/study/assignments';
      await api(path, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (isEdit) {
        const previous = assignments.find((item) => item.id === targetId);
        if (previous) localStorage.removeItem(assignmentReminderKey(previous));
      }
      setShowAssignmentForm(false);
      setEditingAssignment(null);
      setAssignmentDraft(emptyAssignment());
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không lưu được bài tập.';
      setAssignmentFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveAssignment(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation(isEdit ? 'Đã cập nhật bài tập.' : 'Đã thêm bài tập.');
  };

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveAssignment();
  };

  const startEditAssignment = (item: Assignment) => {
    setAssignmentFormError('');
    setAssignmentDraft({
      title: item.title,
      deadline: item.deadline.slice(0, 10),
      priority: item.priority,
      status: item.status || 'Not Started',
      dependencies: item.dependencies ?? [],
      courseId: item.courseId ?? '',
    });
    setEditingAssignment(item.id);
    setShowAssignmentForm(true);
  };

  const toggleAssignment = async (item: Assignment) => {
    if (itemBusyId === item.id) return;
    const isDone = item.status === 'Completed';
    setItemBusyId(item.id);
    try {
      await api(`/study/assignments/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: isDone ? 'Not Started' : 'Completed', deadline: item.deadline }),
      });
      if (isDone) localStorage.removeItem(assignmentReminderKey(item));
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không cập nhật được trạng thái bài tập.',
        type: 'error',
        retry: () => void toggleAssignment(item),
      });
      return;
    }
    setItemBusyId(null);
    await onRefresh();
  };

  const deleteAssignment = async (item: Assignment) => {
    if (itemBusyId === item.id) return;
    if (!window.confirm(`Xóa bài tập “${item.title}”?`)) return;
    setItemBusyId(item.id);
    try {
      await api(`/study/assignments/${item.id}`, { method: 'DELETE' });
      localStorage.removeItem(assignmentReminderKey(item));
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được bài tập.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa bài tập.');
  };

  const filteredAssignments = useMemo(() => {
    return [...assignments]
      .filter((a) => {
        if (assignmentStatusFilter === 'pending' && a.status === 'Completed') return false;
        if (assignmentStatusFilter === 'soon') {
          const remaining = daysUntil(a.deadline);
          if (a.status === 'Completed' || remaining < 0 || remaining > 7) return false;
        }
        if (assignmentStatusFilter === 'Overdue' && (a.status === 'Completed' || daysUntil(a.deadline) >= 0)) return false;
        if (
          assignmentStatusFilter !== 'all' &&
          assignmentStatusFilter !== 'pending' &&
          assignmentStatusFilter !== 'soon' &&
          assignmentStatusFilter !== 'Overdue' &&
          a.status !== assignmentStatusFilter
        )
          return false;
        if (assignmentPriorityFilter !== 'all' && a.priority !== assignmentPriorityFilter) return false;
        if (!workspaceId && assignmentCourseFilter !== 'all' && (a.courseId || '') !== assignmentCourseFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (assignmentSort === 'priority') {
          return (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0);
        }
        if (assignmentSort === 'title') {
          return a.title.localeCompare(b.title, 'vi');
        }
        return Number(a.status === 'Completed') - Number(b.status === 'Completed') || a.deadline.localeCompare(b.deadline);
      });
  }, [assignments, assignmentStatusFilter, assignmentPriorityFilter, assignmentCourseFilter, assignmentSort, workspaceId]);

  // --- Exam CRUD ---
  const executeSaveExam = async () => {
    if (busy) return;
    setExamFormError('');
    if (!examDraft.title.trim()) {
      setExamFormError('Tên kỳ thi không được để trống.');
      return;
    }
    const weight = Number(examDraft.weight);
    const prepProgress = Number(examDraft.prepProgress);
    if (Number.isNaN(weight) || weight < 0 || weight > 100) {
      setExamFormError('Trọng số điểm phải từ 0 đến 100%.');
      return;
    }
    if (Number.isNaN(prepProgress) || prepProgress < 0 || prepProgress > 100) {
      setExamFormError('Tiến độ ôn tập phải từ 0 đến 100%.');
      return;
    }
    const isEdit = Boolean(editingExam);
    const payload = {
      title: examDraft.title.trim(),
      courseId: workspaceId || examDraft.courseId || null,
      date: examDraft.date,
      type: examDraft.type,
      weight,
      prepProgress,
    };
    setBusy(true);
    try {
      const path = isEdit ? `/study/exams/${editingExam}` : '/study/exams';
      await api(path, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setShowExamForm(false);
      setEditingExam(null);
      setExamDraft(emptyExam());
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không lưu được kỳ thi.';
      setExamFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveExam(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation(isEdit ? 'Đã cập nhật kỳ thi.' : 'Đã thêm kỳ thi mới.');
  };

  const saveExam = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveExam();
  };

  const startEditExam = (exam: Exam) => {
    setExamFormError('');
    setExamDraft({
      title: exam.title,
      courseId: exam.courseId ?? '',
      date: exam.date.slice(0, 10),
      type: exam.type,
      weight: String(exam.weight ?? 0),
      prepProgress: String(exam.prepProgress ?? 0),
    });
    setEditingExam(exam.id);
    setShowExamForm(true);
  };

  const updateExamPrep = async (exam: Exam, nextPrep: number) => {
    if (itemBusyId === exam.id) return;
    const clamped = Math.min(100, Math.max(0, nextPrep));
    setItemBusyId(exam.id);
    try {
      await api(`/study/exams/${exam.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ prepProgress: clamped }),
      });
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không cập nhật được tiến độ ôn tập.',
        type: 'error',
        retry: () => void updateExamPrep(exam, nextPrep),
      });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation(`Đã cập nhật tiến độ ôn tập "${exam.title}": ${clamped}%.`);
  };

  const deleteExam = async (exam: Exam) => {
    if (itemBusyId === exam.id) return;
    if (!window.confirm(`Xóa kỳ thi “${exam.title}”?`)) return;
    setItemBusyId(exam.id);
    try {
      await api(`/study/exams/${exam.id}`, { method: 'DELETE' });
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được kỳ thi.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa kỳ thi.');
  };

  const filteredExams = useMemo(() => {
    return [...exams]
      .filter((exam) => {
        if (!workspaceId && examCourseFilter !== 'all' && (exam.courseId || '') !== examCourseFilter) return false;
        const remaining = daysUntil(exam.date);
        if (examStateFilter === 'upcoming' && remaining < 0) return false;
        if (examStateFilter === 'past' && remaining >= 0) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [exams, examCourseFilter, examStateFilter, workspaceId]);

  // --- Note CRUD ---
  const executeSaveNote = async () => {
    if (busy) return;
    setNoteFormError('');
    if (!noteDraft.title.trim()) {
      setNoteFormError('Tiêu đề ghi chú không được để trống.');
      return;
    }
    const rawTags = noteDraft.tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (rawTags.length > 30) {
      setNoteFormError('Tối đa 30 thẻ (tag) cho mỗi ghi chú.');
      return;
    }
    if (rawTags.some((t) => t.length > 40)) {
      setNoteFormError('Mỗi thẻ (tag) không được vượt quá 40 ký tự.');
      return;
    }
    if (noteDraft.content.length > 50000) {
      setNoteFormError('Nội dung ghi chú không được vượt quá 50.000 ký tự.');
      return;
    }
    const isEdit = Boolean(editingNote);
    const payload = {
      title: noteDraft.title.trim(),
      courseId: workspaceId || noteDraft.courseId || null,
      date: noteDraft.date || todayString(),
      tags: rawTags,
      content: noteDraft.content,
    };
    setBusy(true);
    try {
      const path = isEdit ? `/study/notes/${editingNote}` : '/study/notes';
      await api(path, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setShowNoteForm(false);
      setEditingNote(null);
      setNoteDraft(emptyNote());
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không lưu được ghi chú.';
      setNoteFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveNote(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation(isEdit ? 'Đã cập nhật ghi chú.' : 'Đã thêm ghi chú học tập.');
  };

  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveNote();
  };

  const startEditNote = (note: StudyNote) => {
    setNoteFormError('');
    setNoteDraft({
      title: note.title,
      courseId: note.courseId ?? '',
      date: note.date.slice(0, 10),
      tagsText: (note.tags ?? []).join(', '),
      content: note.content ?? '',
    });
    setEditingNote(note.id);
    setShowNoteForm(true);
  };

  const deleteNote = async (note: StudyNote) => {
    if (itemBusyId === note.id) return;
    if (!window.confirm(`Xóa ghi chú “${note.title}”?`)) return;
    setItemBusyId(note.id);
    try {
      await api(`/study/notes/${note.id}`, { method: 'DELETE' });
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được ghi chú.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa ghi chú.');
  };

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLocaleLowerCase('vi-VN');
    return [...notes]
      .filter((n) => {
        if (!workspaceId && noteCourseFilter !== 'all' && (n.courseId || '') !== noteCourseFilter) return false;
        if (noteTagFilter !== 'all' && !(n.tags ?? []).includes(noteTagFilter)) return false;
        if (q) {
          const text = `${n.title} ${n.content} ${(n.tags ?? []).join(' ')}`.toLocaleLowerCase('vi-VN');
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [notes, noteCourseFilter, noteTagFilter, noteQuery, workspaceId]);

  // --- Course Session CRUD ---
  const executeSaveSession = async () => {
    if (!sessionCourse || busy) return;
    setSessionFormError('');
    const payload = {
      courseId: sessionCourse,
      weekday: Number(sessionDraft.weekday),
      startTime: sessionDraft.startTime,
      endTime: sessionDraft.endTime,
      periodStart: Number(sessionDraft.periodStart),
      periodEnd: Number(sessionDraft.periodEnd),
      location: sessionDraft.location.trim(),
      room: sessionDraft.room.trim(),
      color: '',
    };
    if (payload.endTime <= payload.startTime) {
      const msg = 'Giờ kết thúc phải sau giờ bắt đầu.';
      setSessionFormError(msg);
      onNotice({ message: msg, type: 'error' });
      return;
    }
    if (payload.periodEnd < payload.periodStart) {
      const msg = 'Tiết kết thúc phải bằng hoặc sau tiết bắt đầu.';
      setSessionFormError(msg);
      onNotice({ message: msg, type: 'error' });
      return;
    }
    const isEdit = Boolean(editingSession);
    setBusy(true);
    try {
      await api(isEdit ? `/study/course-sessions/${editingSession}` : '/study/course-sessions', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setSessionDraft(blankSession);
      setEditingSession(null);
      setSessionCourse(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không lưu được lịch học.';
      setSessionFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveSession(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation(isEdit ? 'Đã cập nhật lịch học.' : 'Đã thêm lịch học.');
  };

  const saveSession = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveSession();
  };

  const beginEditSession = (session: CourseSession) => {
    setSessionFormError('');
    setSessionCourse(session.courseId);
    setEditingSession(session.id);
    setSessionDraft({
      weekday: String(session.weekday),
      startTime: session.startTime,
      endTime: session.endTime,
      periodStart: String(session.periodStart),
      periodEnd: String(session.periodEnd),
      location: session.location,
      room: session.room,
    });
  };

  const deleteSession = async (session: CourseSession) => {
    if (itemBusyId === session.id) return;
    if (!window.confirm('Xóa buổi học này khỏi lịch trình?')) return;
    setItemBusyId(session.id);
    try {
      await api(`/study/course-sessions/${session.id}`, { method: 'DELETE' });
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được lịch học.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa buổi học khỏi lịch trình.');
  };

  const startStudyLog = () => {
    setLogDraft(emptyStudyLog());
    setLogError('');
    setShowLogForm(true);
  };

  const saveLog = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const durationMinutes = Number(logDraft.minutes);
    if (!logDraft.date || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      setLogError('Chọn ngày học và nhập từ 1 đến 1.440 phút.');
      return;
    }
    setLogError('');
    setBusy(true);
    try {
      await api('/study/study-logs', { method: 'POST', body: JSON.stringify({
        date: logDraft.date, durationMinutes, courseId: logDraft.courseId || null, note: logDraft.note.trim(),
      }) });
    } catch (error) {
      setLogError(error instanceof Error ? error.message : 'Không lưu được thời gian học.');
      setBusy(false);
      return;
    }
    setShowLogForm(false);
    setBusy(false);
    await safeRefreshAfterMutation('Đã lưu thời gian học.');
  };

  const deleteLog = async (log: StudyLog) => {
    if (itemBusyId === log.id) return;
    if (!window.confirm('Xóa bản ghi thời gian học này?')) return;
    setItemBusyId(log.id);
    try {
      await api(`/study/study-logs/${log.id}`, { method: 'DELETE' });
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được bản ghi.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa bản ghi thời gian học.');
  };

  const courseOptions = useMemo(
    () =>
      [...courses].sort((a, b) => {
        if ((a.status || 'Active') !== (b.status || 'Active')) {
          return (a.status || 'Active') === 'Active' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'vi');
      }),
    [courses],
  );

  const sessionForm = (courseId: string) =>
    sessionCourse === courseId && (
      <form className="session-form" onSubmit={(event) => void saveSession(event)}>
        <label>
          Ngày trong tuần
          <select
            value={sessionDraft.weekday}
            onChange={(event) => setSessionDraft({ ...sessionDraft, weekday: event.target.value })}
          >
            {weekdayNames.map((day, i) => (
              <option key={day} value={i + 1}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bắt đầu
          <input
            type="time"
            value={sessionDraft.startTime}
            onChange={(event) => setSessionDraft({ ...sessionDraft, startTime: event.target.value })}
            required
          />
        </label>
        <label>
          Kết thúc
          <input
            type="time"
            value={sessionDraft.endTime}
            onChange={(event) => setSessionDraft({ ...sessionDraft, endTime: event.target.value })}
            required
          />
        </label>
        <label>
          Tiết bắt đầu
          <input
            type="number"
            min="1"
            max="30"
            value={sessionDraft.periodStart}
            onChange={(event) => setSessionDraft({ ...sessionDraft, periodStart: event.target.value })}
            required
          />
        </label>
        <label>
          Tiết kết thúc
          <input
            type="number"
            min="1"
            max="30"
            value={sessionDraft.periodEnd}
            onChange={(event) => setSessionDraft({ ...sessionDraft, periodEnd: event.target.value })}
            required
          />
        </label>
        <label>
          Địa điểm
          <input
            value={sessionDraft.location}
            onChange={(event) => setSessionDraft({ ...sessionDraft, location: event.target.value })}
            placeholder="Ví dụ: Cơ sở A"
            maxLength={120}
          />
        </label>
        <label>
          Phòng học
          <input
            value={sessionDraft.room}
            onChange={(event) => setSessionDraft({ ...sessionDraft, room: event.target.value })}
            placeholder="Ví dụ: A203"
            maxLength={80}
          />
        </label>
        {sessionFormError && (
          <div className="form-error session-form-actions" role="alert">
            {sessionFormError}
          </div>
        )}
        <div className="session-form-actions">
          <button className="primary-button" disabled={busy}>
            <Check size={15} /> {editingSession ? 'Lưu lịch' : 'Thêm lịch'}
          </button>
          <button
            className="soft-button"
            type="button"
            onClick={() => {
              setSessionCourse(null);
              setEditingSession(null);
              setSessionFormError('');
              setSessionDraft(blankSession);
            }}
          >
            Hủy
          </button>
        </div>
      </form>
    );

  const renderCourseSchedule = (course: Course) => {
    const courseSessions = sessions.filter((session) => session.courseId === course.id)
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
    return <CalendarDialog title="Lịch học" busy={busy} wide onClose={() => {
      setShowCourseSchedule(false);
      setSessionCourse(null);
      setEditingSession(null);
      if (tabState === 'course-schedule') setTab('assignments');
    }}>
      <div className="course-schedule-pane">
        <div className="course-session-list">
          {courseSessions.length ? (
            courseSessions.map((session) => (
              <div className="course-session-row" key={session.id}>
                <div className="session-time">
                  <strong>{weekdayNames[session.weekday - 1]}</strong>
                  <span>
                    {session.startTime}–{session.endTime} · Tiết {session.periodStart}
                    {session.periodEnd !== session.periodStart ? `–${session.periodEnd}` : ''}
                  </span>
                </div>
                <span className="session-location">
                  <MapPin size={13} />
                  {[session.location, session.room].filter(Boolean).join(' · ') ||
                    'Chưa đặt địa điểm/phòng'}
                </span>
                <div className="course-card-actions">
                  <button
                    className="icon-button"
                    type="button"
                    title="Sửa lịch học"
                    aria-label="Sửa lịch học"
                    onClick={() => beginEditSession(session)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    type="button"
                    disabled={itemBusyId === session.id}
                    title="Xóa lịch học"
                    aria-label="Xóa lịch học"
                    onClick={() => void deleteSession(session)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="course-no-sessions">Chưa có lịch lên lớp.</div>
          )}
        </div>
        <button
          className="text-button add-session-button"
          type="button"
          onClick={() => {
            setSessionCourse(course.id);
            setEditingSession(null);
            setSessionFormError('');
            setSessionDraft(blankSession);
          }}
        >
          <Plus size={14} /> Thêm buổi học
        </button>
        {sessionForm(course.id)}
      </div>
    </CalendarDialog>;
  };

  const showCoursesSection = !workspaceId && tab === 'courses';
  const showAssignmentsSection = tab === 'assignments';
  const showExamsSection = tab === 'exams';
  const showNotesSection = tab === 'notes';

  const studyTabs = courseWorkspace ? [
    { id: 'assignments', label: 'Bài tập', icon: ClipboardList, count: undefined },
    { id: 'documents', label: 'Tài liệu', icon: FolderOpen, count: undefined },
    { id: 'exams', label: 'Kỳ thi', icon: Award, count: undefined },
    { id: 'notes', label: 'Ghi chú', icon: FileText, count: undefined },
  ] as const : [
    { id: 'courses', label: 'Môn học', icon: BookOpen, count: courses.length },
    { id: 'assignments', label: 'Bài tập', icon: ClipboardList, count: assignments.filter((item) => item.status !== 'Completed').length },
    { id: 'exams', label: 'Kỳ thi', icon: Award, count: exams.length },
    { id: 'notes', label: 'Ghi chú', icon: FileText, count: notes.length },
    { id: 'time', label: 'Nhật ký học', icon: Clock3, count: undefined },
    { id: 'recommendations', label: 'Gợi ý học', icon: Lightbulb, count: undefined },
  ] as const;

  const startNewAssignment = () => {
    setEditingAssignment(null);
    setAssignmentFormError('');
    setAssignmentDraft({ ...emptyAssignment(), courseId: workspaceId ?? '' });
    setShowAssignmentForm(true);
  };
  const assignmentNames = new Map(assignments.map((assignment) => [assignment.id, assignment.title]));
  const completedAssignments = assignments.filter((assignment) => assignment.status === 'Completed').length;
  const courseLogMinutes = courseWorkspace ? logs
    .filter((log) => log.courseId === courseWorkspace.id).reduce((minutes, log) => minutes + log.durationMinutes, 0) : 0;
  const courseTimedSeconds = courseWorkspace?.trackedSeconds ?? 0;
  const timeSources = [courseLogMinutes > 0 && 'Nhật ký học', courseTimedSeconds > 0 && 'Bấm giờ'].filter(Boolean);
  const courseEditor = showCourseForm && (showCoursesSection || courseWorkspace) ? (
    <form className={courseWorkspace ? "study-editor course-modal-editor" : "panel study-editor"} onSubmit={(event) => void saveCourse(event)}>
      {!courseWorkspace && <div className="panel-heading">
        <div>
          <h3>{editingCourse ? 'Chỉnh sửa môn học' : 'Thêm môn học'}</h3>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Đóng"
          onClick={() => {
            setShowCourseForm(false);
            setEditingCourse(null);
            setCourseFormError('');
            setCourseDraft(blankCourse);
          }}
        >
          <X size={17} />
        </button>
      </div>}
      <div className="study-form-grid">
        <label>
          Tên môn học
          <input
            autoFocus
            value={courseDraft.name}
            onChange={(event) => setCourseDraft({ ...courseDraft, name: event.target.value })}
            required
            maxLength={160}
            placeholder="Ví dụ: Cơ sở dữ liệu"
          />
        </label>
        <label>
          Mã môn
          <input
            value={courseDraft.code}
            onChange={(event) => setCourseDraft({ ...courseDraft, code: event.target.value })}
            maxLength={40}
            placeholder="Ví dụ: IT301"
          />
        </label>
        <label>
          Học kỳ
          <input
            value={courseDraft.semester}
            onChange={(event) => setCourseDraft({ ...courseDraft, semester: event.target.value })}
            maxLength={40}
            placeholder="Ví dụ: HK1 2026-2027"
          />
        </label>
        <label>
          Giảng viên
          <input
            value={courseDraft.instructor}
            onChange={(event) => setCourseDraft({ ...courseDraft, instructor: event.target.value })}
            maxLength={120}
            placeholder="Tên giảng viên"
          />
        </label>
        <label>
          Số tín chỉ
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={courseDraft.credits}
            onChange={(event) => setCourseDraft({ ...courseDraft, credits: event.target.value })}
          />
        </label>
        <label>
          Tiến độ (%)
          <input
            type="number"
            min="0"
            max="100"
            value={courseDraft.progress}
            onChange={(event) => setCourseDraft({ ...courseDraft, progress: event.target.value })}
          />
        </label>
        <label>
          Trạng thái môn
          <select
            value={courseDraft.status}
            onChange={(event) =>
              setCourseDraft({ ...courseDraft, status: event.target.value as Course['status'] })
            }
          >
            <option value="Active">{courseStatusLabels.Active}</option>
            <option value="Completed">{courseStatusLabels.Completed}</option>
          </select>
        </label>
        <label>
          Màu nhãn môn học
          <input
            type="color"
            value={courseDraft.color || '#4f8259'}
            onChange={(event) => setCourseDraft({ ...courseDraft, color: event.target.value })}
          />
        </label>
      </div>
      {courseFormError && (
        <div className="form-error" role="alert">
          {courseFormError}
        </div>
      )}
      <div className="study-editor-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? 'Đang lưu…' : editingCourse ? 'Lưu thay đổi' : 'Thêm môn'}
        </button>
        <button
          className="soft-button"
          type="button"
          onClick={() => {
            setShowCourseForm(false);
            setEditingCourse(null);
            setCourseFormError('');
          }}
        >
          Hủy
        </button>
        {courseWorkspace && editingCourse && <button type="button" className="soft-button danger-course-button"
          disabled={busy || itemBusyId === courseWorkspace.id} onClick={() => void deleteCourse(courseWorkspace)}><Trash2 size={14} /> Xóa môn</button>}
      </div>
    </form>
  ) : null;

  if (selectedCourseId && loading && !courseWorkspace) return <p role="status">Đang tải môn học…</p>;

  return (
    <>
      {courseWorkspace ? <header className="project-detail-header planning-page course-workspace-header" id={`course-${courseWorkspace.id}`}>
        <div className="course-workspace-controls">
          <a href="/study" className="soft-button project-back" onClick={(event) => {
            if (!onSelectStudyTarget || event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
            event.preventDefault();
            openCourse(null);
          }}><ArrowLeft size={16} aria-hidden="true" /> Quay lại danh sách</a>
          <div className="course-workspace-actions">
            <button type="button" className="soft-button" onClick={() => setShowCourseSchedule(true)}><CalendarDays size={16} /> Lịch học</button>
            <button type="button" className="icon-button" title="Sửa môn" aria-label="Sửa môn" onClick={() => startEditCourse(courseWorkspace)}>
              <Pencil size={16} />
            </button>
          </div>
        </div>
        <div className="course-workspace-title">
          <h1>{courseWorkspace.name}</h1>
          <div className="project-detail-meta">
            {courseWorkspace.code && <span>{courseWorkspace.code}</span>}
            {courseWorkspace.semester && <span>{courseWorkspace.semester}</span>}
            <span>{numberFormat.format(courseWorkspace.credits)} tín chỉ</span>
            <span>{courseStatusLabels[courseWorkspace.status]}</span>
          </div>
        </div>
        <CourseAssessment key={courseWorkspace.id} course={courseWorkspace} onSaved={onRefresh}>
          <div>
            <dt>Giờ đã học</dt>
            <dd>{formatCourseStudyTime(courseLogMinutes * 60 + courseTimedSeconds)}</dd>
            {timeSources.length > 0 && <dd className="course-time-source">{timeSources.join(' · ')}</dd>}
          </div>
          <div><dt>Bài tập đã xong</dt><dd>{completedAssignments}/{assignments.length}</dd></div>
        </CourseAssessment>
      </header> : <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> HỌC TẬP CÓ CHỦ ĐÍCH
          </div>
          <h1>Không gian học tập</h1>
          <p>Quản lý môn học, lịch lên lớp, bài tập, kỳ thi, ghi chú và thời gian tự học.</p>
        </div>
        {(showCoursesSection || showAssignmentsSection) && (
          <div className="study-heading-actions">
            {showCoursesSection ? (
              <button className="primary-button" type="button" onClick={() => {
                setEditingCourse(null);
                setCourseFormError('');
                setCourseDraft(blankCourse);
                setShowCourseForm((value) => !value);
              }}><Plus size={17} /> Thêm môn học</button>
            ) : (
              <button className="primary-button" type="button" onClick={startNewAssignment}><Plus size={16} /> Thêm bài tập</button>
            )}
          </div>
        )}
      </div>}

      {loading && (
        <div className="loading-bar">
          <span />
        </div>
      )}

      <div
        className={`study-tabs-bar panel${workspaceId ? ' course-workspace-tabs' : ''}`}
        role="tablist"
        aria-label="Phân khu học tập"
        onKeyDown={(event) => {
          const index = studyTabs.findIndex((item) => item.id === tab);
          const last = studyTabs.length - 1;
          const next = event.key === 'ArrowRight' ? (index + 1) % studyTabs.length
            : event.key === 'ArrowLeft' ? (index + last) % studyTabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
          if (next === null) return;
          event.preventDefault();
          setTab(studyTabs[next].id);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
      >
        <div className="study-tabs-list">
          {studyTabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              className={`study-tab-btn ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} /> {label} {count !== undefined && <small>{count}</small>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'recommendations' && !loading && recommendations}
      {courseWorkspace && (showCourseSchedule || tabState === 'course-schedule') && renderCourseSchedule(courseWorkspace)}
      {courseWorkspace && tab === 'documents' && <section className="panel planning-panel planning-page">
        <h2>Tài liệu môn học</h2>
        <ProjectDocuments courseId={courseWorkspace.id} tasks={assignments} onOpenTask={(assignmentId) =>
          onSelectStudyTarget?.({ tab: 'assignments', courseId: courseWorkspace.id, assignmentId })} />
      </section>}
      {(showCoursesSection || tab === 'time') && (
        <div className="study-summary-grid">
          <SummaryCard
            label={isCourseScoped ? 'Môn trong bộ lọc' : 'Môn đang học'}
            value={String(
              isCourseScoped
                ? filteredCourses.length
                : courses.filter((c) => (c.status || 'Active') === 'Active').length || (summary?.activeCourses ?? 0),
            )}
            detail={
              isCourseScoped
                ? `Đang lọc ${filteredCourses.length}/${courses.length} môn`
                : `${courses.length} môn tổng cộng`
            }
            icon={<BookOpen size={18} />}
            tone="violet"
          />
          <SummaryCard
            label="Bài tập & Kỳ thi"
            value={`${scopedAssignmentsForSummary.filter((a) => a.status !== 'Completed').length} / ${scopedExamsForSummary.filter((e) => daysUntil(e.date) >= 0).length}`}
            detail={isCourseScoped ? 'Trong phạm vi môn đang lọc' : 'Bài tập chờ · Kỳ thi sắp tới'}
            icon={<CalendarDays size={18} />}
            tone="amber"
          />
          <SummaryCard
            label={isCourseScoped ? 'Giờ học (phạm vi lọc)' : 'Giờ học tích lũy'}
            value={`${totalStudyHours}h`}
            detail={
              isCourseScoped
                ? 'Theo các môn đang lọc'
                : undefined
            }
            icon={<Clock3 size={18} />}
            tone="blue"
          />
        </div>
      )}

      {/* Assignment Form */}
      {showAssignmentsSection && showAssignmentForm && (
        <CalendarDialog title={editingAssignment ? 'Chỉnh sửa bài tập' : 'Thêm bài tập'} busy={busy} wide onClose={() => {
          setShowAssignmentForm(false);
          setEditingAssignment(null);
          setAssignmentFormError('');
        }}>
          <form className="study-editor course-modal-editor" onSubmit={(event) => void saveAssignment(event)}>
            <div className="study-form-grid assignment-form-grid">
              <label>
                Tên bài tập
                <input
                  autoFocus
                  value={assignmentDraft.title}
                  onChange={(event) => setAssignmentDraft({ ...assignmentDraft, title: event.target.value })}
                  required
                  maxLength={200}
                  placeholder="Ví dụ: Nộp báo cáo cuối kỳ"
                />
              </label>
              <label>
                Ngày nộp
                <input
                  type="date"
                  value={assignmentDraft.deadline}
                  onChange={(event) => setAssignmentDraft({ ...assignmentDraft, deadline: event.target.value })}
                  required
                />
              </label>
              {!workspaceId && <label>
                Môn học
                <select
                  value={assignmentDraft.courseId}
                  onChange={(event) => setAssignmentDraft({ ...assignmentDraft, courseId: event.target.value })}
                >
                  <option value="">Chưa gắn môn học</option>
                  {courseOptions.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                      {course.status === 'Completed' ? ' (Hoàn thành)' : ''}
                    </option>
                  ))}
                </select>
              </label>}
              <label>
                Ưu tiên
                <select
                  value={assignmentDraft.priority}
                  onChange={(event) => setAssignmentDraft({ ...assignmentDraft, priority: event.target.value })}
                >
                  <option value="High">Cao</option>
                  <option value="Medium">Vừa</option>
                  <option value="Low">Thấp</option>
                </select>
              </label>
              <label>
                Trạng thái
                <select
                  value={assignmentDraft.status}
                  onChange={(event) => setAssignmentDraft({ ...assignmentDraft, status: event.target.value })}
                >
                  <option value="Not Started">Chưa bắt đầu</option>
                  <option value="In Progress">Đang làm</option>
                  <option value="Completed">Hoàn thành</option>
                  <option value="Overdue">Quá hạn</option>
                </select>
              </label>
            </div>
            {workspaceId && <details className="project-task-options" open={assignmentDraft.dependencies.length > 0 || undefined}>
              <summary>Phụ thuộc bài tập cùng môn{assignmentDraft.dependencies.length ? ` (${assignmentDraft.dependencies.length})` : ''}</summary>
              {assignments.some((item) => item.id !== editingAssignment) ? <div className="project-dependencies">
                {assignments.filter((item) => item.id !== editingAssignment).map((item) => <label key={item.id}>
                  <input type="checkbox" checked={assignmentDraft.dependencies.includes(item.id)} disabled={busy} onChange={(event) => {
                    const checked = event.target.checked;
                    setAssignmentDraft((current) => ({ ...current, dependencies: checked ? [...current.dependencies, item.id]
                      : current.dependencies.filter((id) => id !== item.id) }));
                  }} /> {item.title}
                </label>)}
              </div> : <p>Chưa có bài tập khác trong môn này.</p>}
            </details>}
            {assignmentFormError && (
              <div className="form-error" role="alert">
                {assignmentFormError}
              </div>
            )}
            <div className="study-editor-actions">
              <button className="primary-button" disabled={busy}>
                {busy ? 'Đang lưu…' : editingAssignment ? 'Lưu thay đổi' : 'Thêm bài tập'}
              </button>
              <button
                className="soft-button"
                type="button"
                onClick={() => {
                  setShowAssignmentForm(false);
                  setEditingAssignment(null);
                  setAssignmentFormError('');
                }}
              >
                Hủy
              </button>
            </div>
          </form>
        </CalendarDialog>
      )}

      {/* Course Form */}
      {courseEditor && (courseWorkspace ? <CalendarDialog title="Chỉnh sửa môn học" busy={busy} wide
        onClose={() => { setShowCourseForm(false); setEditingCourse(null); setCourseFormError(''); }}>{courseEditor}</CalendarDialog> : courseEditor)}

      {/* Exam Form */}
      {showExamsSection && showExamForm && (
        <CalendarDialog title={editingExam ? 'Chỉnh sửa kỳ thi' : 'Thêm kỳ thi'} busy={busy} wide onClose={() => {
          setShowExamForm(false);
          setEditingExam(null);
          setExamFormError('');
        }}>
          <form className="study-editor course-modal-editor" onSubmit={(event) => void saveExam(event)}>
            <div className="study-form-grid">
              <label>
                Tên kỳ thi
                <input
                  autoFocus
                  value={examDraft.title}
                  onChange={(e) => setExamDraft({ ...examDraft, title: e.target.value })}
                  required
                  maxLength={200}
                  placeholder="Ví dụ: Giữa kỳ Cấu trúc dữ liệu"
                />
              </label>
              {!workspaceId && <label>
                Môn học
                <select
                  value={examDraft.courseId}
                  onChange={(e) => setExamDraft({ ...examDraft, courseId: e.target.value })}
                >
                  <option value="">Chưa gắn môn học</option>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === 'Completed' ? ' (Hoàn thành)' : ''}
                    </option>
                  ))}
                </select>
              </label>}
              <label>
                Ngày thi
                <input
                  type="date"
                  value={examDraft.date}
                  onChange={(e) => setExamDraft({ ...examDraft, date: e.target.value })}
                  required
                />
              </label>
              <label>
                Loại kỳ thi
                <select
                  value={examDraft.type}
                  onChange={(e) => setExamDraft({ ...examDraft, type: e.target.value as Exam['type'] })}
                >
                  <option value="Quiz">Kiểm tra (Quiz)</option>
                  <option value="Midterm">Giữa kỳ (Midterm)</option>
                  <option value="Final">Cuối kỳ (Final)</option>
                  <option value="Certification">Chứng chỉ (Certification)</option>
                </select>
              </label>
              <label>
                Trọng số điểm (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={examDraft.weight}
                  onChange={(e) => setExamDraft({ ...examDraft, weight: e.target.value })}
                />
              </label>
              <label>
                Tiến độ ôn tập (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={examDraft.prepProgress}
                  onChange={(e) => setExamDraft({ ...examDraft, prepProgress: e.target.value })}
                />
              </label>
            </div>
            {examFormError && (
              <div className="form-error" role="alert">
                {examFormError}
              </div>
            )}
            <div className="study-editor-actions">
              <button className="primary-button" disabled={busy}>
                {busy ? 'Đang lưu…' : editingExam ? 'Lưu kỳ thi' : 'Thêm kỳ thi'}
              </button>
              <button
                className="soft-button"
                type="button"
                onClick={() => {
                  setShowExamForm(false);
                  setEditingExam(null);
                  setExamFormError('');
                }}
              >
                Hủy
              </button>
            </div>
          </form>
        </CalendarDialog>
      )}

      {/* Note Form */}
      {showNotesSection && showNoteForm && (
        <CalendarDialog title={editingNote ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú'} busy={busy} wide onClose={() => {
          setShowNoteForm(false);
          setEditingNote(null);
          setNoteFormError('');
        }}>
          <form className="study-editor course-modal-editor" onSubmit={(event) => void saveNote(event)}>
            <div className="study-form-grid">
              <label>
                Tiêu đề ghi chú
                <input
                  autoFocus
                  value={noteDraft.title}
                  onChange={(e) => setNoteDraft({ ...noteDraft, title: e.target.value })}
                  required
                  maxLength={200}
                  placeholder="Ví dụ: Tóm tắt cây nhị phân & Heap"
                />
              </label>
              {!workspaceId && <label>
                Môn học
                <select
                  value={noteDraft.courseId}
                  onChange={(e) => setNoteDraft({ ...noteDraft, courseId: e.target.value })}
                >
                  <option value="">Ghi chú chung</option>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === 'Completed' ? ' (Hoàn thành)' : ''}
                    </option>
                  ))}
                </select>
              </label>}
              <label>
                Ngày ghi chú
                <input
                  type="date"
                  value={noteDraft.date}
                  onChange={(e) => setNoteDraft({ ...noteDraft, date: e.target.value })}
                  required
                />
              </label>
              <label>
                Tags (ngăn cách bằng dấu phẩy)
                <input
                  value={noteDraft.tagsText}
                  onChange={(e) => setNoteDraft({ ...noteDraft, tagsText: e.target.value })}
                  placeholder="Ví dụ: DSA, Ôn thi, Chương 3"
                />
              </label>
              <label className="note-content-field">
                Nội dung ghi chú ({noteDraft.content.length}/50000)
                <textarea
                  rows={5}
                  value={noteDraft.content}
                  onChange={(e) => setNoteDraft({ ...noteDraft, content: e.target.value })}
                  maxLength={50000}
                  placeholder="Nhập nội dung chi tiết bài học, công thức hoặc danh sách ý chính…"
                />
              </label>
            </div>
            {noteFormError && (
              <div className="form-error" role="alert">
                {noteFormError}
              </div>
            )}
            <div className="study-editor-actions">
              <button className="primary-button" disabled={busy}>
                {busy ? 'Đang lưu…' : editingNote ? 'Lưu ghi chú' : 'Thêm ghi chú'}
              </button>
              <button
                className="soft-button"
                type="button"
                onClick={() => {
                  setShowNoteForm(false);
                  setEditingNote(null);
                  setNoteFormError('');
                }}
              >
                Hủy
              </button>
            </div>
          </form>
        </CalendarDialog>
      )}

      {tab === 'time' && showLogForm && <CalendarDialog title="Ghi thời gian học" busy={busy} onClose={() => setShowLogForm(false)}>
        <form className="project-task-editor" onSubmit={(event) => void saveLog(event)}>
          <label className="planning-field">Môn học
            <select value={logDraft.courseId} onChange={(event) => setLogDraft({ ...logDraft, courseId: event.target.value })}>
              <option value="">Tự học chung</option>
              {courseOptions.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </label>
          <div className="planning-form">
            <label className="planning-field">Ngày học
              <input type="date" required value={logDraft.date} onChange={(event) => setLogDraft({ ...logDraft, date: event.target.value })} />
            </label>
            <label className="planning-field">Số phút đã học
              <input type="number" required min={1} max={1440} step={1} value={logDraft.minutes}
                onChange={(event) => setLogDraft({ ...logDraft, minutes: event.target.value })} />
            </label>
          </div>
          <label className="planning-field">Ghi chú
            <input maxLength={500} value={logDraft.note} onChange={(event) => setLogDraft({ ...logDraft, note: event.target.value })} />
          </label>
          {logError && <p className="form-error" role="alert">{logError}</p>}
          <div className="planning-actions">
            <button className="primary-button" disabled={busy}>Lưu thời gian</button>
            <button type="button" className="soft-button" disabled={busy} onClick={() => setShowLogForm(false)}>Hủy</button>
          </div>
        </form>
      </CalendarDialog>}

      {/* Courses Panel */}
      {showCoursesSection && (
        <section className="panel course-list-panel">
          <div className="panel-heading">
            <div>
              <h3>Môn học của bạn</h3>
            </div>
            <div className="panel-heading-tools">
              {semesters.length > 0 && (
                <select
                  aria-label="Lọc theo học kỳ"
                  className="compact-select"
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                >
                  <option value="all">Tất cả học kỳ</option>
                  {semesters.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Lọc trạng thái môn"
                className="compact-select"
                value={courseStatusFilter}
                onChange={(e) => setCourseStatusFilter(e.target.value)}
              >
                <option value="all">Mọi trạng thái</option>
                <option value="Active">{courseStatusLabels.Active}</option>
                <option value="Completed">{courseStatusLabels.Completed}</option>
              </select>
              {isCourseScoped && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSemesterFilter('all');
                    setCourseStatusFilter('all');
                  }}
                >
                  Xóa bộ lọc
                </button>
              )}
              <span className="count-pill">{filteredCourses.length} môn</span>
            </div>
          </div>

          {loading && !courses.length ? (
            <div className="course-list" aria-busy="true" aria-label="Đang tải danh sách môn học">
              {[0, 1].map((idx) => (
                <div className="course-card skeleton-card" key={idx} style={{ padding: 14 }}>
                  <div className="skeleton-line skeleton-title" />
                  <div className="skeleton-line skeleton-short" />
                </div>
              ))}
            </div>
          ) : filteredCourses.length ? (
            <div className="course-list">
              {filteredCourses.map((course, index) => {
                const courseAssignments = allAssignments.filter((assignment) => assignment.courseId === course.id);
                const completed = courseAssignments.filter((assignment) => assignment.status === 'Completed').length;
                const grade = courseLetterGrade(course.score10);
                return <article className="course-card" key={course.id}>
                  <a className="course-card-summary course-workspace-link" href={`/study?tab=assignments&course=${encodeURIComponent(course.id)}`}
                    onClick={(event) => {
                      if (!onSelectStudyTarget || event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
                      event.preventDefault();
                      openCourse(course.id);
                    }}>
                    <div className={`course-badge course-${index % 4}`}
                      style={course.color ? { backgroundColor: `${course.color}22`, color: course.color } : undefined}><BookOpen size={18} /></div>
                    <div className="course-card-title">
                      <div className="course-title-row">
                        <strong>{course.name}</strong>
                        {course.status === 'Completed' && <span className="course-completed-pill">Hoàn thành</span>}
                        {grade && <span className="grade-pill">{grade}</span>}
                      </div>
                      <span>{[course.code, course.semester, course.instructor, course.credits ? `${course.credits} tín chỉ` : ''].filter(Boolean).join(' · ')}</span>
                      <small>{completed}/{courseAssignments.length} bài tập hoàn thành</small>
                    </div>
                    <ChevronRight size={17} aria-hidden="true" />
                  </a>
                </article>;
              })}
            </div>
          ) : (
            <div className="study-empty">
              <BookOpen size={24} />
              <strong>{courses.length ? 'Không có môn học khớp bộ lọc' : 'Chưa có môn học'}</strong>
              <span>
                {courses.length
                  ? 'Thử chọn Tất cả học kỳ hoặc xóa bộ lọc trạng thái.'
                  : 'Thêm môn học đầu tiên để bắt đầu tạo lịch học.'}
              </span>
              {courses.length > 0 && isCourseScoped && (
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    setSemesterFilter('all');
                    setCourseStatusFilter('all');
                  }}
                >
                  Xóa bộ lọc môn học
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'time' && (
          <section className="panel heatmap-panel">
            <div className="panel-heading">
              <div>
                <h3>Thời gian tự học trong tuần</h3>
                <p>
                  {Math.floor(currentWeekMinutes / 60)} giờ {currentWeekMinutes % 60} phút đã ghi nhận trong tuần · Tổng
                  tích lũy {totalStudyHours} giờ
                  {isCourseScoped ? ' (theo phạm vi lọc môn)' : ''}
                </p>
              </div>
              <div className="week-controls">
                <button
                  className="icon-button"
                  type="button"
                  title="Tuần trước"
                  aria-label="Tuần trước"
                  onClick={() => setWeekOffset((value) => value - 1)}
                >
                  <ArrowLeft size={16} />
                </button>
                <span>
                  {weekOffset === 0
                    ? 'Tuần này'
                    : weekOffset === -1
                      ? 'Tuần trước'
                      : `${dateLabel(weekDays[0].iso)} – ${dateLabel(weekDays[6].iso)}`}
                </span>
                <button
                  className="icon-button"
                  type="button"
                  title="Tuần sau"
                  aria-label="Tuần sau"
                  onClick={() => setWeekOffset((value) => value + 1)}
                  disabled={weekOffset >= 0}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
            <div className="weekly-heatmap">
              {weekDays.map((day) => {
                const minutes = minutesByDate[day.iso] ?? 0;
                const intensity = minutes === 0 ? 0 : minutes < 60 ? 1 : minutes < 120 ? 2 : minutes < 240 ? 3 : 4;
                return (
                  <div className={`heatmap-day heatmap-level-${intensity}`} key={day.iso}>
                    <span>{day.name}</span>
                    <strong>{minutes ? `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} giờ` : '—'}</strong>
                    <small>{dateLabel(day.iso)}</small>
                  </div>
                );
              })}
            </div>
            <div className="heatmap-legend">
              <span>Ít</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <i className={`heatmap-swatch heatmap-level-${level}`} key={level} />
              ))}
              <span>Nhiều</span>
            </div>
            {showLogForm === false && (
              <button className="text-button log-entry-link" type="button" onClick={startStudyLog}>
                <Plus size={14} /> Ghi thời gian học
              </button>
            )}
            {scopedLogs.filter((log) => weekDays.some((day) => day.iso === log.date)).length > 0 && (
              <div className="study-log-list">
                {scopedLogs
                  .filter((log) => weekDays.some((day) => day.iso === log.date))
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((log) => (
                    <div className="study-log-row" key={log.id}>
                      <span>{dateLabel(log.date)}</span>
                      <strong>{courses.find((course) => course.id === log.courseId)?.name ?? 'Tự học chung'}</strong>
                      <span>
                        {Math.floor(log.durationMinutes / 60) ? `${Math.floor(log.durationMinutes / 60)} giờ ` : ''}
                        {log.durationMinutes % 60 ? `${log.durationMinutes % 60} phút` : ''}
                      </span>
                      {log.note && <small>{log.note}</small>}
                      <button
                        className="icon-button danger-icon"
                        type="button"
                        disabled={itemBusyId === log.id}
                        title="Xóa bản ghi"
                        aria-label="Xóa bản ghi thời gian học"
                        onClick={() => void deleteLog(log)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </section>
      )}

      {/* Assignments Panel */}
      {showAssignmentsSection && (
        <section className={`panel assignment-panel${workspaceId ? ' course-assignments-panel' : ''}`}>
          <div className="panel-heading">
            <div>
              <h3>Bài tập</h3>
            </div>
            <div className="panel-heading-tools">
              {assignments.length > 0 && (
                <details className={workspaceId ? 'project-task-options' : undefined} open={!workspaceId}>
                  <summary hidden={!workspaceId}>Bộ lọc và sắp xếp</summary>
                  <div className="panel-heading-tools">
                  <select
                    aria-label="Lọc trạng thái bài tập"
                    className="compact-select"
                    value={assignmentStatusFilter}
                    onChange={(e) => setAssignmentStatusFilter(e.target.value)}
                  >
                    <option value="all">Mọi trạng thái</option>
                    <option value="soon">Sắp đến hạn (7 ngày)</option>
                    <option value="pending">Chưa hoàn thành</option>
                    <option value="Not Started">Chưa bắt đầu</option>
                    <option value="In Progress">Đang làm</option>
                    <option value="Completed">Đã hoàn thành</option>
                    <option value="Overdue">Quá hạn</option>
                  </select>
                  <select
                    aria-label="Lọc ưu tiên bài tập"
                    className="compact-select"
                    value={assignmentPriorityFilter}
                    onChange={(e) => setAssignmentPriorityFilter(e.target.value)}
                  >
                    <option value="all">Mọi ưu tiên</option>
                    <option value="High">Cao</option>
                    <option value="Medium">Vừa</option>
                    <option value="Low">Thấp</option>
                  </select>
                  {!workspaceId && courses.length > 0 && (
                    <select
                      aria-label="Lọc theo môn bài tập"
                      className="compact-select"
                      value={assignmentCourseFilter}
                      onChange={(e) => setAssignmentCourseFilter(e.target.value)}
                    >
                      <option value="all">Tất cả môn</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    aria-label="Sắp xếp bài tập"
                    className="compact-select"
                    value={assignmentSort}
                    onChange={(e) => setAssignmentSort(e.target.value)}
                  >
                    <option value="deadline">Hạn nộp gần nhất</option>
                    <option value="priority">Ưu tiên cao nhất</option>
                    <option value="title">Tên A–Z</option>
                  </select>
                  {(assignmentStatusFilter !== 'all' ||
                    assignmentPriorityFilter !== 'all' ||
                    assignmentCourseFilter !== 'all') && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setAssignmentStatusFilter('all');
                        setAssignmentPriorityFilter('all');
                        setAssignmentCourseFilter('all');
                      }}
                    >
                      Xóa bộ lọc
                    </button>
                  )}
                  </div>
                </details>
              )}
              {workspaceId && <button type="button" className="primary-button" onClick={startNewAssignment}><Plus size={16} /> Thêm bài tập</button>}
            </div>
          </div>
          {filteredAssignments.length ? (
            <div className={`task-list${workspaceId ? ' project-detail-tasks' : ''}`}>
              {filteredAssignments.map((item) => (
                <AssignmentRow
                  key={item.id}
                  item={item}
                  courses={courses}
                  busy={itemBusyId === item.id}
                  highlighted={highlightedId === item.id}
                  scoped={Boolean(workspaceId)}
                  dependencyNames={(item.dependencies ?? []).map((id) => assignmentNames.get(id)).filter((name): name is string => typeof name === 'string')}
                  trackedSeconds={courseTimer?.taskSeconds?.[item.id]}
                  timing={courseTimer?.active?.taskId === item.id}
                  onOpen={!workspaceId && item.courseId ? () =>
                    onSelectStudyTarget?.({ tab: 'assignments', courseId: item.courseId, assignmentId: item.id }) : undefined}
                  onFiles={workspaceId ? () => setResourceDialog({ kind: 'files', assignment: item }) : undefined}
                  onTimer={workspaceId ? () => setResourceDialog({ kind: 'timer', assignment: item }) : undefined}
                  onToggle={() => void toggleAssignment(item)}
                  onEdit={() => startEditAssignment(item)}
                  onDelete={() => void deleteAssignment(item)}
                />
              ))}
            </div>
          ) : (
            <div className="study-empty compact">
              <span>
                {assignments.length
                  ? 'Không có bài tập nào khớp bộ lọc hiện tại.'
                  : 'Chưa có bài tập nào. Thêm bài tập đầu tiên để theo dõi hạn nộp.'}
              </span>
              {assignments.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setAssignmentStatusFilter('all');
                    setAssignmentPriorityFilter('all');
                    setAssignmentCourseFilter('all');
                  }}
                >
                  Xóa bộ lọc bài tập
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Exams Panel (/api/study/exams) */}
      {showExamsSection && (
        <section className="panel exams-panel">
          <div className="panel-heading">
            <div>
              <h3>Kỳ thi & Kiểm tra</h3>
              <p>Theo dõi ngày thi, loại kỳ thi, trọng số điểm và tiến độ ôn tập.</p>
            </div>
            <div className="panel-heading-tools">
              {!workspaceId && courses.length > 0 && (
                <select
                  aria-label="Lọc môn kỳ thi"
                  className="compact-select"
                  value={examCourseFilter}
                  onChange={(e) => setExamCourseFilter(e.target.value)}
                >
                  <option value="all">Tất cả môn</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Lọc trạng thái kỳ thi"
                className="compact-select"
                value={examStateFilter}
                onChange={(e) => setExamStateFilter(e.target.value)}
              >
                <option value="all">Tất cả kỳ thi ({exams.length})</option>
                <option value="upcoming">Sắp tới</option>
                <option value="past">Đã qua / Quá hạn</option>
              </select>
              {(examCourseFilter !== 'all' || examStateFilter !== 'all') && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setExamCourseFilter('all');
                    setExamStateFilter('all');
                  }}
                >
                  Xóa bộ lọc
                </button>
              )}
              <button
                type="button"
                className="soft-button compact-btn"
                onClick={() => {
                  setEditingExam(null);
                  setExamFormError('');
                  setExamDraft(emptyExam());
                  setShowExamForm(true);
                }}
              >
                <Plus size={14} /> Thêm kỳ thi
              </button>
            </div>
          </div>
          {filteredExams.length ? (
            <div className="exams-grid">
              {filteredExams.map((exam) => {
                const course = courses.find((c) => c.id === exam.courseId);
                const remaining = daysUntil(exam.date);
                const isOverdue = remaining < 0 && exam.prepProgress < 100;
                const statusBadge =
                  remaining < 0
                    ? exam.prepProgress >= 100
                      ? 'Đã hoàn tất'
                      : `Quá hạn ${Math.abs(remaining)} ngày`
                    : remaining === 0
                      ? 'Thi hôm nay!'
                      : `Còn ${remaining} ngày`;
                const isBusyExam = itemBusyId === exam.id;
                return (
                  <article
                    id={`exam-${exam.id}`}
                    className={`exam-card ${highlightedId === exam.id ? 'task-search-highlight' : ''}`}
                    key={exam.id}
                  >
                    <div className="exam-card-top">
                      <span className={`exam-type-badge type-${exam.type.toLowerCase()}`}>
                        {examTypeLabel[exam.type] ?? exam.type}
                      </span>
                      <span className={`exam-countdown ${isOverdue ? 'overdue' : remaining <= 3 && remaining >= 0 ? 'due-soon' : ''}`}>
                        {statusBadge}
                      </span>
                      <div className="course-card-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Sửa kỳ thi ${exam.title}`}
                          onClick={() => startEditExam(exam)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger-icon"
                          disabled={isBusyExam}
                          aria-label={`Xóa kỳ thi ${exam.title}`}
                          onClick={() => void deleteExam(exam)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h4>{exam.title}</h4>
                    <p className="exam-meta">
                      {course ? `${course.name}${course.status === 'Completed' ? ' (Hoàn thành)' : ''}` : 'Chưa gắn môn'} ·
                      Ngày thi: <strong>{formatDeadline(exam.date)}</strong> · Trọng số: <strong>{exam.weight}%</strong>
                    </p>
                    <div className="exam-prep-section">
                      <div className="progress-label">
                        <span>Tiến độ ôn tập</span>
                        <strong>{exam.prepProgress}%</strong>
                      </div>
                      <div className="progress-track">
                        <span style={{ width: `${exam.prepProgress}%` }} />
                      </div>
                      <div className="exam-prep-actions">
                        <button
                          type="button"
                          className="text-button"
                          disabled={isBusyExam || exam.prepProgress >= 100}
                          onClick={() => void updateExamPrep(exam, Math.min(100, exam.prepProgress + 15))}
                        >
                          +15% ôn tập
                        </button>
                        {exam.prepProgress < 100 && (
                          <button
                            type="button"
                            className="text-button"
                            disabled={isBusyExam}
                            onClick={() => void updateExamPrep(exam, 100)}
                          >
                            Đánh dấu 100%
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="study-empty compact">
              <Award size={20} />
              <span>
                {exams.length
                  ? 'Không có kỳ thi nào khớp bộ lọc.'
                  : 'Chưa có kỳ thi nào. Thêm lịch thi để chủ động kế hoạch ôn tập.'}
              </span>
              {exams.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setExamCourseFilter('all');
                    setExamStateFilter('all');
                  }}
                >
                  Xóa bộ lọc kỳ thi
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Notes Panel (/api/study/notes) */}
      {showNotesSection && (
        <section className="panel notes-panel">
          <div className="panel-heading">
            <div>
              <h3>Ghi chú học tập</h3>
              <p>Lưu trữ tóm tắt bài giảng, công thức và tìm kiếm nhanh theo môn học hoặc tag.</p>
            </div>
            <div className="panel-heading-tools">
              <div className="note-search-box">
                <Search size={14} />
                <input
                  aria-label="Tìm nội dung sổ tay"
                  placeholder="Tìm trong ghi chú…"
                  value={noteQuery}
                  onChange={(e) => setNoteQuery(e.target.value)}
                />
              </div>
              {!workspaceId && courses.length > 0 && (
                <select
                  aria-label="Lọc theo môn sổ tay"
                  className="compact-select"
                  value={noteCourseFilter}
                  onChange={(e) => setNoteCourseFilter(e.target.value)}
                >
                  <option value="all">Tất cả môn</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {allNoteTags.length > 0 && (
                <select
                  aria-label="Lọc tag ghi chú"
                  className="compact-select"
                  value={noteTagFilter}
                  onChange={(e) => setNoteTagFilter(e.target.value)}
                >
                  <option value="all">Tất cả tag</option>
                  {allNoteTags.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </select>
              )}
              {(noteQuery.trim() !== '' || noteCourseFilter !== 'all' || noteTagFilter !== 'all') && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setNoteQuery('');
                    setNoteCourseFilter('all');
                    setNoteTagFilter('all');
                  }}
                >
                  Xóa bộ lọc
                </button>
              )}
              <button
                type="button"
                className="soft-button compact-btn"
                onClick={() => {
                  setEditingNote(null);
                  setNoteFormError('');
                  setNoteDraft(emptyNote());
                  setShowNoteForm(true);
                }}
              >
                <Plus size={14} /> Thêm ghi chú
              </button>
            </div>
          </div>
          {filteredNotes.length ? (
            <div className="notes-grid">
              {filteredNotes.map((note) => {
                const course = courses.find((c) => c.id === note.courseId);
                const isLong = (note.content?.length ?? 0) > 220;
                const isOpen = Boolean(expandedNotes[note.id]);
                const displayedContent =
                  isLong && !isOpen ? `${note.content.slice(0, 220)}…` : note.content || 'Chưa có nội dung chi tiết.';
                return (
                  <article
                    id={`note-${note.id}`}
                    className={`note-card ${highlightedId === note.id ? 'task-search-highlight' : ''}`}
                    key={note.id}
                  >
                    <div className="note-card-top">
                      <div>
                        <h4>{note.title}</h4>
                        <span className="note-meta">
                          {course ? `${course.name}${course.status === 'Completed' ? ' (Hoàn thành)' : ''}` : 'Ghi chú chung'} ·{' '}
                          {formatDeadline(note.date)}
                        </span>
                      </div>
                      <div className="course-card-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Sửa ghi chú ${note.title}`}
                          onClick={() => startEditNote(note)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger-icon"
                          disabled={itemBusyId === note.id}
                          aria-label={`Xóa ghi chú ${note.title}`}
                          onClick={() => void deleteNote(note)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="note-content">{displayedContent}</div>
                    {isLong && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setExpandedNotes((prev) => ({ ...prev, [note.id]: !prev[note.id] }))}
                      >
                        {isOpen ? 'Thu gọn' : 'Xem toàn bộ nội dung'}
                      </button>
                    )}
                    {(note.tags ?? []).length > 0 && (
                      <div className="note-tags">
                        {note.tags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="note-tag-chip"
                            onClick={() => setNoteTagFilter(noteTagFilter === t ? 'all' : t)}
                          >
                            <Tag size={10} /> {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="study-empty compact">
              <FileText size={20} />
              <span>
                {notes.length
                  ? 'Không tìm thấy ghi chú khớp từ khóa hoặc bộ lọc.'
                  : 'Chưa có ghi chú học tập nào. Hãy tạo ghi chú đầu tiên cho môn học của bạn.'}
              </span>
              {notes.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setNoteQuery('');
                    setNoteCourseFilter('all');
                    setNoteTagFilter('all');
                  }}
                >
                  Xóa bộ lọc ghi chú
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {courseWorkspace && resourceDialog?.kind === 'files' && <CalendarDialog
        title={`Tài liệu của ${resourceDialog.assignment.title}`} busy={filesBusy} wide onClose={() => setResourceDialog(null)}>
        <ProjectDocuments courseId={courseWorkspace.id} tasks={assignments} taskId={resourceDialog.assignment.id} onBusy={setFilesBusy} />
      </CalendarDialog>}
      {courseWorkspace && resourceDialog?.kind === 'timer' && <CalendarDialog
        title={`Bấm giờ · ${resourceDialog.assignment.title}`} onClose={() => setResourceDialog(null)}>
        <ProjectTimer courseId={courseWorkspace.id} taskId={resourceDialog.assignment.id}
          taskNames={assignmentNames} onChanged={refreshTimerSummary} />
      </CalendarDialog>}
    </>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="study-stat-card">
      <div className={`study-stat-icon ${tone}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function AssignmentRow({
  item,
  courses,
  busy,
  highlighted,
  scoped,
  dependencyNames,
  trackedSeconds,
  timing,
  onOpen,
  onFiles,
  onTimer,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: Assignment;
  courses: Course[];
  busy?: boolean;
  highlighted?: boolean;
  scoped: boolean;
  dependencyNames: string[];
  trackedSeconds?: number;
  timing: boolean;
  onOpen?: () => void;
  onFiles?: () => void;
  onTimer?: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const course = courses.find((row) => row.id === item.courseId);
  const done = item.status === 'Completed';
  const remaining = daysUntil(item.deadline);
  const state = done
    ? 'Hoàn thành'
    : remaining < 0
      ? `Trễ ${Math.abs(remaining)} ngày`
      : remaining === 0
        ? 'Đến hạn hôm nay'
        : remaining === 1
          ? 'Còn 1 ngày'
          : `Còn ${remaining} ngày`;
  return (
    <div
      id={`assignment-${item.id}`}
      className={`project-task ${done ? 'project-task-done' : ''} ${highlighted ? 'task-search-highlight' : ''}`}
    >
      <button
        className="task-check"
        type="button"
        disabled={busy}
        aria-label={done ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}
        onClick={onToggle}
      >
        {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>
      <div className="task-copy">
        <div className="task-title-line">
          {onOpen ? <button type="button" className="planning-open" onClick={onOpen}>{item.title} <ChevronRight size={14} /></button>
            : <strong>{item.title}</strong>}
          {item.status === 'In Progress' && !done && <span className="task-status-chip">Đang làm</span>}
        </div>
        <span>
          <i className={`priority-dot priority-${item.priority.toLowerCase()}`} />
          {!scoped && `${course ? `${course.name}${course.status === 'Completed' ? ' (Hoàn thành)' : ''}` : 'Chưa gắn môn'} · `}
          {item.priority === 'High' ? 'Ưu tiên cao' : item.priority === 'Low' ? 'Ưu tiên thấp' : 'Ưu tiên vừa'} · Nộp{' '}
          {formatDeadline(item.deadline)}
        </span>
        {scoped && <div className="project-task-meta">
          <span className={!done && remaining < 0 ? 'overdue-text' : undefined}>{state}</span>
          {dependencyNames.length > 0 && <span title={dependencyNames.join(', ')}><GitBranch size={13} /> {dependencyNames.length} phụ thuộc</span>}
          {timing ? <span className="project-running-timer"><Clock3 size={13} /> Đang bấm giờ</span>
            : trackedSeconds !== undefined && <span title="Tổng thời gian bài tập đã lưu"><Clock3 size={13} /> {formatProjectTime(trackedSeconds)}</span>}
        </div>}
      </div>
      {!scoped && <span className={`task-due-state ${!done && remaining < 0 ? 'overdue' : !done && remaining <= 7 ? 'due-soon' : ''}`}>
        {state}
      </span>}
      <div className="project-task-actions">
        {onTimer && <button type="button" className="icon-button" title="Bấm giờ" aria-label={`Bấm giờ cho ${item.title}`} onClick={onTimer}>
          <Clock3 size={16} />
        </button>}
        {onFiles && <button type="button" className="icon-button" title="Tài liệu" aria-label={`Tài liệu của ${item.title}`} onClick={onFiles}>
          <Paperclip size={16} />
        </button>}
        <button
        className="icon-button"
        type="button"
        title="Sửa bài tập"
        aria-label={`Sửa bài tập ${item.title}`}
        onClick={onEdit}
      >
        <Pencil size={15} />
        </button>
        <button
        className="icon-button task-delete"
        type="button"
        disabled={busy}
        title="Xóa bài tập"
        aria-label={`Xóa bài tập ${item.title}`}
        onClick={onDelete}
      >
        <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
