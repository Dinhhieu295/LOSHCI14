import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Flag, GripVertical, Lightbulb, Plus, SlidersHorizontal } from 'lucide-react';
import {
  api, type Assignment, type AvailabilityWindow, type CalendarTaskBlock, type CalendarTaskInput, type CalendarTime, type Course,
  type CourseSession, type NoticeHandler, type PlanningSettings, type Project, type ProjectTask, type ScheduleItem,
} from './api';
import { CalendarDialog, PersonalEventEditor, TaskSlotEditor, type PersonalDraft } from './CalendarEditors';
import CalendarAvailability from './CalendarAvailability';
import { dateLabel, defaultAvailability, getFreeDays, localDate, parseTimeRange, timeLabel, weekdays } from './studyPlanning';
import {
  buildQueue, collectWork, dateOf, datesFrom, fixedCalendarEntries, fixedTaskTimes, layoutDay, overlaps, restMinutes, roundTime, sessionMinutes,
  shiftDate, startOfWeek, stepMinutes, suggestTaskBlocks, undone, weekdayOf, workCategoryLabels,
  type CalendarEntry, type QueueItem, type WorkItem,
} from './taskCalendar';
import { useCalendarDrag, type DragSource, type DragTarget } from './useCalendarDrag';
import './planning.css';
import './timetable.css';

interface Props {
  courses: Course[];
  sessions: CourseSession[];
  schedule: ScheduleItem[];
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  personalTasks: ProjectTask[];
  assignments: Assignment[];
  onOpenAssignment: (courseId: string | null, assignmentId: string) => void;
  setSchedule: Dispatch<SetStateAction<ScheduleItem[]>>;
  planningRevision: number;
  weekDate: string | null;
  onWeekChange: (date: string | null) => void;
  showAvailability: boolean;
  onAvailabilityChange: (value: boolean) => void;
  onNotice: NoticeHandler;
  onOpenCourse: (courseId?: string) => void;
  onOpenTask: (projectId: string | null, taskId: string) => void;
}

type Editor =
  | { kind: 'task'; taskId: string; initial: CalendarTime; block?: CalendarTaskBlock; draftId?: string }
  | { kind: 'personal'; event?: ScheduleItem }
  | { kind: 'deadlines'; date: string };

const pixelsPerMinute = 1;
const workRoute = '/calendar/task-blocks';
const queuePreference = 'lifeos_calendar_queue_collapsed';
const periodLabel = (slot: CalendarTime) => `${timeLabel(slot.start)}–${timeLabel(slot.end)}`;
const shortDate = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
const minutesLabel = (minutes: number) => minutes < 60 ? `${minutes} phút` :
  `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ''}`;

