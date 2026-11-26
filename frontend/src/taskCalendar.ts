import type { Assignment, CalendarTaskBlock, CalendarTaskInput, CalendarTime, Course, CourseSession, Project, ProjectTask, ScheduleItem, TaskCategory } from './api';
import { localDate, parseTimeRange, type FreeDay } from './studyPlanning';

export const stepMinutes = 15;
export const sessionMinutes = 90;
export const dailyMinutes = 180;
export const restMinutes = 15;
export const workCategoryLabels: Record<TaskCategory, string> = {
  employment: 'Việc làm',
  personal: 'Việc cá nhân',
};

export const weekdayOf = (day: Date) => ((day.getDay() + 6) % 7) + 1;
export const dateOf = (date: string) => new Date(`${date}T12:00:00`);
export const roundTime = (minute: number) => Math.ceil(minute / stepMinutes) * stepMinutes;
export const overlaps = (a: CalendarTime, b: CalendarTime) => a.date === b.date && a.start < b.end && b.start < a.end;

export function shiftDate(day: Date, days: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days, 12);
}

export function startOfWeek(day: Date) {
  return shiftDate(day, 1 - weekdayOf(day));
}

export function datesFrom(day: Date, count = 7) {
  return Array.from({ length: count }, (_, index) => localDate(shiftDate(day, index)));
}

function fixedTaskOccurrence(task: ProjectTask, date: string): CalendarTime | null {
  const slot = task.fixedSlot;
  if (!slot) return null;
  if (task.category !== 'employment') return slot.date === date ? slot : null;
  if (!undone(task) || date < slot.date || weekdayOf(dateOf(date)) !== weekdayOf(dateOf(slot.date))) return null;
  return { ...slot, date };
}

export type CalendarEntry =
  | (CalendarTime & { id: string; kind: 'course'; title: string; courseId: string; location: string })
  | (CalendarTime & { id: string; kind: 'personal'; title: string; event: ScheduleItem })
  | (CalendarTime & { id: string; kind: 'fixed-task'; title: string; taskId: string; done: boolean })
  | (CalendarTaskBlock & { kind: 'task' | 'suggestion'; title: string; done: boolean });

export function fixedCalendarEntries(days: string[], courses: Course[], sessions: CourseSession[], events: ScheduleItem[], personalTasks: ProjectTask[]) {
  const courseMap = new Map(courses.filter((course) => course.status === 'Active').map((course) => [course.id, course]));
  return days.flatMap((date): CalendarEntry[] => [
    ...sessions.flatMap((session): CalendarEntry[] => {
      const course = courseMap.get(session.courseId);
      if (!course || session.weekday !== weekdayOf(dateOf(date))) return [];
      const range = parseTimeRange(`${session.startTime} - ${session.endTime}`);
      if (!range) return [];
      return [{ id: `${date}-${session.id}`, kind: 'course', date, start: range[0], end: range[1],
        title: course.name, courseId: course.id, location: [session.location, session.room].filter(Boolean).join(' · ') }];
    }),
    ...events.filter((event) => event.date === date).flatMap((event): CalendarEntry[] => {
      const range = parseTimeRange(event.time);
      return range ? [{ id: event.id, kind: 'personal', date, start: range[0], end: range[1], title: event.title, event }] : [];
    }),
    ...personalTasks.flatMap((task): CalendarEntry[] => {
      const occurrence = fixedTaskOccurrence(task, date);
      return occurrence ? [{ ...occurrence, id: `fixed-${task.id}-${date}`, kind: 'fixed-task',
        title: task.title, taskId: task.id, done: !undone(task) }] : [];
    }),
  ]);
}

export function durationMinutes(value: string) {
  const raw = value.toLowerCase().trim().replace(',', '.');
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = /^(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|giờ))?\s*(?:(\d+)\s*(?:minutes?|mins?|m|phút))?$/.exec(raw);
  if (!match?.[1] && !match?.[2]) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function undone(task: ProjectTask) {
  return !task.isDone && task.status !== 'done';
}

export function fixedTaskTimes(tasks: ProjectTask[], dates: string[]) {
  return dates.flatMap((date) => tasks.flatMap((task) => {
    const occurrence = fixedTaskOccurrence(task, date);
    return occurrence ? [occurrence] : [];
  }));
}

export interface WorkItem {
  task: ProjectTask;
  group: { id: string | null; title: string };
  workKind?: 'task' | 'assignment';
  courseId?: string | null;
}

export interface QueueItem extends WorkItem {
  remaining: number;
}

