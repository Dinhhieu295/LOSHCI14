import type { Assignment, AvailabilityWindow, CalendarTime, Course, CourseSession, Exam, ScheduleItem, StudyLog, StudyPreference } from './api';

const gradeScale = [
  { minimum: 9, grade: 'A+', points: 4 },
  { minimum: 8.5, grade: 'A', points: 4 },
  { minimum: 8, grade: 'B+', points: 3.5 },
  { minimum: 7, grade: 'B', points: 3 },
  { minimum: 6.5, grade: 'C+', points: 2.5 },
  { minimum: 5.5, grade: 'C', points: 2 },
  { minimum: 5, grade: 'D+', points: 1.5 },
  { minimum: 4, grade: 'D', points: 1 },
  { minimum: 0, grade: 'F', points: 0 },
];

export { gradeScale };

export function gradePoints(score: number | null | undefined, grade: string) {
  if (score != null && Number.isFinite(score) && score >= 0 && score <= 10) {
    return gradeScale.find((band) => score >= band.minimum)?.points ?? null;
  }
  return gradeScale.find((band) => band.grade === grade.trim().toUpperCase())?.points ?? null;
}

export function calculateGpa(courses: Course[], scenarios: Record<string, number> = {}) {
  let credits = 0;
  let weighted = 0;
  for (const course of courses) {
    const points = gradePoints(scenarios[course.id] ?? course.score10, course.grade);
    if (points === null || course.credits <= 0) continue;
    credits += course.credits;
    weighted += course.credits * points;
  }
  return { value: credits > 0 ? weighted / credits : null, credits };
}

export const weekdays = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];

export const defaultAvailability: AvailabilityWindow[] = weekdays.map((_, index) => ({
  weekday: index + 1, start: '07:00', end: '22:00',
}));

type Range = [number, number];

export function parseTimeRange(value: string): Range | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:-|–|—|đến|to)\s*([01]?\d|2[0-3]):([0-5]\d))?$/i.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = match[3] === undefined ? Math.min(1440, start + 60) : Number(match[3]) * 60 + Number(match[4]);
  return start < end ? [start, end] : null;
}

export function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateLabel(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export interface FreeDay {
  date: string;
  available: boolean;
  slots: Range[];
}

export function getFreeDays(
  now: Date,
  availability: AvailabilityWindow[],
  sessions: CourseSession[],
  schedule: ScheduleItem[],
  { startOn = now, blocked = [] }: { startOn?: Date; blocked?: CalendarTime[] } = {},
): FreeDay[] {
  const today = localDate(now);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(startOn.getFullYear(), startOn.getMonth(), startOn.getDate() + index, 12);
    const date = localDate(day);
    const weekday = ((day.getDay() + 6) % 7) + 1;
    const window = availability.find((entry) => entry.weekday === weekday);
    const range = window && parseTimeRange(`${window.start} - ${window.end}`);
    if (!range) return { date, available: false, slots: [] };
    if (date < today) return { date, available: true, slots: [] };

    const busy = [
      ...sessions.filter((session) => session.weekday === weekday)
        .map((session) => parseTimeRange(`${session.startTime} - ${session.endTime}`)),
      ...schedule.filter((item) => item.date === date).map((item) => parseTimeRange(item.time)),
      ...blocked.filter((item) => item.date === date).map((item): Range => [item.start, item.end]),
    ].filter((entry): entry is Range => entry !== null).sort(([left], [right]) => left - right);
    const [start, end] = range;
    const slots: Range[] = [];
    let cursor = date === today ? Math.max(start, Math.ceil((now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) / 5) * 5) : start;
    for (const [busyStart, busyEnd] of busy) {
      const gapEnd = Math.min(busyStart, end);
      if (cursor < gapEnd) slots.push([cursor, gapEnd]);
      cursor = Math.max(cursor, busyEnd);
      if (cursor >= end) break;
    }
    if (cursor < end) slots.push([cursor, end]);
    return { date, available: true, slots };
  });
}

export function recommendStudy(
  courses: Course[],
  assignments: Assignment[],
  exams: Exam[],
  logs: StudyLog[],
  days: FreeDay[],
  feedback: Record<string, StudyPreference>,
) {
  const today = days[0]?.date ?? '';
  const lastDay = days[days.length - 1]?.date ?? today;
  const candidates = courses.filter((course) => course.status === 'Active').map((course) => {
    const nextAssignment = assignments.filter((item) => item.courseId === course.id && item.status !== 'Completed')
      .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
    const nextExam = exams.filter((item) => item.courseId === course.id && item.date.slice(0, 10) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const logged = logs.filter((log) => log.courseId === course.id)
      .reduce((minutes, log) => minutes + log.durationMinutes, 0);
    const gap = Math.max(0, Math.round((course.aimStudyHours ?? 0) * 60 - Math.max(logged, (course.studyHours ?? 0) * 60)));
    const reasons: string[] = [];
    let priority = Math.round((100 - course.progress) / 5) + Math.min(20, Math.round(gap / 15));
    const assignmentDate = nextAssignment?.deadline.slice(0, 10);
    const examDate = nextExam?.date.slice(0, 10);
    const upcomingAssignment = nextAssignment && assignmentDate && assignmentDate <= lastDay;
    const upcomingExam = nextExam && examDate && examDate <= lastDay;
    if (upcomingAssignment) {
      const overdue = assignmentDate < today;
      priority += (overdue ? 45 : 30) + (nextAssignment.priority === 'High' ? 10 : 0);
      reasons.push(overdue ? 'Có bài tập quá hạn' : `Bài tập đến hạn ${dateLabel(nextAssignment.deadline)}`);
    }
    if (upcomingExam) {
      priority += 30 + Math.round((100 - nextExam.prepProgress) / 10);
      reasons.push(`Kỳ thi ${dateLabel(nextExam.date)} · ôn tập ${nextExam.prepProgress}%`);
    }
    if (gap > 0) reasons.push(`Còn ${Math.ceil(gap / 60)} giờ tới mục tiêu`);
    if (!reasons.length) reasons.push(`Tiến độ môn ${course.progress}%`);
    const preference = feedback[course.id];
    if (preference) {
      priority += preference === 'more' ? 40 : -40;
      reasons.push(preference === 'more' ? 'Bạn muốn học thêm môn này' : 'Bạn muốn giảm thời lượng môn này');
    }
    const target = Math.min(120, Math.max(50, Math.ceil(gap / 30) * 30));
    const minutes = preference === 'more' ? target + 40 : preference === 'less' ? Math.max(25, target - 30) : target;
    const due = [upcomingAssignment ? assignmentDate : undefined, upcomingExam ? examDate : undefined]
      .filter((value): value is string => Boolean(value)).sort()[0];
    return { course, priority, due, reasons, minutes, blocks: [] as { date: string; start: number; end: number }[] };
  }).sort((a, b) => b.priority - a.priority || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.course.name.localeCompare(b.course.name, 'vi'));

  const remaining = days.flatMap((day) => day.slots.map(([start, end]) => ({ date: day.date, start, end })));
  for (const candidate of candidates) {
    let minutes = candidate.minutes;
    for (const slot of remaining) {
      if (minutes < 25) break;
      if (slot.end - slot.start < 25) continue;
      const length = Math.min(slot.end - slot.start, 90, minutes);
      candidate.blocks.push({ date: slot.date, start: slot.start, end: slot.start + length });
      slot.start += length;
      minutes -= length;
    }
  }
  return candidates;
}
