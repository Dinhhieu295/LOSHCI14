import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  Clock3,
  FileText,
  Layers,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
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
  type ScheduleItem,
  type StudyLog,
  type StudyNote,
  type StudySummary,
} from './api';
import type { SearchTarget } from './GlobalSearch';

export type StudyTab = 'all' | 'courses' | 'assignments' | 'exams' | 'notes' | 'schedule';

type Props = {
  userId: string;
  courses: Course[];
  sessions: CourseSession[];
  logs: StudyLog[];
  assignments: Assignment[];
  exams: Exam[];
  notes: StudyNote[];
  scheduleItems: ScheduleItem[];
  summary: StudySummary | null;
  loading: boolean;
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
  score10: string;
  grade: string;
  attendance: string;
  studyHours: string;
  aimStudyHours: string;
  color: string;
  status: 'Active' | 'Archived';
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
  estimatedTime: string;
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

type ScheduleDraft = {
  title: string;
  date: string;
  time: string;
  color: string;
};

type TimerState = {
  startedAt: number | null;
  elapsedSeconds: number;
  date: string;
  courseId: string;
  note: string;
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
  score10: '',
  grade: 'N/A',
  attendance: '100',
  studyHours: '0',
  aimStudyHours: '45',
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
  estimatedTime: '2h',
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

const emptySchedule = (): ScheduleDraft => ({
  title: '',
  date: todayString(),
  time: '08:00 - 09:30',
  color: '#4f8259',
});

const blankTimer: TimerState = { startedAt: null, elapsedSeconds: 0, date: '', courseId: '', note: '' };
const weekdayNames = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
const weekdayShortNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const VALID_COURSE_STATUS = ['all', 'Active', 'Archived'];
const VALID_ASSIGNMENT_STATUS = ['all', 'pending', 'Not Started', 'In Progress', 'Completed', 'Overdue'];
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

const minutesOf = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

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

/**
 * Unifies study hours calculation across courses and study logs:
 * - Course hours = max(course.studyHours base, sum of logs for that course)
 * - Unassigned general study logs (!log.courseId) are added ONLY when includeUnassigned = true
 *   (i.e. when not filtering by a specific semester or course status).
 */
export function computeUnifiedStudyHours(courses: Course[], logs: StudyLog[], includeUnassigned = true) {
  const logMinutesByCourse = new Map<string, number>();
  let unassignedMinutes = 0;
  let totalLogMinutes = 0;

  const courseIdSet = new Set(courses.map((c) => c.id));

  for (const log of logs) {
    if (log.courseId) {
      if (courseIdSet.has(log.courseId)) {
        totalLogMinutes += log.durationMinutes;
      }
      logMinutesByCourse.set(log.courseId, (logMinutesByCourse.get(log.courseId) ?? 0) + log.durationMinutes);
    } else {
      unassignedMinutes += log.durationMinutes;
      if (includeUnassigned) {
        totalLogMinutes += log.durationMinutes;
      }
    }
  }

  let totalHours = includeUnassigned ? unassignedMinutes / 60 : 0;
  let targetHours = 0;

  for (const course of courses) {
    const loggedHoursForCourse = (logMinutesByCourse.get(course.id) ?? 0) / 60;
    const courseStoredHours = Number(course.studyHours ?? 0);
    totalHours += Math.max(courseStoredHours, loggedHoursForCourse);
    targetHours += Number(course.aimStudyHours ?? 0);
  }

  return {
    totalHours: Number(totalHours.toFixed(1)),
    targetHours: Number(targetHours.toFixed(1)),
    totalLogMinutes,
    unassignedHours: Number((unassignedMinutes / 60).toFixed(1)),
  };
}

/**
 * Strictly parses a time or time range string:
 * Allowed formats: "HH:mm" or "HH:mm - HH:mm" (00:00 to 23:59).
 * Rejects trailing/leading garbage, invalid hours (e.g. "25:00"), or end <= start.
 */
export function parseTimeRange(timeStr: string): [number, number] | null {
  const trimmed = timeStr.trim();
  const match = /^(?:([01]?\d|2[0-3]):([0-5]\d))(?:\s*(?:-|–|—|đến|to)\s*(?:([01]?\d|2[0-3]):([0-5]\d)))?$/i.exec(
    trimmed,
  );
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  if (match[3] !== undefined && match[4] !== undefined) {
    const end = Number(match[3]) * 60 + Number(match[4]);
    return end > start ? [start, end] : null;
  }
  return [start, Math.min(1440, start + 60)];
}

function isoWeekday(dateIso: string): number {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  return ((d.getDay() + 6) % 7) + 1; // 1 = Monday .. 7 = Sunday
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
  assignments,
  exams,
  notes,
  scheduleItems,
  summary,
  loading,
  onRefresh,
  onNotice,
  activeTab = 'all',
  onTabChange,
  selectedCourseId,
  selectedAssignmentId,
  selectedExamId,
  selectedNoteId,
  onSelectStudyTarget,
  openTarget,
  onTargetOpened,
}: Props) {
  const filterStorageKey = `lifeos:study-filters:${userId}`;
  const initialStored = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(filterStorageKey) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }, [filterStorageKey]);

  const [tab, setTabState] = useState<StudyTab>(activeTab);
  const [highlightedId, setHighlightedId] = useState<string | null>(
    selectedAssignmentId || selectedExamId || selectedNoteId || null,
  );

  // Courses state
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(blankCourse);
  const [courseFormError, setCourseFormError] = useState('');
  const [expandedCourse, setExpandedCourseState] = useState<string | null>(selectedCourseId ?? null);
  const [semesterFilter, setSemesterFilter] = useState<string>(() => initialStored.semesterFilter || 'all');
  const [courseStatusFilter, setCourseStatusFilter] = useState<string>(() =>
    safeEnum(initialStored.courseStatusFilter, VALID_COURSE_STATUS, 'all'),
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

  // Personal Schedule state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(emptySchedule);
  const [scheduleFormError, setScheduleFormError] = useState('');
  const [scheduleViewMode, setScheduleViewMode] = useState<'week' | 'day'>('week');
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string>(todayString);

  // Timetable & Sessions state
  const [showTimetable, setShowTimetable] = useState(false);
  const [sessionCourse, setSessionCourse] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>(blankSession);
  const [sessionFormError, setSessionFormError] = useState('');

  // Study timer state
  const [showLogForm, setShowLogForm] = useState(false);
  const timerStorageKey = `lifeos:study-timer:${userId}`;
  const [timer, setTimer] = useState<TimerState>(() => {
    try {
      return { ...blankTimer, ...JSON.parse(localStorage.getItem(timerStorageKey) ?? '{}') } as TimerState;
    } catch {
      return blankTimer;
    }
  });
  const [clockNow, setClockNow] = useState(Date.now());
  const [weekOffset, setWeekOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);

  const checkedDeepLinkRef = useRef<string | null>(null);

  const setTab = (next: StudyTab) => {
    setTabState(next);
    onTabChange?.(next);
  };

  const setExpandedCourse = (next: string | null) => {
    setExpandedCourseState(next);
    onSelectStudyTarget?.({ tab, courseId: next, assignmentId: null, examId: null, noteId: null });
  };

  useEffect(() => {
    if (activeTab && activeTab !== tab) setTabState(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedCourseId !== undefined && selectedCourseId !== expandedCourse) {
      setExpandedCourseState(selectedCourseId);
    }
  }, [selectedCourseId]);

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
    if (key === ':::' || checkedDeepLinkRef.current === key) return;
    checkedDeepLinkRef.current = key;

    let targetElId = '';
    if (selectedCourseId) {
      if (!courses.some((c) => c.id === selectedCourseId)) {
        onNotice({ message: 'Không tìm thấy môn học được liên kết hoặc môn học đã bị xóa.', type: 'warning' });
        onSelectStudyTarget?.({ tab, courseId: null });
        return;
      }
      setSemesterFilter('all');
      setCourseStatusFilter('all');
      setExpandedCourseState(selectedCourseId);
      targetElId = `course-${selectedCourseId}`;
    } else if (selectedAssignmentId) {
      if (!assignments.some((a) => a.id === selectedAssignmentId)) {
        onNotice({ message: 'Không tìm thấy bài tập được liên kết hoặc bài tập đã bị xóa.', type: 'warning' });
        onSelectStudyTarget?.({ tab, assignmentId: null });
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
        onSelectStudyTarget?.({ tab, examId: null });
        return;
      }
      setExamCourseFilter('all');
      setExamStateFilter('all');
      setHighlightedId(selectedExamId);
      targetElId = `exam-${selectedExamId}`;
    } else if (selectedNoteId) {
      if (!notes.some((n) => n.id === selectedNoteId)) {
        onNotice({ message: 'Không tìm thấy ghi chú được liên kết hoặc ghi chú đã bị xóa.', type: 'warning' });
        onSelectStudyTarget?.({ tab, noteId: null });
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
      setExpandedCourseState(openTarget.courseId);
      if (tab !== 'all' && tab !== 'courses') setTab('courses');
      onSelectStudyTarget?.({ tab: tab === 'all' ? 'all' : 'courses', courseId: openTarget.courseId });
      targetElId = `course-${openTarget.courseId}`;
    } else if (openTarget.kind === 'assignment' && openTarget.assignmentId) {
      setAssignmentStatusFilter('all');
      setAssignmentPriorityFilter('all');
      setAssignmentCourseFilter('all');
      if (tab !== 'all' && tab !== 'assignments') setTab('assignments');
      onSelectStudyTarget?.({ tab: tab === 'all' ? 'all' : 'assignments', assignmentId: openTarget.assignmentId });
      targetElId = `assignment-${openTarget.assignmentId}`;
      setHighlightedId(openTarget.assignmentId);
    } else if (openTarget.kind === 'exam' && openTarget.examId) {
      setExamCourseFilter('all');
      setExamStateFilter('all');
      if (tab !== 'all' && tab !== 'exams') setTab('exams');
      onSelectStudyTarget?.({ tab: tab === 'all' ? 'all' : 'exams', examId: openTarget.examId });
      targetElId = `exam-${openTarget.examId}`;
      setHighlightedId(openTarget.examId);
    } else if (openTarget.kind === 'note' && openTarget.noteId) {
      setNoteCourseFilter('all');
      setNoteTagFilter('all');
      setNoteQuery('');
      if (tab !== 'all' && tab !== 'notes') setTab('notes');
      onSelectStudyTarget?.({ tab: tab === 'all' ? 'all' : 'notes', noteId: openTarget.noteId });
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
  const unifiedStudy = useMemo(
    () => computeUnifiedStudyHours(filteredCourses, logs, !isCourseScoped),
    [filteredCourses, logs, isCourseScoped],
  );

  const timerActive = timer.startedAt !== null || timer.elapsedSeconds > 0;
  const elapsedSeconds =
    timer.elapsedSeconds + (timer.startedAt === null ? 0 : Math.max(0, Math.floor((clockNow - timer.startedAt) / 1000)));
  const timerDisplay = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:${String(Math.floor(elapsedSeconds / 60) % 60).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

  useEffect(() => {
    localStorage.setItem(timerStorageKey, JSON.stringify(timer));
  }, [timerStorageKey, timer]);

  useEffect(() => {
    if (timer.startedAt === null) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer.startedAt]);

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
    const attendance = Number(courseDraft.attendance);
    const studyHours = Number(courseDraft.studyHours);
    const aimStudyHours = Number(courseDraft.aimStudyHours);
    const score10 = courseDraft.score10.trim() === '' ? null : Number(courseDraft.score10);

    if (Number.isNaN(credits) || credits < 0 || credits > 100) {
      setCourseFormError('Số tín chỉ phải từ 0 đến 100.');
      return;
    }
    if (Number.isNaN(progress) || progress < 0 || progress > 100) {
      setCourseFormError('Tiến độ môn học phải từ 0 đến 100%.');
      return;
    }
    if (score10 !== null && (Number.isNaN(score10) || score10 < 0 || score10 > 10)) {
      setCourseFormError('Điểm hệ 10 phải từ 0 đến 10.');
      return;
    }
    if (Number.isNaN(attendance) || attendance < 0 || attendance > 100) {
      setCourseFormError('Tỷ lệ chuyên cần phải từ 0 đến 100%.');
      return;
    }
    if (Number.isNaN(studyHours) || studyHours < 0 || Number.isNaN(aimStudyHours) || aimStudyHours < 0) {
      setCourseFormError('Giờ học không được là số âm.');
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
      score10,
      grade: courseDraft.grade.trim() || 'N/A',
      attendance,
      studyHours,
      aimStudyHours,
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
      if (expandedCourse === course.id) setExpandedCourse(null);
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
      score10: course.score10 !== null && course.score10 !== undefined ? String(course.score10) : '',
      grade: course.grade || 'N/A',
      attendance: String(course.attendance ?? 100),
      studyHours: String(course.studyHours ?? 0),
      aimStudyHours: String(course.aimStudyHours ?? 45),
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
      estimatedTime: assignmentDraft.estimatedTime.trim() || '0h',
      courseId: assignmentDraft.courseId || null,
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
      estimatedTime: item.estimatedTime || '2h',
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
        if (
          assignmentStatusFilter !== 'all' &&
          assignmentStatusFilter !== 'pending' &&
          a.status !== assignmentStatusFilter
        )
          return false;
        if (assignmentPriorityFilter !== 'all' && a.priority !== assignmentPriorityFilter) return false;
        if (assignmentCourseFilter !== 'all' && (a.courseId || '') !== assignmentCourseFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (assignmentSort === 'priority') {
          return (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0);
        }
        if (assignmentSort === 'title') {
          return a.title.localeCompare(b.title, 'vi');
        }
        return a.deadline.localeCompare(b.deadline);
      });
  }, [assignments, assignmentStatusFilter, assignmentPriorityFilter, assignmentCourseFilter, assignmentSort]);

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
      courseId: examDraft.courseId || null,
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
        if (examCourseFilter !== 'all' && (exam.courseId || '') !== examCourseFilter) return false;
        const remaining = daysUntil(exam.date);
        if (examStateFilter === 'upcoming' && remaining < 0) return false;
        if (examStateFilter === 'past' && remaining >= 0) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [exams, examCourseFilter, examStateFilter]);

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
      courseId: noteDraft.courseId || null,
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
        if (noteCourseFilter !== 'all' && (n.courseId || '') !== noteCourseFilter) return false;
        if (noteTagFilter !== 'all' && !(n.tags ?? []).includes(noteTagFilter)) return false;
        if (q) {
          const text = `${n.title} ${n.content} ${(n.tags ?? []).join(' ')}`.toLocaleLowerCase('vi-VN');
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [notes, noteCourseFilter, noteTagFilter, noteQuery]);

  // --- Personal Schedule CRUD & Conflict Detection ---
  const detectScheduleConflict = (dateIso: string, timeStr: string, ignoreId?: string): string | null => {
    const range = parseTimeRange(timeStr);
    if (!range) return null;
    const [start, end] = range;

    // 1. Check conflict with other personal schedule items on the same date
    for (const item of scheduleItems) {
      if (item.id === ignoreId || item.date !== dateIso) continue;
      const otherRange = parseTimeRange(item.time);
      if (!otherRange) continue;
      if (start < otherRange[1] && end > otherRange[0]) {
        return `Trùng giờ với lịch cá nhân "${item.title}" (${item.time})`;
      }
    }

    // 2. Check conflict with recurring course sessions on the corresponding weekday
    const wday = isoWeekday(dateIso);
    for (const sess of sessions) {
      if (sess.weekday !== wday) continue;
      const sStart = minutesOf(sess.startTime);
      const sEnd = minutesOf(sess.endTime);
      if (start < sEnd && end > sStart) {
        const cName = courses.find((c) => c.id === sess.courseId)?.name ?? 'Môn học';
        return `Trùng giờ với lớp học "${cName}" (${sess.startTime}–${sess.endTime})`;
      }
    }
    return null;
  };

  const draftScheduleConflict = useMemo(
    () =>
      showScheduleForm && scheduleDraft.date && scheduleDraft.time
        ? detectScheduleConflict(scheduleDraft.date, scheduleDraft.time, editingSchedule ?? undefined)
        : null,
    [showScheduleForm, scheduleDraft.date, scheduleDraft.time, editingSchedule, scheduleItems, sessions, courses],
  );

  const executeSaveScheduleItem = async () => {
    if (busy) return;
    setScheduleFormError('');
    if (!scheduleDraft.title.trim()) {
      setScheduleFormError('Tên sự kiện không được để trống.');
      return;
    }
    if (!parseTimeRange(scheduleDraft.time)) {
      const msg =
        'Khung giờ không hợp lệ. Vui lòng nhập định dạng HH:mm hoặc HH:mm - HH:mm (00:00–23:59) với giờ kết thúc sau giờ bắt đầu.';
      setScheduleFormError(msg);
      onNotice({ message: msg, type: 'error' });
      return;
    }
    const isEdit = Boolean(editingSchedule);
    const payload = {
      title: scheduleDraft.title.trim(),
      date: scheduleDraft.date,
      time: scheduleDraft.time.trim(),
      color: scheduleDraft.color || '#4f8259',
    };
    setBusy(true);
    try {
      const path = isEdit ? `/study/schedule/${editingSchedule}` : '/study/schedule';
      await api(path, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setShowScheduleForm(false);
      setEditingSchedule(null);
      setScheduleDraft(emptySchedule());
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không lưu được lịch cá nhân.';
      setScheduleFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveScheduleItem(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation(isEdit ? 'Đã cập nhật lịch cá nhân.' : 'Đã thêm lịch cá nhân.');
  };

  const saveScheduleItem = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveScheduleItem();
  };

  const startEditScheduleItem = (item: ScheduleItem) => {
    setScheduleFormError('');
    setScheduleDraft({
      title: item.title,
      date: item.date.slice(0, 10),
      time: item.time,
      color: item.color || '#4f8259',
    });
    setEditingSchedule(item.id);
    setShowScheduleForm(true);
  };

  const deleteScheduleItem = async (item: ScheduleItem) => {
    if (itemBusyId === item.id) return;
    if (!window.confirm(`Xóa lịch cá nhân “${item.title}”?`)) return;
    setItemBusyId(item.id);
    try {
      await api(`/study/schedule/${item.id}`, { method: 'DELETE' });
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được lịch cá nhân.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa lịch cá nhân.');
  };

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
    if (!window.confirm('Xóa buổi học này khỏi thời khóa biểu?')) return;
    setItemBusyId(session.id);
    try {
      await api(`/study/course-sessions/${session.id}`, { method: 'DELETE' });
    } catch (error) {
      setItemBusyId(null);
      onNotice({ message: error instanceof Error ? error.message : 'Không xóa được lịch học.', type: 'error' });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa buổi học khỏi thời khóa biểu.');
  };

  // --- Stopwatch & Study Logs ---
  const startTimer = () => {
    const now = Date.now();
    setClockNow(now);
    setTimer((current) => ({ ...current, date: current.date || todayString(), startedAt: now }));
  };

  const pauseTimer = () => {
    const now = Date.now();
    setClockNow(now);
    setTimer((current) => ({
      ...current,
      startedAt: null,
      elapsedSeconds:
        current.elapsedSeconds + (current.startedAt === null ? 0 : Math.max(0, Math.floor((now - current.startedAt) / 1000))),
    }));
  };

  const discardTimer = () => {
    if (!window.confirm('Bỏ phiên bấm giờ này? Thời gian chưa được lưu sẽ mất.')) return;
    setTimer(blankTimer);
  };

  const saveLog = async () => {
    if (busy) return;
    const now = Date.now();
    const seconds =
      timer.elapsedSeconds + (timer.startedAt === null ? 0 : Math.max(0, Math.floor((now - timer.startedAt) / 1000)));
    if (seconds < 30) {
      onNotice({ message: 'Hãy bấm giờ ít nhất 30 giây trước khi lưu.', type: 'warning' });
      return;
    }
    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    const targetCourseId = timer.courseId || null;
    setTimer((current) => ({ ...current, startedAt: null, elapsedSeconds: seconds }));
    setBusy(true);
    try {
      await api('/study/study-logs', {
        method: 'POST',
        body: JSON.stringify({
          date: timer.date || todayString(),
          durationMinutes,
          courseId: targetCourseId,
          note: timer.note.trim(),
        }),
      });
      setTimer(blankTimer);
      setShowLogForm(false);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Không lưu được thời gian học. Phiên bấm giờ đã được giữ để thử lại.';
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void saveLog(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation(`Đã lưu ${durationMinutes} phút học vào heatmap.`);
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

  const editingCourseLoggedHours = useMemo(() => {
    if (!editingCourse) return 0;
    const mins = logs.filter((l) => l.courseId === editingCourse).reduce((s, l) => s + l.durationMinutes, 0);
    return Number((mins / 60).toFixed(1));
  }, [editingCourse, logs]);

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

  const showCoursesSection = tab === 'all' || tab === 'courses';
  const showScheduleSection = tab === 'all' || tab === 'courses' || tab === 'schedule';
  const showAssignmentsSection = tab === 'all' || tab === 'assignments';
  const showExamsSection = tab === 'all' || tab === 'exams';
  const showNotesSection = tab === 'all' || tab === 'notes';

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> HỌC TẬP CÓ CHỦ ĐÍCH
          </div>
          <h1>Không gian học tập</h1>
          <p>Quản lý môn học, lịch lên lớp, bài tập, kỳ thi, ghi chú và thời gian tự học.</p>
        </div>
        <div className="study-heading-actions">
          <button className="soft-button" type="button" onClick={() => setShowLogForm((value) => !value)}>
            <Clock3 size={16} /> Ghi thời gian học
          </button>
          <button
            className="soft-button"
            type="button"
            onClick={() => {
              setEditingAssignment(null);
              setAssignmentFormError('');
              setAssignmentDraft(emptyAssignment());
              setShowAssignmentForm((value) => !value);
            }}
          >
            <Plus size={16} /> Thêm bài tập
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingCourse(null);
              setCourseFormError('');
              setCourseDraft(blankCourse);
              setShowCourseForm((value) => !value);
            }}
          >
            <Plus size={17} /> Thêm môn học
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-bar">
          <span />
        </div>
      )}

      <div className="study-summary-grid">
        <SummaryCard
          label={isCourseScoped ? 'Môn trong bộ lọc' : 'Môn đang học'}
          value={String(
            isCourseScoped
              ? filteredCourses.filter((c) => (c.status || 'Active') === 'Active').length
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
          value={`${unifiedStudy.totalHours}h`}
          detail={
            isCourseScoped
              ? `Mục tiêu phạm vi: ${unifiedStudy.targetHours}h (không gồm tự học chung)`
              : `Tuần này: ${Math.floor(currentWeekMinutes / 60)}h ${currentWeekMinutes % 60}m · Mục tiêu ${unifiedStudy.targetHours}h`
          }
          icon={<Clock3 size={18} />}
          tone="blue"
        />
      </div>

      {/* Study Navigation Tabs */}
      <div className="study-tabs-bar panel" role="tablist" aria-label="Phân khu học tập">
        <div className="study-tabs-list">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={`study-tab-btn ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            <Layers size={15} /> Tất cả
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'courses'}
            className={`study-tab-btn ${tab === 'courses' ? 'active' : ''}`}
            onClick={() => setTab('courses')}
          >
            <BookOpen size={15} /> Môn học <small>{courses.length}</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'assignments'}
            className={`study-tab-btn ${tab === 'assignments' ? 'active' : ''}`}
            onClick={() => setTab('assignments')}
          >
            <ClipboardList size={15} /> Bài tập <small>{assignments.filter((a) => a.status !== 'Completed').length}</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'exams'}
            className={`study-tab-btn ${tab === 'exams' ? 'active' : ''}`}
            onClick={() => setTab('exams')}
          >
            <Award size={15} /> Kỳ thi <small>{exams.length}</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notes'}
            className={`study-tab-btn ${tab === 'notes' ? 'active' : ''}`}
            onClick={() => setTab('notes')}
          >
            <FileText size={15} /> Ghi chú <small>{notes.length}</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'schedule'}
            className={`study-tab-btn ${tab === 'schedule' ? 'active' : ''}`}
            onClick={() => setTab('schedule')}
          >
            <Calendar size={15} /> Lịch <small>{sessions.length + scheduleItems.length}</small>
          </button>
        </div>
        <div className="study-quick-add">
          <button
            type="button"
            className="soft-button compact-btn"
            onClick={() => {
              setEditingExam(null);
              setExamFormError('');
              setExamDraft(emptyExam());
              setShowExamForm((v) => !v);
            }}
          >
            <Plus size={14} /> Thêm kỳ thi
          </button>
          <button
            type="button"
            className="soft-button compact-btn"
            onClick={() => {
              setEditingNote(null);
              setNoteFormError('');
              setNoteDraft(emptyNote());
              setShowNoteForm((v) => !v);
            }}
          >
            <Plus size={14} /> Thêm ghi chú
          </button>
          <button
            type="button"
            className="soft-button compact-btn"
            onClick={() => {
              setEditingSchedule(null);
              setScheduleFormError('');
              setScheduleDraft(emptySchedule());
              setShowScheduleForm((v) => !v);
            }}
          >
            <Plus size={14} /> Thêm sự kiện
          </button>
        </div>
      </div>

      {/* Assignment Form */}
      {showAssignmentForm && (
        <form className="panel study-editor" onSubmit={(event) => void saveAssignment(event)}>
          <div className="panel-heading">
            <div>
              <h3>{editingAssignment ? 'Chỉnh sửa bài tập' : 'Thêm bài tập'}</h3>
              <p>Đặt hạn nộp, trạng thái, thời lượng ước tính và mức ưu tiên cho bài tập.</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Đóng"
              onClick={() => {
                setShowAssignmentForm(false);
                setEditingAssignment(null);
                setAssignmentFormError('');
                setAssignmentDraft(emptyAssignment());
              }}
            >
              <X size={17} />
            </button>
          </div>
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
            <label>
              Môn học
              <select
                value={assignmentDraft.courseId}
                onChange={(event) => setAssignmentDraft({ ...assignmentDraft, courseId: event.target.value })}
              >
                <option value="">Chưa gắn môn học</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                    {course.status === 'Archived' ? ' (Đã lưu trữ)' : ''}
                  </option>
                ))}
              </select>
            </label>
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
            <label>
              Thời lượng ước tính
              <input
                value={assignmentDraft.estimatedTime}
                onChange={(event) => setAssignmentDraft({ ...assignmentDraft, estimatedTime: event.target.value })}
                maxLength={24}
                placeholder="Ví dụ: 4h"
              />
            </label>
          </div>
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
      )}

      {/* Course Form */}
      {showCourseForm && (
        <form className="panel study-editor" onSubmit={(event) => void saveCourse(event)}>
          <div className="panel-heading">
            <div>
              <h3>{editingCourse ? 'Chỉnh sửa môn học' : 'Thêm môn học'}</h3>
              <p>
                Giờ học hiển thị của môn = max(Giờ nền đã nhập, Tổng giờ log bấm giờ của môn).
                {editingCourse ? ` Hiện tại log bấm giờ của môn này là ${editingCourseLoggedHours}h.` : ''}
              </p>
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
          </div>
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
              Điểm hệ 10
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="Chưa có điểm"
                value={courseDraft.score10}
                onChange={(event) => setCourseDraft({ ...courseDraft, score10: event.target.value })}
              />
            </label>
            <label>
              Điểm chữ
              <select
                value={courseDraft.grade}
                onChange={(event) => setCourseDraft({ ...courseDraft, grade: event.target.value })}
              >
                <option value="N/A">Chưa xếp loại (N/A)</option>
                <option value="A+">A+</option>
                <option value="A">A</option>
                <option value="B+">B+</option>
                <option value="B">B</option>
                <option value="C+">C+</option>
                <option value="C">C</option>
                <option value="D+">D+</option>
                <option value="D">D</option>
                <option value="F">F</option>
              </select>
            </label>
            <label>
              Chuyên cần (%)
              <input
                type="number"
                min="0"
                max="100"
                value={courseDraft.attendance}
                onChange={(event) => setCourseDraft({ ...courseDraft, attendance: event.target.value })}
              />
            </label>
            <label>
              Giờ nền đã nhập
              <input
                type="number"
                min="0"
                step="0.5"
                value={courseDraft.studyHours}
                onChange={(event) => setCourseDraft({ ...courseDraft, studyHours: event.target.value })}
              />
            </label>
            <label>
              Mục tiêu giờ học
              <input
                type="number"
                min="0"
                step="0.5"
                value={courseDraft.aimStudyHours}
                onChange={(event) => setCourseDraft({ ...courseDraft, aimStudyHours: event.target.value })}
              />
            </label>
            <label>
              Trạng thái môn
              <select
                value={courseDraft.status}
                onChange={(event) =>
                  setCourseDraft({ ...courseDraft, status: event.target.value as 'Active' | 'Archived' })
                }
              >
                <option value="Active">Đang học (Active)</option>
                <option value="Archived">Lưu trữ (Archived)</option>
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
          </div>
        </form>
      )}

      {/* Exam Form */}
      {showExamForm && (
        <form className="panel study-editor" onSubmit={(event) => void saveExam(event)}>
          <div className="panel-heading">
            <div>
              <h3>{editingExam ? 'Chỉnh sửa kỳ thi' : 'Thêm kỳ thi'}</h3>
              <p>Theo dõi lịch thi, hình thức, trọng số điểm và tiến độ ôn tập.</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Đóng"
              onClick={() => {
                setShowExamForm(false);
                setEditingExam(null);
                setExamFormError('');
                setExamDraft(emptyExam());
              }}
            >
              <X size={17} />
            </button>
          </div>
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
            <label>
              Môn học
              <select
                value={examDraft.courseId}
                onChange={(e) => setExamDraft({ ...examDraft, courseId: e.target.value })}
              >
                <option value="">Chưa gắn môn học</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === 'Archived' ? ' (Đã lưu trữ)' : ''}
                  </option>
                ))}
              </select>
            </label>
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
      )}

      {/* Note Form */}
      {showNoteForm && (
        <form className="panel study-editor" onSubmit={(event) => void saveNote(event)}>
          <div className="panel-heading">
            <div>
              <h3>{editingNote ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú học tập'}</h3>
              <p>Lưu kiến thức trọng tâm, tóm tắt bài giảng và gắn thẻ (tối đa 30 tag, mỗi tag 40 ký tự).</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Đóng"
              onClick={() => {
                setShowNoteForm(false);
                setEditingNote(null);
                setNoteFormError('');
                setNoteDraft(emptyNote());
              }}
            >
              <X size={17} />
            </button>
          </div>
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
            <label>
              Môn học
              <select
                value={noteDraft.courseId}
                onChange={(e) => setNoteDraft({ ...noteDraft, courseId: e.target.value })}
              >
                <option value="">Ghi chú chung</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === 'Archived' ? ' (Đã lưu trữ)' : ''}
                  </option>
                ))}
              </select>
            </label>
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
      )}

      {/* Personal Schedule Form */}
      {showScheduleForm && (
        <form className="panel study-editor" onSubmit={(event) => void saveScheduleItem(event)}>
          <div className="panel-heading">
            <div>
              <h3>{editingSchedule ? 'Chỉnh sửa lịch cá nhân' : 'Thêm sự kiện lịch cá nhân'}</h3>
              <p>Lên lịch tự học, họp nhóm hoặc việc cá nhân theo ngày cụ thể (tự động kiểm tra trùng giờ).</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Đóng"
              onClick={() => {
                setShowScheduleForm(false);
                setEditingSchedule(null);
                setScheduleFormError('');
                setScheduleDraft(emptySchedule());
              }}
            >
              <X size={17} />
            </button>
          </div>
          <div className="study-form-grid">
            <label>
              Tên sự kiện
              <input
                autoFocus
                value={scheduleDraft.title}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, title: e.target.value })}
                required
                maxLength={200}
                placeholder="Ví dụ: Họp nhóm đồ án AI"
              />
            </label>
            <label>
              Ngày
              <input
                type="date"
                value={scheduleDraft.date}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, date: e.target.value })}
                required
              />
            </label>
            <label>
              Khung giờ (HH:MM - HH:MM)
              <input
                value={scheduleDraft.time}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, time: e.target.value })}
                required
                maxLength={32}
                placeholder="Ví dụ: 14:00 - 16:00"
              />
            </label>
            <label>
              Màu sự kiện
              <input
                type="color"
                value={scheduleDraft.color || '#4f8259'}
                onChange={(e) => setScheduleDraft({ ...scheduleDraft, color: e.target.value })}
              />
            </label>
          </div>
          {draftScheduleConflict && (
            <div className="schedule-conflict-banner" role="alert">
              <AlertTriangle size={15} />
              <span>
                Cảnh báo trùng lịch: {draftScheduleConflict}. Hệ thống vẫn cho phép lưu nếu bạn muốn xếp song song, hoặc
                bạn có thể đổi sang khung giờ khác.
              </span>
            </div>
          )}
          {scheduleFormError && (
            <div className="form-error" role="alert">
              {scheduleFormError}
            </div>
          )}
          <div className="study-editor-actions">
            <button className="primary-button" disabled={busy}>
              {busy ? 'Đang lưu…' : editingSchedule ? 'Lưu sự kiện' : 'Thêm vào lịch'}
            </button>
            <button
              className="soft-button"
              type="button"
              onClick={() => {
                setShowScheduleForm(false);
                setEditingSchedule(null);
                setScheduleFormError('');
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* Study Stopwatch */}
      {showLogForm && (
        <section className="panel study-editor timer-editor">
          <div className="panel-heading">
            <div>
              <h3>Bấm giờ tự học</h3>
              <p>Bắt đầu bộ đếm khi bạn ngồi vào học; dừng lại để lưu vào heatmap.</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Đóng"
              onClick={() => setShowLogForm(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="study-form-grid timer-meta-grid">
            <label>
              Môn học
              <select
                disabled={timerActive}
                value={timer.courseId}
                onChange={(event) => setTimer((current) => ({ ...current, courseId: event.target.value }))}
              >
                <option value="">Tự học chung</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                    {course.status === 'Archived' ? ' (Đã lưu trữ)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ghi chú
              <input
                disabled={timerActive}
                value={timer.note}
                onChange={(event) => setTimer((current) => ({ ...current, note: event.target.value }))}
                maxLength={500}
                placeholder="Nội dung sẽ học"
              />
            </label>
          </div>
          <div className="study-stopwatch">
            <strong aria-live="off">{timerDisplay}</strong>
            <span>{timer.date ? `Phiên học · ${dateLabel(timer.date)}` : 'Sẵn sàng bắt đầu phiên học'}</span>
            <div className="stopwatch-controls">
              {timer.startedAt === null ? (
                <button className="primary-button" type="button" onClick={startTimer} disabled={busy}>
                  <Play size={16} />
                  {timerActive ? 'Tiếp tục' : 'Bắt đầu bấm giờ'}
                </button>
              ) : (
                <button className="soft-button" type="button" onClick={pauseTimer} disabled={busy}>
                  <Pause size={16} />
                  Tạm dừng
                </button>
              )}
              {timerActive && (
                <>
                  <button
                    className="primary-button timer-save-button"
                    type="button"
                    onClick={() => void saveLog()}
                    disabled={busy}
                  >
                    <Check size={16} />
                    {busy ? 'Đang lưu…' : 'Kết thúc & lưu'}
                  </button>
                  <button
                    className="icon-button danger-icon"
                    type="button"
                    title="Bỏ phiên"
                    aria-label="Bỏ phiên bấm giờ"
                    onClick={discardTimer}
                    disabled={busy}
                  >
                    <RotateCcw size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
          <p className="timer-hint">
            Thời gian được lưu theo phút gần nhất. Giờ mỗi môn được tính bằng max(giờ nền đã nhập, tổng giờ log của môn).
          </p>
        </section>
      )}

      {/* Courses Panel */}
      {showCoursesSection && (
        <section className="panel course-list-panel">
          <div className="panel-heading">
            <div>
              <h3>Môn học của bạn</h3>
              <p>Chọn một môn để xem lịch học, điểm số, chuyên cần, giờ nền/giờ log và thao tác chỉnh sửa.</p>
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
                <option value="Active">Đang học (Active)</option>
                <option value="Archived">Lưu trữ (Archived)</option>
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
              {filteredCourses.map((course, i) => {
                const courseSessions = sessions
                  .filter((session) => session.courseId === course.id)
                  .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
                const isExpanded = expandedCourse === course.id;
                const loggedMinutes = logs
                  .filter((l) => l.courseId === course.id)
                  .reduce((s, l) => s + l.durationMinutes, 0);
                const loggedHours = Number((loggedMinutes / 60).toFixed(1));
                const baseHours = Number(Number(course.studyHours ?? 0).toFixed(1));
                const effectiveHours = Number(Math.max(baseHours, loggedHours).toFixed(1));

                return (
                  <article
                    id={`course-${course.id}`}
                    className={`course-card ${isExpanded ? 'course-card-open' : ''}`}
                    key={course.id}
                  >
                    <button
                      className="course-card-summary"
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                    >
                      <div
                        className={`course-badge course-${i % 4}`}
                        style={course.color ? { backgroundColor: `${course.color}22`, color: course.color } : undefined}
                      >
                        <BookOpen size={18} />
                      </div>
                      <div className="course-card-title">
                        <div className="course-title-row">
                          <strong>{course.name}</strong>
                          {course.status === 'Archived' && <span className="course-archived-pill">Lưu trữ</span>}
                          {course.grade && course.grade !== 'N/A' && (
                            <span className="grade-pill">{course.grade}</span>
                          )}
                        </div>
                        <span>
                          {[course.code, course.semester, course.instructor, course.credits ? `${course.credits} TC` : '']
                            .filter(Boolean)
                            .join(' · ') || 'Chưa có mã môn hoặc giảng viên'}
                        </span>
                        <small>
                          {courseSessions.length ? `${courseSessions.length} buổi học` : 'Chưa có lịch học'} · Tiến độ{' '}
                          {course.progress ?? 0}% · {effectiveHours}/{course.aimStudyHours ?? 0}h tự học
                        </small>
                      </div>
                      <ChevronDown className={`course-expand-icon ${isExpanded ? 'expanded' : ''}`} size={17} />
                    </button>
                    {isExpanded && (
                      <div className="course-card-details">
                        <div className="course-metrics-row">
                          <span>
                            Tín chỉ: <strong>{course.credits ?? 0}</strong>
                          </span>
                          <span>
                            Điểm hệ 10: <strong>{course.score10 ?? '—'}</strong>
                          </span>
                          <span>
                            Điểm chữ: <strong>{course.grade || 'N/A'}</strong>
                          </span>
                          <span>
                            Chuyên cần: <strong>{course.attendance ?? 0}%</strong>
                          </span>
                          <span>
                            Giờ nền: <strong>{baseHours}h</strong> · Giờ log: <strong>{loggedHours}h</strong> → Tính tổng:{' '}
                            <strong>
                              {effectiveHours} / {course.aimStudyHours ?? 0}h
                            </strong>
                          </span>
                          <span>
                            Trạng thái: <strong>{course.status === 'Archived' ? 'Lưu trữ' : 'Đang học'}</strong>
                          </span>
                        </div>
                        <div className="course-card-actions course-detail-actions">
                          <button className="soft-button" type="button" onClick={() => startEditCourse(course)}>
                            <Pencil size={14} /> Sửa môn
                          </button>
                          <button
                            className="soft-button danger-course-button"
                            type="button"
                            disabled={itemBusyId === course.id}
                            onClick={() => void deleteCourse(course)}
                          >
                            <Trash2 size={14} /> Xóa môn
                          </button>
                        </div>
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
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="study-empty">
              <BookOpen size={24} />
              <strong>{courses.length ? 'Không có môn học khớp bộ lọc' : 'Chưa có môn học'}</strong>
              <span>
                {courses.length
                  ? 'Thử chọn Tất cả học kỳ hoặc xóa bộ lọc trạng thái.'
                  : 'Thêm môn học đầu tiên để bắt đầu tạo thời khóa biểu.'}
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

      {/* Weekly Timetable & Personal Schedule */}
      {showScheduleSection && (
        <>
          <section className="panel timetable-panel">
            <div className="panel-heading">
              <div>
                <h3>Thời khóa biểu tuần (Lịch học cố định)</h3>
                <p>
                  {sessions.length
                    ? `${sessions.length} buổi học · Thời gian, tiết, địa điểm và phòng học.`
                    : 'Thời gian, tiết, địa điểm và phòng học.'}
                </p>
              </div>
              {sessions.length > 0 && (
                <button
                  className="soft-button timetable-expand-button"
                  type="button"
                  aria-expanded={showTimetable}
                  onClick={() => setShowTimetable((value) => !value)}
                >
                  <ChevronDown className={showTimetable ? 'expanded' : ''} size={15} />
                  {showTimetable ? 'Thu gọn' : 'Xem đầy đủ'}
                </button>
              )}
            </div>
            {sessions.length ? (
              <>
                <div className="timetable-scroll-hint" aria-hidden="true">
                  ↔ Vuốt ngang để xem toàn bộ các ngày trong tuần
                </div>
                {!showTimetable && (
                  <div className="compact-week-scroll">
                    <div className="compact-week-summary">
                      {weekdayNames.map((day, index) => {
                        const daySessions = sessions
                          .filter((session) => session.weekday === index + 1)
                          .sort((a, b) => a.startTime.localeCompare(b.startTime));
                        const firstSession = daySessions[0];
                        const course = firstSession ? courses.find((item) => item.id === firstSession.courseId) : null;
                        return (
                          <div className="compact-week-day" key={day}>
                            <strong>{weekdayShortNames[index]}</strong>
                            {firstSession ? (
                              <>
                                <div className="compact-week-entry">
                                  <span title={course?.name ?? 'Môn học'}>{course?.name ?? 'Môn học'}</span>
                                  <small>
                                    {firstSession.startTime}–{firstSession.endTime}
                                  </small>
                                </div>
                                {daySessions.length > 1 && (
                                  <span className="compact-week-count">+{daySessions.length - 1} buổi</span>
                                )}
                              </>
                            ) : (
                              <small className="compact-week-empty">Trống</small>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {showTimetable && (
                  <div className="timetable-scroll">
                    <div className="weekly-timetable">
                      <div className="timetable-corner">Giờ</div>
                      {weekdayNames.map((day) => (
                        <div className="timetable-day-heading" key={day}>
                          {day}
                        </div>
                      ))}
                      <div className="timetable-times">
                        {Array.from({ length: 16 }, (_, i) => (
                          <span key={i}>{`${String(i + 6).padStart(2, '0')}:00`}</span>
                        ))}
                      </div>
                      {weekdayNames.map((day, index) => (
                        <div className="timetable-day" key={day}>
                          {sessions
                            .filter((session) => session.weekday === index + 1)
                            .map((session) => {
                              // Clamp position inside the 768px grid so sessions before 06:00 or after 21:00 remain visible & accessible
                              const rawTop = (minutesOf(session.startTime) - 360) * 0.8;
                              const top = Math.min(720, Math.max(0, rawTop));
                              const rawHeight = (minutesOf(session.endTime) - minutesOf(session.startTime)) * 0.8;
                              const height = Math.min(768 - top, Math.max(28, rawHeight));
                              const course = courses.find((item) => item.id === session.courseId);
                              return (
                                <div
                                  className={`timetable-session timetable-tone-${Math.max(0, courses.findIndex((item) => item.id === session.courseId)) % 4}`}
                                  key={session.id}
                                  style={{ top, height }}
                                  title={`${course?.name ?? 'Môn học'} · ${session.startTime}–${session.endTime}`}
                                >
                                  <strong>{course?.name ?? 'Môn học'}</strong>
                                  <span>
                                    {session.startTime}–{session.endTime}
                                  </span>
                                  <small>
                                    Tiết {session.periodStart}–{session.periodEnd}
                                  </small>
                                  {(session.room || session.location) && (
                                    <small>{[session.room, session.location].filter(Boolean).join(' · ')}</small>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="study-empty compact">
                <CalendarDays size={22} />
                <span>Thêm lịch học vào môn học để xem thời khóa biểu.</span>
              </div>
            )}
          </section>

          {/* Personal Schedule Panel (/api/study/schedule) */}
          <section className="panel personal-schedule-panel">
            <div className="panel-heading">
              <div>
                <h3>Lịch cá nhân & Sự kiện theo ngày</h3>
                <p>Phân biệt với thời khóa biểu cố định: quản lý kế hoạch tự học, họp nhóm và cảnh báo trùng giờ.</p>
              </div>
              <div className="panel-heading-tools">
                <div className="segmented-control" role="group" aria-label="Chế độ xem lịch cá nhân">
                  <button
                    type="button"
                    className={scheduleViewMode === 'week' ? 'active' : ''}
                    onClick={() => setScheduleViewMode('week')}
                  >
                    Theo tuần
                  </button>
                  <button
                    type="button"
                    className={scheduleViewMode === 'day' ? 'active' : ''}
                    onClick={() => setScheduleViewMode('day')}
                  >
                    Theo ngày
                  </button>
                </div>
                {scheduleViewMode === 'day' && (
                  <input
                    type="date"
                    aria-label="Chọn ngày xem lịch"
                    className="compact-date-input"
                    value={selectedScheduleDate}
                    onChange={(e) => setSelectedScheduleDate(e.target.value)}
                  />
                )}
                <button
                  type="button"
                  className="soft-button compact-btn"
                  onClick={() => {
                    setEditingSchedule(null);
                    setScheduleFormError('');
                    setScheduleDraft({ ...emptySchedule(), date: selectedScheduleDate || todayString() });
                    setShowScheduleForm(true);
                  }}
                >
                  <Plus size={14} /> Thêm sự kiện
                </button>
              </div>
            </div>

            {scheduleViewMode === 'week' ? (
              <div className="schedule-week-grid">
                {weekDays.map((day) => {
                  const dayEvents = scheduleItems
                    .filter((item) => item.date === day.iso)
                    .sort((a, b) => a.time.localeCompare(b.time));
                  const daySessions = sessions
                    .filter((s) => s.weekday === day.weekday)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  return (
                    <div className="schedule-day-card" key={day.iso}>
                      <div className="schedule-day-head">
                        <strong>{day.name}</strong>
                        <small>{dateLabel(day.iso)}</small>
                      </div>
                      <div className="schedule-day-body">
                        {daySessions.map((sess) => {
                          const cName = courses.find((c) => c.id === sess.courseId)?.name ?? 'Môn học';
                          return (
                            <div className="schedule-entry class-entry" key={`class-${sess.id}`}>
                              <span className="entry-badge">Lớp học</span>
                              <strong>{cName}</strong>
                              <small>
                                {sess.startTime}–{sess.endTime} {sess.room ? `· ${sess.room}` : ''}
                              </small>
                            </div>
                          );
                        })}
                        {dayEvents.map((ev) => {
                          const conflict = detectScheduleConflict(ev.date, ev.time, ev.id);
                          return (
                            <div
                              className={`schedule-entry personal-entry ${conflict ? 'conflict-entry' : ''}`}
                              key={ev.id}
                              style={ev.color ? { borderLeftColor: ev.color } : undefined}
                            >
                              <div className="schedule-entry-top">
                                <span className="entry-badge personal">Cá nhân</span>
                                {conflict && (
                                  <span className="conflict-pill" title={conflict}>
                                    <AlertTriangle size={11} /> Trùng giờ
                                  </span>
                                )}
                                <div className="schedule-entry-actions">
                                  <button
                                    type="button"
                                    className="icon-button"
                                    aria-label={`Sửa sự kiện ${ev.title}`}
                                    onClick={() => startEditScheduleItem(ev)}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-button danger-icon"
                                    disabled={itemBusyId === ev.id}
                                    aria-label={`Xóa sự kiện ${ev.title}`}
                                    onClick={() => void deleteScheduleItem(ev)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              <strong>{ev.title}</strong>
                              <small>{ev.time}</small>
                            </div>
                          );
                        })}
                        {!daySessions.length && !dayEvents.length && (
                          <span className="schedule-empty-day">Không có lịch</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="schedule-day-detail">
                {(() => {
                  const wday = isoWeekday(selectedScheduleDate);
                  const daySessions = sessions
                    .filter((s) => s.weekday === wday)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  const dayEvents = scheduleItems
                    .filter((item) => item.date === selectedScheduleDate)
                    .sort((a, b) => a.time.localeCompare(b.time));
                  if (!daySessions.length && !dayEvents.length) {
                    return (
                      <div className="study-empty compact">
                        <Calendar size={20} />
                        <span>Chưa có buổi học hoặc lịch cá nhân nào trong ngày {dateLabel(selectedScheduleDate)}.</span>
                      </div>
                    );
                  }
                  return (
                    <div className="task-list">
                      {daySessions.map((sess) => {
                        const cName = courses.find((c) => c.id === sess.courseId)?.name ?? 'Môn học';
                        return (
                          <div className="project-task" key={`day-sess-${sess.id}`}>
                            <span className="entry-badge">Lớp học cố định</span>
                            <div className="task-copy">
                              <strong>{cName}</strong>
                              <span>
                                {sess.startTime}–{sess.endTime} · Tiết {sess.periodStart}–{sess.periodEnd}{' '}
                                {sess.room ? `· Phòng ${sess.room}` : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {dayEvents.map((ev) => {
                        const conflict = detectScheduleConflict(ev.date, ev.time, ev.id);
                        return (
                          <div className="project-task" key={ev.id}>
                            <span
                              className="entry-badge personal"
                              style={ev.color ? { backgroundColor: `${ev.color}22`, color: ev.color } : undefined}
                            >
                              Lịch cá nhân
                            </span>
                            <div className="task-copy">
                              <strong>{ev.title}</strong>
                              <span>
                                {ev.time} · {dateLabel(ev.date)}
                                {conflict ? ` · ⚠️ ${conflict}` : ''}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Sửa sự kiện ${ev.title}`}
                              onClick={() => startEditScheduleItem(ev)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-button task-delete"
                              disabled={itemBusyId === ev.id}
                              aria-label={`Xóa sự kiện ${ev.title}`}
                              onClick={() => void deleteScheduleItem(ev)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </section>

          {/* Study Heatmap Panel */}
          <section className="panel heatmap-panel">
            <div className="panel-heading">
              <div>
                <h3>Thời gian tự học trong tuần</h3>
                <p>
                  {Math.floor(currentWeekMinutes / 60)} giờ {currentWeekMinutes % 60} phút đã ghi nhận trong tuần · Tổng
                  tích lũy {unifiedStudy.totalHours} giờ
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
              <button className="text-button log-entry-link" type="button" onClick={() => setShowLogForm(true)}>
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
        </>
      )}

      {/* Assignments Panel */}
      {showAssignmentsSection && (
        <section className="panel assignment-panel">
          <div className="panel-heading">
            <div>
              <h3>Bài tập</h3>
              <p>Quản lý hạn nộp và theo dõi tiến độ hoàn thành.</p>
            </div>
            <div className="panel-heading-tools">
              {assignments.length > 0 && (
                <>
                  <select
                    aria-label="Lọc trạng thái bài tập"
                    className="compact-select"
                    value={assignmentStatusFilter}
                    onChange={(e) => setAssignmentStatusFilter(e.target.value)}
                  >
                    <option value="all">Mọi trạng thái</option>
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
                  {courses.length > 0 && (
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
                </>
              )}
              <span className="count-pill">{assignments.filter((item) => item.status !== 'Completed').length} chờ</span>
            </div>
          </div>
          {filteredAssignments.length ? (
            <div className="task-list">
              {filteredAssignments.map((item) => (
                <AssignmentRow
                  key={item.id}
                  item={item}
                  courses={courses}
                  busy={itemBusyId === item.id}
                  highlighted={highlightedId === item.id}
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
              {courses.length > 0 && (
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
                      {course ? `${course.name}${course.status === 'Archived' ? ' (Lưu trữ)' : ''}` : 'Chưa gắn môn'} ·
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
              {courses.length > 0 && (
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
                          {course ? `${course.name}${course.status === 'Archived' ? ' (Lưu trữ)' : ''}` : 'Ghi chú chung'} ·{' '}
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
  detail: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="study-stat-card">
      <div className={`study-stat-icon ${tone}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function AssignmentRow({
  item,
  courses,
  busy,
  highlighted,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: Assignment;
  courses: Course[];
  busy?: boolean;
  highlighted?: boolean;
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
          <strong>{item.title}</strong>
          {item.status === 'In Progress' && !done && <span className="task-status-chip">Đang làm</span>}
        </div>
        <span>
          <i className={`priority-dot priority-${item.priority.toLowerCase()}`} />
          {course ? `${course.name}${course.status === 'Archived' ? ' (Lưu trữ)' : ''}` : 'Chưa gắn môn'} ·{' '}
          {item.priority === 'High' ? 'Ưu tiên cao' : item.priority === 'Low' ? 'Ưu tiên thấp' : 'Ưu tiên vừa'} · Nộp{' '}
          {formatDeadline(item.deadline)}
          {item.estimatedTime && item.estimatedTime !== '0h' ? ` · ⏱ ${item.estimatedTime}` : ''}
        </span>
      </div>
      <span className={`task-due-state ${!done && remaining < 0 ? 'overdue' : !done && remaining === 1 ? 'due-soon' : ''}`}>
        {state}
      </span>
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
  );
}
