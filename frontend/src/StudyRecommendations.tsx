import { useEffect, useState } from 'react';
import {
  api, type Assignment, type CalendarTaskBlock, type Course, type CourseSession, type Exam,
  type NoticeHandler, type PlanningSettings, type ProjectTask, type ScheduleItem, type StudyLog, type StudyPreference,
} from './api';
import { dateLabel, defaultAvailability, getFreeDays, recommendStudy, timeLabel, type FreeDay } from './studyPlanning';
import { datesFrom, fixedTaskTimes } from './taskCalendar';
import './planning.css';

type Props = {
  courses: Course[];
  assignments: Assignment[];
  exams: Exam[];
  logs: StudyLog[];
  sessions: CourseSession[];
  schedule: ScheduleItem[];
  personalTasks: ProjectTask[];
  onNotice: NoticeHandler;
  onOpenCourses: () => void;
  onOpenAvailability: () => void;
};

export default function StudyRecommendations(props: Props) {
  const [settings, setSettings] = useState<PlanningSettings | null>(null);
  const [blocks, setBlocks] = useState<CalendarTaskBlock[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [pendingCourse, setPendingCourse] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api<PlanningSettings>('/planning'), api<CalendarTaskBlock[]>('/calendar/task-blocks')]).then(
      ([result, savedBlocks]) => { if (active) { setSettings(result); setBlocks(savedBlocks); } },
      () => { if (active) setError('Không tải được gợi ý học.'); },
    );
    return () => { active = false; };
  }, [attempt]);

  if (!settings) return <section className="panel planning-panel">
    {error ? <><p role="alert">{error}</p><button className="soft-button" onClick={() => {
      setError(''); setAttempt((current) => current + 1);
    }}>Thử lại</button></> : <p role="status">Đang tải gợi ý học…</p>}
  </section>;

  const activeCourses = new Set(props.courses.filter((course) => course.status === 'Active').map((course) => course.id));
  const now = new Date();
  const days = getFreeDays(now, settings.availability ?? defaultAvailability,
    props.sessions.filter((session) => activeCourses.has(session.courseId)), props.schedule,
    { blocked: [...blocks, ...fixedTaskTimes(props.personalTasks, datesFrom(now))] });
  const feedback = Object.fromEntries(settings.feedback.map(({ courseId, preference }) => [courseId, preference]));

  const saveFeedback = async (courseId: string, preference: StudyPreference | null) => {
    setPendingCourse(courseId);
    try {
      await api<void>(`/planning/feedback/${encodeURIComponent(courseId)}`, {
        method: 'PUT', body: JSON.stringify({ preference }),
      });
      setSettings((current) => {
        if (!current) return current;
        const next = current.feedback.filter((item) => item.courseId !== courseId);
        if (preference) next.push({ courseId, preference });
        return { ...current, feedback: next };
      });
      props.onNotice({ message: 'Đã cập nhật gợi ý theo phản hồi của bạn.', type: 'success' });
    } catch {
      props.onNotice({ message: 'Không lưu được phản hồi. Bạn có thể thử lại.', type: 'error' });
    } finally {
      setPendingCourse(null);
    }
  };

  return <div className="planning-page"><Recommendations {...props} days={days} feedback={feedback}
    pendingCourse={pendingCourse} onFeedback={saveFeedback} /></div>;
}

function Recommendations({ courses, assignments, exams, logs, days, feedback, pendingCourse, onFeedback, onOpenCourses, onOpenAvailability }: {
  courses: Course[];
  assignments: Assignment[];
  exams: Exam[];
  logs: StudyLog[];
  days: FreeDay[];
  feedback: Record<string, StudyPreference>;
  pendingCourse: string | null;
  onFeedback: (courseId: string, preference: StudyPreference | null) => Promise<void>;
  onOpenCourses: () => void;
  onOpenAvailability: () => void;
}) {
  const plan = recommendStudy(courses, assignments, exams, logs, days, feedback);
  return (
    <section className="panel planning-panel">
      <div className="planning-section-head">
        <div>
          <h2>Môn nên ưu tiên</h2>
          <p>Gợi ý dựa trên hạn bài tập, kỳ thi, mục tiêu và giờ trống trong 7 ngày tới.</p>
        </div>
        {plan.length > 0 && <button className="soft-button" onClick={onOpenAvailability}>Xem giờ trống</button>}
      </div>
      {plan.length === 0 ? (
        <div className="planning-empty">
          <p>Thêm môn đang học để nhận gợi ý.</p>
          <button className="primary-button" onClick={onOpenCourses}>Mở Môn học</button>
        </div>
      ) : (
        <ol className="planning-list">
          {plan.map(({ course, reasons, blocks }) => (
            <li className="planning-recommendation" key={course.id}>
              <h3>{course.name}</h3>
              <p>{reasons.join(' · ')}</p>
              {blocks.length > 0 ? (
                <ul className="planning-chips" aria-label="Khung giờ gợi ý">
                  {blocks.map(({ date, start, end }) => <li key={`${date}-${start}`}>{dateLabel(date)} · {timeLabel(start)}–{timeLabel(end)}</li>)}
                </ul>
              ) : <p>Chưa có khung giờ trống từ 25 phút cho môn này.</p>}
              <div className="planning-actions" aria-label={`Phản hồi cho ${course.name}`}>
                {(['more', 'less'] as const).map((preference) => (
                  <button key={preference} type="button" className="soft-button" disabled={pendingCourse !== null}
                    aria-pressed={feedback[course.id] === preference}
                    onClick={() => void onFeedback(course.id, feedback[course.id] === preference ? null : preference)}>
                    {preference === 'more' ? 'Học thêm' : 'Học ít hơn'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