export function collectWork(projects: Project[], tasksByProject: Record<string, ProjectTask[]>, personalTasks: ProjectTask[], assignments: Assignment[] = [], courses: Course[] = []): WorkItem[] {
  return [
    ...projects.flatMap((project) => (tasksByProject[project.id] ?? []).map((task) => ({ task, group: project }))),
    ...personalTasks.map((task) => ({ task, group: { id: null, title: workCategoryLabels[task.category ?? 'personal'] } })),
    ...assignments.map((assignment): WorkItem => ({
      workKind: 'assignment', courseId: assignment.courseId,
      group: { id: assignment.courseId, title: courses.find((course) => course.id === assignment.courseId)?.name ?? 'Bài tập chung' },
      task: { id: assignment.id, projectId: null, category: null, fixedSlot: null, title: assignment.title,
        priority: assignment.priority, dueDate: assignment.deadline.slice(0, 10), isDone: assignment.status === 'Completed',
        status: assignment.status === 'Completed' ? 'done' : assignment.status === 'In Progress' ? 'in-progress' : 'todo',
        estimate: assignment.estimatedTime ?? '0h', actual: '0m',
        subtasksDone: 0, subtasksTotal: 0, assignee: '', startDay: 0, durationDays: 1, baselineStart: 0, baselineDuration: 1,
        isMilestone: false, dependencies: assignment.dependencies ?? [], completedAt: null, createdAt: '', updatedAt: '',
      },
    })),
  ];
}

const priorityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function buildQueue(work: WorkItem[], blocks: CalendarTaskBlock[], now: Date) {
  const reserved = new Map<string, number>();
  const today = localDate(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  for (const block of blocks) {
    if (block.date < today || (block.date === today && block.end <= minute)) continue;
    reserved.set(block.taskId, (reserved.get(block.taskId) ?? 0) + block.end - block.start);
  }
  return work.flatMap((item): QueueItem[] => {
    const { task } = item;
    if (!undone(task) || task.fixedSlot || task.category === 'employment') return [];
    const estimate = durationMinutes(task.estimate) || 60;
    const target = roundTime(Math.max(stepMinutes, estimate - (durationMinutes(task.actual) ?? 0)));
    const gap = target - (reserved.get(task.id) ?? 0);
    return gap > 0 ? [{ ...item, remaining: roundTime(gap) }] : [];
  }).sort((a, b) => (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999') ||
    (priorityRank[b.task.priority.toLowerCase()] ?? 0) - (priorityRank[a.task.priority.toLowerCase()] ?? 0) ||
    a.task.title.localeCompare(b.task.title, 'vi'));
}

export function suggestTaskBlocks(queue: QueueItem[], days: FreeDay[], existing: CalendarTaskBlock[], today: string) {
  const scheduled = new Map<string, number>();
  for (const block of existing) {
    scheduled.set(block.date, (scheduled.get(block.date) ?? 0) + block.end - block.start);
  }
  const slots = days.flatMap((day) => day.slots.map(([start, end]) => ({ date: day.date, start: roundTime(start), end })));
  const blocks: CalendarTaskInput[] = [];
  for (const item of queue) {
    let remaining = item.remaining;
    const due = item.task.dueDate;
    for (const slot of slots) {
      if (remaining <= 0 || blocks.length >= 100) break;
      if (due && due >= today && slot.date > due) break;
      while (remaining > 0 && blocks.length < 100) {
        const budget = dailyMinutes - (scheduled.get(slot.date) ?? 0);
        const usable = Math.floor(Math.min(slot.end - slot.start, budget) / stepMinutes) * stepMinutes;
        const length = Math.min(remaining, usable, sessionMinutes);
        if (length < stepMinutes) break;
        blocks.push({ taskId: item.task.id, workKind: item.workKind, date: slot.date, start: slot.start, end: slot.start + length });
        scheduled.set(slot.date, (scheduled.get(slot.date) ?? 0) + length);
        slot.start += length + restMinutes;
        remaining -= length;
      }
    }
  }
  return blocks;
}

export function layoutDay(entries: CalendarEntry[]) {
  const ordered = [...entries].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: { entry: CalendarEntry; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const layout: { entry: CalendarEntry; lane: number; count: number }[] = [];
  const flush = () => {
    for (const entry of group) layout.push({ ...entry, count: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const entry of ordered) {
    if (entry.start >= groupEnd) flush();
    const freeLane = laneEnds.findIndex((end) => end <= entry.start);
    const lane = freeLane < 0 ? laneEnds.length : freeLane;
    laneEnds[lane] = entry.end;
    group.push({ entry, lane });
    groupEnd = Math.max(groupEnd, entry.end);
  }
  flush();
  return layout;
}