export default function TimetablePage({ courses, sessions, schedule, projects, tasksByProject, personalTasks, assignments, setSchedule, onNotice,
  onOpenCourse, onOpenTask, onOpenAssignment, weekDate, onWeekChange, showAvailability, onAvailabilityChange, planningRevision }: Props) {
  const [now, setNow] = useState(() => new Date());
  const today = localDate(now);
  const week = useMemo(() => startOfWeek(dateOf(weekDate ?? today)), [weekDate, today]);
  const [fourWeeks, setFourWeeks] = useState(false);
  const [jumpDay, setJumpDay] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<CalendarTaskBlock[] | null>(null);
  const [availability, setAvailability] = useState<AvailabilityWindow[]>(defaultAvailability);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [preview, setPreview] = useState<CalendarTaskBlock[] | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [queueCollapsed, setQueueCollapsed] = useState(() => localStorage.getItem(queuePreference) === 'true');
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState('');
  const pending = useRef(false);
  const draftSequence = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api<CalendarTaskBlock[]>(workRoute), api<PlanningSettings>('/planning')]).then(([saved, settings]) => {
      if (!active) return;
      setBlocks(saved);
      setAvailability(settings.availability ?? defaultAvailability);
      setLoadError('');
    }).catch((error) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Không tải được phiên làm việc.');
    });
    return () => { active = false; };
  }, [attempt, planningRevision]);

  const work = useMemo(() => collectWork(projects, tasksByProject, personalTasks, assignments, courses), [projects, tasksByProject, personalTasks, assignments, courses]);
  const tasks = useMemo(() => new Map(work.map((item) => [item.task.id, item])), [work]);
  const deadlines = useMemo(() => {
    const grouped = new Map<string, WorkItem[]>();
    for (const item of work) {
      if (!item.task.dueDate) continue;
      const day = grouped.get(item.task.dueDate) ?? [];
      day.push(item);
      grouped.set(item.task.dueDate, day);
    }
    for (const day of grouped.values()) {
      day.sort((a, b) => Number(undone(b.task)) - Number(undone(a.task)) || a.task.title.localeCompare(b.task.title, 'vi'));
    }
    return grouped;
  }, [work]);
  const days = useMemo(() => datesFrom(week), [week]);
  const fixed = useMemo(() => fixedCalendarEntries(days, courses, sessions, schedule, personalTasks),
    [days, courses, sessions, schedule, personalTasks]);
  const appointments = useMemo(() => fixedTaskTimes(personalTasks, days), [personalTasks, days]);
  const taskEntries: CalendarEntry[] = (blocks ?? []).filter((block) => days.includes(block.date)).flatMap((block) => {
    const task = tasks.get(block.taskId)?.task;
    return task ? [{ ...block, kind: 'task', title: task.title, done: !undone(task) }] : [];
  });
  const suggestions: CalendarEntry[] = (preview ?? []).map((block) => ({
    ...block, kind: 'suggestion', title: tasks.get(block.taskId)?.task.title ?? '', done: false,
  }));
  const entries = [...fixed, ...taskEntries, ...suggestions.filter((block) => days.includes(block.date))];
  const queue = buildQueue(work, [...(blocks ?? []), ...(preview ?? [])], now);
  const standaloneCategories = (['employment', 'personal'] as const)
    .filter((category) => personalTasks.some((task) => (task.category ?? 'personal') === category));
  const visibleQueue = queue.filter((item) => !projectFilter || (item.group.id ?? item.task.category ?? 'personal') === projectFilter);
  const activeIds = new Set(courses.filter((course) => course.status === 'Active').map((course) => course.id));
  const activeSessions = sessions.filter((session) => activeIds.has(session.courseId));
  const hasDeadlines = days.some((date) => deadlines.has(date));
  const topMinute = Math.floor(Math.min(420, ...entries.map((entry) => entry.start)) / 60) * 60;
  const bottomMinute = Math.ceil(Math.max(1320, ...entries.map((entry) => entry.end)) / 60) * 60;
  const ticks = Array.from({ length: (bottomMinute - topMinute) / 60 + 1 }, (_, index) => topMinute + 60 * index);
  const malformed = schedule.filter((entry) => days.includes(entry.date) && !parseTimeRange(entry.time));

  const reportError = (message: string) => {
    setOperationError(message);
    onNotice({ type: 'error', message });
  };
  const run = async (message: string, action: () => Promise<void>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setOperationError('');
    try {
      await action();
      onNotice({ type: 'success', message });
      return true;
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'Không lưu được thay đổi.');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const conflictFor = (target: CalendarTime, ignoreId?: string) =>
    [...fixedCalendarEntries([target.date], courses, sessions, schedule, personalTasks), ...[...(blocks ?? []), ...(preview ?? [])].map((block) => ({
      ...block, title: tasks.get(block.taskId)?.task.title ?? 'phiên làm việc đã xếp',
    }))].find((entry) => entry.id !== ignoreId && overlaps(entry, target))?.title;

  const saveBlocks = async (incoming: CalendarTaskInput[]) => {
    const saved = await api<CalendarTaskBlock[]>(workRoute, { method: 'POST', body: JSON.stringify({ blocks: incoming }) });
    setBlocks((existing) => [...(existing ?? []), ...saved]);
    setPreview(null);
  };
  const saveTaskTime = async (target: CalendarTime, taskId: string, block?: CalendarTaskBlock, draftId?: string) => {
    if (!blocks || pending.current) return false;
    const conflict = conflictFor(target, block?.id ?? draftId);
    if (conflict) {
      reportError(`Trùng giờ với “${conflict}”. Hãy chọn giờ khác.`);
      return false;
    }
    if (preview && !block) {
      if (!draftId && preview.length >= 100) {
        reportError('Lưu bản xem trước trước khi xếp thêm phiên.');
        return false;
      }
      const next = { ...target, taskId, workKind: tasks.get(taskId)?.workKind, id: draftId ?? `draft-${++draftSequence.current}` };
      setPreview((previous) => draftId
        ? (previous ?? []).map((item) => item.id === draftId ? next : item)
        : [...(previous ?? []), next]);
      setOperationError('');
      if (!days.includes(target.date)) onWeekChange(localDate(startOfWeek(dateOf(target.date))));
      return true;
    }
    const success = await run(block ? 'Đã chuyển phiên làm việc.' : 'Đã thêm phiên làm việc vào lịch.', async () => {
      if (!block) return saveBlocks([{ ...target, taskId, workKind: tasks.get(taskId)?.workKind }]);
      const saved = await api<CalendarTaskBlock>(`${workRoute}/${block.id}`, { method: 'PATCH', body: JSON.stringify(target) });
      setBlocks((existing) => existing?.map((item) => item.id === saved.id ? saved : item) ?? null);
    });
    if (success && !days.includes(target.date)) onWeekChange(localDate(startOfWeek(dateOf(target.date))));
    return success;
  };
  const returnToQueue = async (block: CalendarTaskBlock) => {
    const success = await run('Đã bỏ phiên khỏi lịch. Công việc vẫn còn trong dự án.', async () => {
      await api<void>(`${workRoute}/${block.id}`, { method: 'DELETE' });
      setBlocks((existing) => existing?.filter((item) => item.id !== block.id) ?? null);
    });
    if (success) setEditor(null);
  };
  const returnDraft = (id: string) => {
    setPreview((existing) => existing?.filter((item) => item.id !== id) ?? null);
    setOperationError('');
    setEditor(null);
  };

  const onDrop = (source: DragSource, target: DragTarget) => {
    if (target.kind === 'queue') {
      if (source.block) void returnToQueue(source.block);
      if (source.draftId) returnDraft(source.draftId);
      return;
    }
    const start = Math.max(0, Math.round(target.minute / stepMinutes) * stepMinutes);
    const end = start + source.duration;
    if (end > 1440) {
      reportError('Phiên làm việc vượt quá cuối ngày. Hãy chọn giờ sớm hơn.');
      return;
    }
    if (source.block && source.block.date === target.date && source.block.start === start) return;
    void saveTaskTime({ date: target.date, start, end }, source.taskId, source.block, source.draftId);
  };

  const { viewport, handle, drag } = useCalendarDrag(onDrop, topMinute, pixelsPerMinute);

  const toggleQueue = () => {
    const collapsed = !queueCollapsed;
    setQueueCollapsed(collapsed);
    localStorage.setItem(queuePreference, String(collapsed));
  };

  useEffect(() => {
    const element = viewport.current;
    const visible = jumpDay && days.includes(jumpDay) ? jumpDay : today;
    const currentDay = element?.querySelector<HTMLElement>(`[data-calendar-date="${visible}"]`);
    if (element) element.scrollLeft = currentDay ? currentDay.offsetLeft - 50 : 0;
  }, [days, today, jumpDay, fourWeeks, viewport]);

  useEffect(() => {
    const element = viewport.current;
    const page = element?.closest('.calendar-page');
    if (!element || !page) return;

    const visibleViewport = window.visualViewport;
    let frame = 0;
    const fitCalendar = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = element.getBoundingClientRect().top + window.scrollY;
        const available = Math.floor((visibleViewport?.height ?? window.innerHeight) - top - 12);
        // Keep the calendar usable after scrolling past tall toolbars or the expanded queue.
        const height = `${available >= 180 ? available : 240}px`;
        if (element.style.getPropertyValue('--calendar-available-height') !== height) {
          element.style.setProperty('--calendar-available-height', height);
        }
      });
    };
    const observer = new ResizeObserver(fitCalendar);
    observer.observe(page);
    window.addEventListener('resize', fitCalendar);
    visibleViewport?.addEventListener('resize', fitCalendar);
    fitCalendar();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', fitCalendar);
      visibleViewport?.removeEventListener('resize', fitCalendar);
    };
  }, [fourWeeks, viewport]);

  const suggest = () => {
    if (!blocks) return;
    setOperationError('');
    const blocked = [...appointments, ...blocks.map((block) => ({
      ...block, start: Math.max(0, block.start - restMinutes), end: Math.min(1440, block.end + restMinutes),
    }))];
    const free = getFreeDays(now, availability, activeSessions, schedule, { startOn: week, blocked });
    setPreview(suggestTaskBlocks(visibleQueue, free, blocks, today).map((block) => ({
      ...block, id: `draft-${++draftSequence.current}`,
    })));
  };

  const selectSlot = (item: QueueItem) => {
    const date = days.includes(today) ? today : days[0];
    const duration = Math.min(item.remaining, sessionMinutes);
    const start = date === today ? Math.min(1440 - duration, Math.max(420, roundTime(now.getHours() * 60 + now.getMinutes()))) : 540;
    setOperationError('');
    setEditor({ kind: 'task', taskId: item.task.id, initial: { date, start, end: start + duration } });
  };
  const openEntry = (entry: CalendarEntry) => {
    setOperationError('');
    if (entry.kind === 'course') onOpenCourse(entry.courseId);
    if (entry.kind === 'personal') setEditor({ kind: 'personal', event: entry.event });
    if (entry.kind === 'fixed-task') onOpenTask(null, entry.taskId);
    if (entry.kind === 'task') setEditor({ kind: 'task', taskId: entry.taskId, block: entry, initial: entry });
    if (entry.kind === 'suggestion') setEditor({ kind: 'task', taskId: entry.taskId, draftId: entry.id, initial: entry });
  };
  const savePersonal = async (draft: PersonalDraft, id?: string) => {
    if (await run(id ? 'Đã cập nhật sự kiện.' : 'Đã thêm sự kiện.', async () => {
      const saved = await api<ScheduleItem>(id ? `/study/schedule/${id}` : '/study/schedule', {
        method: id ? 'PATCH' : 'POST', body: JSON.stringify(draft),
      });
      setSchedule((existing) => id ? existing.map((item) => item.id === id ? saved : item) : [...existing, saved]);
    })) {
      setEditor(null);
      if (!days.includes(draft.date)) onWeekChange(localDate(startOfWeek(dateOf(draft.date))));
    }
  };
  const deletePersonal = async (id: string) => {
    if (await run('Đã xóa sự kiện.', async () => {
      await api<void>(`/study/schedule/${id}`, { method: 'DELETE' });
      setSchedule((existing) => existing.filter((item) => item.id !== id));
    })) setEditor(null);
  };
  const editTask = editor?.kind === 'task' ? tasks.get(editor.taskId) : undefined;
  const moveWeek = (next: Date | null) => {
    onWeekChange(next ? localDate(startOfWeek(next)) : null);
    if (preview?.length === 0) setPreview(null);
    setOperationError('');
  };
  const jumpToDate = (date: string) => {
    if (!date || !Number.isFinite(dateOf(date).getTime())) return;
    setJumpDay(date);
    setFourWeeks(false);
    moveWeek(dateOf(date));
  };
  const openDeadlinesTask = ({ task, group, workKind, courseId }: WorkItem) => workKind === 'assignment'
    ? onOpenAssignment(courseId ?? null, task.id) : onOpenTask(group.id, task.id);
  const saveAvailability = (windows: AvailabilityWindow[]) => run('Đã lưu khung giờ rảnh.', async () => {
    await api<void>('/planning/availability', { method: 'PUT', body: JSON.stringify({ windows }) });
    setAvailability(windows);
  });
  const endDate = localDate(shiftDate(week, fourWeeks ? 27 : 6));

  return (
    <div className="planning-page calendar-page">
      <header className="planning-heading calendar-heading">
        <div><h1>Lịch trình</h1>{!fourWeeks && <p>Lịch học tự cập nhật. Kéo việc từ hàng đợi để xếp giờ.</p>}</div>
        {!fourWeeks && <div className="planning-actions">
          <button type="button" className="soft-button" disabled={busy} onClick={() => {
            setOperationError(''); setEditor({ kind: 'personal' });
          }}><Plus size={16} /> Thêm sự kiện</button>
          <button type="button" className="primary-button" disabled={!blocks || !!loadError || busy || !!preview || !visibleQueue.length} onClick={suggest}>
            <Lightbulb size={16} /> Gợi ý xếp lịch
          </button>
        </div>}
      </header>

      <div className="calendar-toolbar">
        <div className="planning-actions">
          <button className="soft-button calendar-arrow" type="button" aria-label={fourWeeks ? '4 tuần trước' : 'Tuần trước'}
            onClick={() => { setJumpDay(null); moveWeek(shiftDate(week, fourWeeks ? -28 : -7)); }}><ChevronLeft size={16} /></button>
          <strong aria-live="polite">{shortDate(days[0])} – {shortDate(endDate)}</strong>
          <button className="soft-button calendar-arrow" type="button" aria-label={fourWeeks ? '4 tuần sau' : 'Tuần sau'}
            onClick={() => { setJumpDay(null); moveWeek(shiftDate(week, fourWeeks ? 28 : 7)); }}><ChevronRight size={16} /></button>
          <button className="soft-button" type="button" onClick={() => { setJumpDay(today); moveWeek(null); }}>Hôm nay</button>
        </div>
        <div className="planning-actions calendar-views">
          <label className="calendar-jump">
            <span>Chọn tuần</span>
            <input type="date" aria-label="Chọn ngày để mở tuần" value={jumpDay && days.includes(jumpDay) ? jumpDay : days[0]}
              onChange={(event) => jumpToDate(event.target.value)} />
          </label>
          <button type="button" className="soft-button" aria-pressed={fourWeeks} onClick={() => setFourWeeks((value) => !value)}>
            {fourWeeks ? 'Xem tuần' : 'Xem 4 tuần'}
          </button>
          <details className="calendar-options">
            <summary className="soft-button" aria-label="Tùy chọn lịch"><SlidersHorizontal size={15} /><span>Tùy chọn lịch</span></summary>
            <div className="panel">
              <button className="soft-button" type="button" onClick={() => onOpenCourse()}>Quản lý lịch học</button>
              <button className="soft-button" type="button" onClick={() => { setEditor(null); onAvailabilityChange(true); }}>Khung giờ rảnh</button>
            </div>
          </details>
        </div>
      </div>
      {loadError ? <div className="panel planning-panel">
        <p role="alert">{loadError}</p>
        <button className="soft-button" onClick={() => setAttempt((value) => value + 1)}>Tải lại phiên làm việc</button>
      </div> : !blocks && <p role="status">Đang tải phiên làm việc…</p>}

      {preview && <section className="panel planning-panel calendar-preview" aria-live="polite">
        <div className="planning-section-head">
          <div>
            <h2>{preview.length ? `Xem trước ${preview.length} phiên làm việc` : 'Chưa có phiên trong bản xem trước'}</h2>
            <p>{preview.length ? 'Kéo phiên gợi ý sang giờ khác hoặc trả về hàng đợi trước khi lưu.' :
              'Chọn tuần khác hoặc chỉnh khung giờ rảnh để tìm thêm thời gian.'}</p>
            <p>Gợi ý ưu tiên hạn gần, tối đa 3 giờ làm việc mỗi ngày và chừa 15 phút nghỉ.</p>
          </div>
          <div className="planning-actions">
            {preview.length > 0 && <button disabled={busy} type="button" className="primary-button"
              onClick={() => void run('Đã lưu các phiên được gợi ý.', () => saveBlocks(preview))}>Lưu lịch gợi ý</button>}
            <button disabled={busy} type="button" className="soft-button" onClick={() => setPreview(null)}>Đóng xem trước</button>
          </div>
        </div>
      </section>}
      {operationError && !editor && <p className="form-error calendar-error" role="alert">{operationError}</p>}

      {fourWeeks ? (
        <CalendarWeeks start={week} today={today} deadlines={deadlines} sessions={activeSessions}
          appointments={fixedTaskTimes(personalTasks, datesFrom(week, 28))} onChoose={jumpToDate} />
      ) : <div className="calendar-layout" data-queue-collapsed={queueCollapsed || undefined}>
        <aside data-calendar-queue className={`panel calendar-queue${drag?.block || drag?.draftId ? ' calendar-drop-ready' : ''}`} aria-label="Hàng đợi công việc">
          <div className="calendar-queue-head">
            <h2>Hàng đợi <span>{blocks ? visibleQueue.length : '—'}</span></h2>
            <button type="button" className="soft-button calendar-queue-toggle"
              aria-label={queueCollapsed ? 'Mở hàng đợi' : 'Thu gọn hàng đợi'}
              aria-expanded={!queueCollapsed} aria-controls="calendar-queue-content" onClick={toggleQueue}>
              {queueCollapsed ? 'Mở' : 'Thu gọn'} <ChevronDown size={16} aria-hidden="true" />
            </button>
          </div>
          <div id="calendar-queue-content" className="calendar-queue-content" hidden={queueCollapsed}>
            {(projects.length + standaloneCategories.length + courses.length > 1) && <select className="calendar-filter" aria-label="Lọc hàng đợi" value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}>
              <option value="">Tất cả công việc</option>
              {standaloneCategories.map((category) => <option value={category} key={category}>{workCategoryLabels[category]}</option>)}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
              {courses.filter((course) => assignments.some((item) => item.courseId === course.id)).map((course) => <option key={course.id} value={course.id}>Bài tập · {course.name}</option>)}
            </select>}
            <p className="calendar-queue-hint">Việc linh hoạt chưa xếp đủ giờ. Thả phiên vào đây để trả về hàng đợi.</p>
            {blocks && !visibleQueue.length && <p className="calendar-queue-empty">Không còn việc cần xếp giờ trong hàng đợi này.</p>}
            <ul className="calendar-queue-list">
              {blocks && visibleQueue.map((item) => (
                <li key={item.task.id} className="calendar-queue-card">
                  <div><strong>{item.task.title}</strong><p>{item.group.title}</p>
                    <p>{minutesLabel(item.remaining)} còn lại{item.task.dueDate && ` · Hạn ${dateLabel(item.task.dueDate)}`}</p></div>
                  <div>
                    <button className="soft-button" type="button" aria-label={`Xếp giờ cho ${item.task.title}`} disabled={busy || !!loadError}
                      onClick={() => selectSlot(item)}>Xếp giờ</button>
                    <button type="button" className="calendar-grip" aria-label={`Kéo ${item.task.title} vào lịch`} disabled={busy || !!loadError}
                      {...handle({ title: item.task.title, taskId: item.task.id, duration: Math.min(item.remaining, sessionMinutes) })}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSlot(item); } }}>
                      <GripVertical size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className={`panel calendar-board${drag ? ' calendar-dragging' : ''}`} aria-label="Lịch theo tuần">
          <div className="calendar-legend"><span data-kind="course">Lớp học</span><span data-kind="personal">Cá nhân</span>
            {appointments.length > 0 && <span data-kind="fixed-task">Việc cố định</span>}
            <span data-kind="task">Việc đã xếp giờ</span><span data-kind="deadline">Hạn chót</span>
            {preview?.length ? <span data-kind="suggestion">Gợi ý</span> : null}</div>
          <div className="calendar-viewport" ref={viewport} tabIndex={0} aria-label="Lưới lịch tuần, có thể cuộn ngang">
            <div className="calendar-grid">
              <div className="calendar-time-header" aria-hidden="true"><CalendarDays size={17} /></div>
              {days.map((date) => <div className="calendar-day-header" key={date} data-today={date === today || undefined}>
                <strong>{weekdays[weekdayOf(dateOf(date)) - 1]}</strong><span>{shortDate(date)}</span>
              </div>)}
              {hasDeadlines && <>
                <div className="calendar-deadline-label">Hạn</div>
                {days.map((date) => {
                  const items = deadlines.get(date) ?? [];
                  return <div className="calendar-deadline-cell" key={date} data-deadlines={date}>
                    {items.slice(0, 2).map((item) => (
                      <button type="button" className="calendar-deadline" data-kind="deadline"
                        data-completed={!undone(item.task) || undefined} key={item.task.id}
                        title={`${item.task.title} · ${item.group.title}`}
                        aria-label={`Hạn: ${item.task.title}`} onClick={() => openDeadlinesTask(item)}>
                        <Flag size={12} /><span>{item.task.title}</span>
                      </button>
                    ))}
                    {items.length > 2 && <button type="button" className="calendar-deadline-more"
                      aria-label={`Xem ${items.length} hạn ngày ${shortDate(date)}`}
                      onClick={() => setEditor({ kind: 'deadlines', date })}>+{items.length - 2} hạn</button>}
                  </div>;
                })}
              </>}
              <div className="calendar-time-rail" aria-hidden="true">
                {ticks.map((minute) => <span key={minute} style={{ top: Math.min((minute - topMinute) * pixelsPerMinute, (bottomMinute - topMinute) * pixelsPerMinute - 15) }}>{timeLabel(minute)}</span>)}
              </div>
              {days.map((date) => <div className="calendar-date" key={date} data-calendar-date={date}
                aria-label={dateLabel(date)} style={{ height: (bottomMinute - topMinute) * pixelsPerMinute }}>
                {layoutDay(entries.filter((entry) => entry.date === date)).map(({ entry, lane, count }) => {
                  const duration = entry.end - entry.start;
                  const time = periodLabel(entry);
                  const isWork = entry.kind === 'task' || entry.kind === 'suggestion';
                  const conflicted = (isWork || entry.kind === 'fixed-task') &&
                    fixed.some((other) => other.id !== entry.id && overlaps(entry, other));
                  const timeWithConflict = conflicted ? `${time} · Trùng lịch` : time;
                  const fixedTask = entry.kind === 'fixed-task' ? tasks.get(entry.taskId) : undefined;
                  const category = fixedTask?.task.category === 'employment' ? `${fixedTask.group.title} · Hằng tuần` : fixedTask?.group.title;
                  const detail = entry.kind === 'course' ? entry.location : category;
                  const summary = `${entry.title} · ${time}${category ? ` · ${category}` : ''}${conflicted ? ' · Trùng lịch' : ''}`;
                  const canDrag = isWork && !entry.done && !busy && !loadError;
                  return (
                    <div className="calendar-entry" key={entry.id} data-kind={entry.kind}
                      data-conflict={conflicted || undefined}
                      data-done={(entry.kind === 'task' || entry.kind === 'fixed-task') && entry.done || undefined}
                      title={entry.kind === 'course' && entry.location ? `${summary} · ${entry.location}` : summary}
                      style={{
                        top: (entry.start - topMinute) * pixelsPerMinute,
                        height: Math.max(18, duration * pixelsPerMinute - 1),
                        left: `calc(${lane * 100 / count}% + 2px)`,
                        width: `calc(${100 / count}% - 4px)`,
                        borderInlineStartColor: entry.kind === 'personal' && /^#[0-9a-f]{6}$/i.test(entry.event.color) ? entry.event.color : undefined,
                      }}>
                      <button type="button" className="calendar-entry-title" aria-label={summary} onClick={() => openEntry(entry)}>
                        {entry.title}
                        {duration >= 30 ? <small>{timeWithConflict}</small> : ` · ${timeWithConflict}`}
                        {duration >= 45 && detail && <small>{detail}</small>}
                      </button>
                      {canDrag && (
                        <button type="button" className="calendar-grip" aria-label={`Kéo phiên ${entry.title}`}
                          {...handle({ title: entry.title, taskId: entry.taskId, block: entry.kind === 'task' ? entry : undefined,
                            draftId: entry.kind === 'suggestion' ? entry.id : undefined, duration })}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEntry(entry); } }}>
                          <GripVertical size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>)}
            </div>
          </div>
          {malformed.length > 0 && <div className="calendar-legacy">
            <p>Sự kiện cần chỉnh giờ để hiện trên lịch</p>
            {malformed.map((event) => <button className="soft-button" type="button" key={event.id} onClick={() => {
              setOperationError(''); setEditor({ kind: 'personal', event });
            }}>{event.title}</button>)}
          </div>}
        </section>
      </div>}

      {drag && <div className="calendar-drag-preview" aria-hidden="true"
        style={{ left: Math.max(0, Math.min(drag.x + 12, window.innerWidth - 165)), top: Math.max(0, Math.min(drag.y + 8, window.innerHeight - 45)) }}>
        <GripVertical size={16} /> {drag.title}
      </div>}
      {(drag?.block || drag?.draftId) && <div className="calendar-mobile-drop" data-calendar-queue>
        Thả vào đây để trả về hàng đợi
      </div>}
      {editor?.kind === 'task' && editTask && <TaskSlotEditor title={editTask.task.title} initial={editor.initial} busy={busy} errorMessage={operationError}
        done={!undone(editTask.task)} onClose={() => setEditor(null)} onOpenTask={() => openDeadlinesTask(editTask)}
        onReturn={editor.block ? () => void returnToQueue(editor.block!) : editor.draftId ? () => returnDraft(editor.draftId!) : undefined}
        onSave={async (target) => {
          const saved = await saveTaskTime(target, editor.taskId, editor.block, editor.draftId);
          if (saved) setEditor(null);
          return saved;
        }} />}
      {editor?.kind === 'personal' && <PersonalEventEditor initial={editor.event} date={days.includes(today) ? today : days[0]} busy={busy} errorMessage={operationError}
        onClose={() => setEditor(null)} onSave={savePersonal} onDelete={deletePersonal} checkConflict={conflictFor} />}
      {editor?.kind === 'deadlines' && <CalendarDialog title={`Hạn chót ngày ${shortDate(editor.date)}`} onClose={() => setEditor(null)}>
        <ul className="planning-list">
          {(deadlines.get(editor.date) ?? []).map((item) => <li className="planning-row" key={item.task.id}>
            <div><button type="button" className="planning-open" onClick={() => openDeadlinesTask(item)}>{item.task.title}</button>
              <p>{item.group.title}{!undone(item.task) && ' · Đã hoàn thành'}</p></div>
          </li>)}
        </ul>
      </CalendarDialog>}
      {showAvailability && blocks && <CalendarDialog title="Khung giờ rảnh" wide busy={busy} onClose={() => onAvailabilityChange(false)}>
        <CalendarAvailability windows={availability} saving={busy} onSave={saveAvailability}
          days={getFreeDays(now, availability, activeSessions, schedule, { blocked: [...fixedTaskTimes(personalTasks, datesFrom(now)), ...blocks] })} />
        {operationError && <p className="form-error" role="alert">{operationError}</p>}
      </CalendarDialog>}
    </div>
  );
}

function CalendarWeeks({ start, today, deadlines, sessions, appointments, onChoose }: {
  start: Date;
  today: string;
  deadlines: Map<string, WorkItem[]>;
  sessions: CourseSession[];
  appointments: CalendarTime[];
  onChoose: (date: string) => void;
}) {
  return <section className="panel planning-panel" aria-label="Tổng quan 4 tuần">
    <h2>Tổng quan 4 tuần</h2>
    <p>Chọn một ngày để mở tuần có lịch học và hạn công việc của ngày đó.</p>
    <div className="calendar-weeks">
      {weekdays.map((day, index) => <span key={day} aria-label={day}>{index === 6 ? 'CN' : `T${index + 2}`}</span>)}
      {Array.from({ length: 28 }, (_, index) => {
        const day = shiftDate(start, index);
        const date = localDate(day);
        const count = deadlines.get(date)?.length ?? 0;
        const classes = sessions.filter((session) => session.weekday === weekdayOf(day)).length;
        const fixedCount = appointments.filter((item) => item.date === date).length;
        return <button type="button" key={date} data-week-date={date} data-today={date === today || undefined}
          aria-label={`${dateLabel(date)}, ${count} hạn, ${classes} buổi học, ${fixedCount} việc cố định`} onClick={() => onChoose(date)}>
          <strong>{shortDate(date)}</strong>
          {count > 0 && <span className="week-deadline-count" data-kind="deadline">{count} hạn</span>}
          {classes > 0 && <span className="week-class-count" data-kind="course">{classes} lớp</span>}
          {fixedCount > 0 && <span className="week-fixed-count" data-kind="fixed-task">{fixedCount} hẹn</span>}
        </button>;
      })}
    </div>
  </section>;
}
