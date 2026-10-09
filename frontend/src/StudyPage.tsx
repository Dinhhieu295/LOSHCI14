import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, Circle, Clock3, MapPin, Pause, Pencil, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { api, type Assignment, type Course, type CourseSession, type StudyLog, type StudySummary } from './api';

type Props = { userId: string; courses: Course[]; sessions: CourseSession[]; logs: StudyLog[]; assignments: Assignment[]; summary: StudySummary | null; loading: boolean; onRefresh: () => Promise<void>; onNotice: (message: string) => void };
type CourseDraft = { name: string; code: string; semester: string; instructor: string };
type SessionDraft = { weekday: string; startTime: string; endTime: string; periodStart: string; periodEnd: string; location: string; room: string };
type AssignmentDraft = { title: string; deadline: string; priority: string; courseId: string };
type TimerState = { startedAt: number | null; elapsedSeconds: number; date: string; courseId: string; note: string };

const blankCourse: CourseDraft = { name: '', code: '', semester: '', instructor: '' };
const blankSession: SessionDraft = { weekday: '1', startTime: '08:00', endTime: '09:30', periodStart: '1', periodEnd: '2', location: '', room: '' };
const emptyAssignment = (): AssignmentDraft => ({ title: '', deadline: todayString(), priority: 'Medium', courseId: '' });
const blankTimer: TimerState = { startedAt: null, elapsedSeconds: 0, date: '', courseId: '', note: '' };
const weekdayNames = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
const weekdayShortNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const todayString = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dateLabel = (value: string) => new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(`${value}T12:00:00`));
const minutesOf = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; };
const daysUntil = (value: string) => { const [year, month, day] = value.slice(0, 10).split('-').map(Number); const now = new Date(); return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000); };
const formatDeadline = (value: string) => { const [year, month, day] = value.slice(0, 10).split('-').map(Number); return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day)); };
const assignmentReminderKey = (item: Assignment) => `lifeos:assignment-reminder:${item.id}:${item.deadline}`;
const weekStartFor = (date: Date) => { const day = (date.getDay() + 6) % 7; const monday = new Date(date); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - day); return monday; };

export default function StudyPage({ userId, courses, sessions, logs, assignments, summary, loading, onRefresh, onNotice }: Props) {
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(blankCourse);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft>(emptyAssignment);
  const [showTimetable, setShowTimetable] = useState(false);
  const [sessionCourse, setSessionCourse] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>(blankSession);
  const [showLogForm, setShowLogForm] = useState(false);
  const timerStorageKey = `lifeos:study-timer:${userId}`;
  const [timer, setTimer] = useState<TimerState>(() => {
    try { return { ...blankTimer, ...JSON.parse(localStorage.getItem(timerStorageKey) ?? '{}') } as TimerState; }
    catch { return blankTimer; }
  });
  const [clockNow, setClockNow] = useState(Date.now());
  const [weekOffset, setWeekOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const weekDays = useMemo(() => {
    const monday = weekStartFor(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    return weekdayNames.map((name, i) => {
      const date = new Date(monday); date.setDate(monday.getDate() + i);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { name, iso, date };
    });
  }, [weekOffset]);
  const minutesByDate = useMemo(() => logs.reduce<Record<string, number>>((totals, log) => {
    totals[log.date] = (totals[log.date] ?? 0) + log.durationMinutes;
    return totals;
  }, {}), [logs]);
  const currentWeekMinutes = weekDays.reduce((sum, day) => sum + (minutesByDate[day.iso] ?? 0), 0);
  const timerActive = timer.startedAt !== null || timer.elapsedSeconds > 0;
  const elapsedSeconds = timer.elapsedSeconds + (timer.startedAt === null ? 0 : Math.max(0, Math.floor((clockNow - timer.startedAt) / 1000)));
  const timerDisplay = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:${String(Math.floor(elapsedSeconds / 60) % 60).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

  useEffect(() => { localStorage.setItem(timerStorageKey, JSON.stringify(timer)); }, [timerStorageKey, timer]);
  useEffect(() => {
    if (timer.startedAt === null) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer.startedAt]);

  const saveCourse = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const method = editingCourse ? 'PATCH' : 'POST';
      const path = editingCourse ? `/study/courses/${editingCourse}` : '/study/courses';
      await api(path, { method, body: JSON.stringify(courseDraft) });
      setCourseDraft(blankCourse); setEditingCourse(null); setShowCourseForm(false);
      await onRefresh(); onNotice(editingCourse ? 'Đã cập nhật môn học.' : 'Đã thêm môn học.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không lưu được môn học.'); }
    finally { setBusy(false); }
  };

  const deleteCourse = async (course: Course) => {
    if (!window.confirm(`Xóa môn “${course.name}”? Lịch học của môn sẽ bị xóa, bài tập liên quan vẫn được giữ.`)) return;
    try { await api(`/study/courses/${course.id}`, { method: 'DELETE' }); await onRefresh(); onNotice('Đã xóa môn học.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Không xóa được môn học.'); }
  };

  const startEditCourse = (course: Course) => {
    setCourseDraft({ name: course.name, code: course.code ?? '', semester: course.semester ?? '', instructor: course.instructor ?? '' });
    setEditingCourse(course.id); setShowCourseForm(true);
  };

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault(); if (!assignmentDraft.title.trim()) return;
    const payload = { title: assignmentDraft.title.trim(), deadline: assignmentDraft.deadline, priority: assignmentDraft.priority, courseId: assignmentDraft.courseId || null };
    setBusy(true);
    try {
      const path = editingAssignment ? `/study/assignments/${editingAssignment}` : '/study/assignments';
      await api(path, { method: editingAssignment ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (editingAssignment) {
        const previous = assignments.find(item => item.id === editingAssignment);
        if (previous) localStorage.removeItem(assignmentReminderKey(previous));
      }
      setShowAssignmentForm(false); setEditingAssignment(null); setAssignmentDraft(emptyAssignment());
      await onRefresh(); onNotice(editingAssignment ? 'Đã cập nhật bài tập.' : 'Đã thêm bài tập.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không lưu được bài tập.'); }
    finally { setBusy(false); }
  };

  const startEditAssignment = (item: Assignment) => {
    setAssignmentDraft({ title: item.title, deadline: item.deadline.slice(0, 10), priority: item.priority, courseId: item.courseId ?? '' });
    setEditingAssignment(item.id); setShowAssignmentForm(true);
  };

  const toggleAssignment = async (item: Assignment) => {
    const isDone = item.status === 'Completed';
    try {
      await api(`/study/assignments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: isDone ? 'Not Started' : 'Completed', deadline: item.deadline }) });
      if (isDone) localStorage.removeItem(assignmentReminderKey(item));
      await onRefresh();
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không cập nhật được trạng thái bài tập.'); }
  };

  const deleteAssignment = async (item: Assignment) => {
    if (!window.confirm(`Xóa bài tập “${item.title}”?`)) return;
    try { await api(`/study/assignments/${item.id}`, { method: 'DELETE' }); localStorage.removeItem(assignmentReminderKey(item)); await onRefresh(); onNotice('Đã xóa bài tập.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Không xóa được bài tập.'); }
  };

  const saveSession = async (event: FormEvent) => {
    event.preventDefault(); if (!sessionCourse) return;
    const payload = { courseId: sessionCourse, weekday: Number(sessionDraft.weekday), startTime: sessionDraft.startTime, endTime: sessionDraft.endTime, periodStart: Number(sessionDraft.periodStart), periodEnd: Number(sessionDraft.periodEnd), location: sessionDraft.location.trim(), room: sessionDraft.room.trim(), color: '' };
    if (payload.endTime <= payload.startTime) { onNotice('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    if (payload.periodEnd < payload.periodStart) { onNotice('Tiết kết thúc phải bằng hoặc sau tiết bắt đầu.'); return; }
    setBusy(true);
    try {
      await api(editingSession ? `/study/course-sessions/${editingSession}` : '/study/course-sessions', { method: editingSession ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setSessionDraft(blankSession); setEditingSession(null); setSessionCourse(null); await onRefresh(); onNotice(editingSession ? 'Đã cập nhật lịch học.' : 'Đã thêm lịch học.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không lưu được lịch học.'); }
    finally { setBusy(false); }
  };

  const beginEditSession = (session: CourseSession) => {
    setSessionCourse(session.courseId); setEditingSession(session.id);
    setSessionDraft({ weekday: String(session.weekday), startTime: session.startTime, endTime: session.endTime, periodStart: String(session.periodStart), periodEnd: String(session.periodEnd), location: session.location, room: session.room });
  };

  const deleteSession = async (session: CourseSession) => {
    try { await api(`/study/course-sessions/${session.id}`, { method: 'DELETE' }); await onRefresh(); onNotice('Đã xóa buổi học khỏi thời khóa biểu.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Không xóa được lịch học.'); }
  };

  const startTimer = () => {
    const now = Date.now(); setClockNow(now);
    setTimer(current => ({ ...current, date: current.date || todayString(), startedAt: now }));
  };

  const pauseTimer = () => {
    const now = Date.now(); setClockNow(now);
    setTimer(current => ({ ...current, startedAt: null, elapsedSeconds: current.elapsedSeconds + (current.startedAt === null ? 0 : Math.max(0, Math.floor((now - current.startedAt) / 1000))) }));
  };

  const discardTimer = () => {
    if (!window.confirm('Bỏ phiên bấm giờ này? Thời gian chưa được lưu sẽ mất.')) return;
    setTimer(blankTimer);
  };

  const saveLog = async () => {
    const now = Date.now();
    const seconds = timer.elapsedSeconds + (timer.startedAt === null ? 0 : Math.max(0, Math.floor((now - timer.startedAt) / 1000)));
    if (seconds < 30) { onNotice('Hãy bấm giờ ít nhất 30 giây trước khi lưu.'); return; }
    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    setTimer(current => ({ ...current, startedAt: null, elapsedSeconds: seconds }));
    setBusy(true);
    try {
      await api('/study/study-logs', { method: 'POST', body: JSON.stringify({ date: timer.date || todayString(), durationMinutes, courseId: timer.courseId || null, note: timer.note.trim() }) });
      setTimer(blankTimer); setShowLogForm(false); await onRefresh(); onNotice(`Đã lưu ${durationMinutes} phút học vào heatmap.`);
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không lưu được thời gian học. Phiên bấm giờ đã được giữ để thử lại.'); }
    finally { setBusy(false); }
  };

  const deleteLog = async (log: StudyLog) => {
    try { await api(`/study/study-logs/${log.id}`, { method: 'DELETE' }); await onRefresh(); onNotice('Đã xóa bản ghi thời gian học.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Không xóa được bản ghi.'); }
  };

  const sessionForm = (courseId: string) => sessionCourse === courseId && <form className="session-form" onSubmit={event => void saveSession(event)}>
    <label>Ngày trong tuần<select value={sessionDraft.weekday} onChange={event => setSessionDraft({ ...sessionDraft, weekday: event.target.value })}>{weekdayNames.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label>
    <label>Bắt đầu<input type="time" value={sessionDraft.startTime} onChange={event => setSessionDraft({ ...sessionDraft, startTime: event.target.value })} required/></label>
    <label>Kết thúc<input type="time" value={sessionDraft.endTime} onChange={event => setSessionDraft({ ...sessionDraft, endTime: event.target.value })} required/></label>
    <label>Tiết bắt đầu<input type="number" min="1" max="30" value={sessionDraft.periodStart} onChange={event => setSessionDraft({ ...sessionDraft, periodStart: event.target.value })} required/></label>
    <label>Tiết kết thúc<input type="number" min="1" max="30" value={sessionDraft.periodEnd} onChange={event => setSessionDraft({ ...sessionDraft, periodEnd: event.target.value })} required/></label>
    <label>Địa điểm<input value={sessionDraft.location} onChange={event => setSessionDraft({ ...sessionDraft, location: event.target.value })} placeholder="Ví dụ: Cơ sở A" maxLength={120}/></label>
    <label>Phòng học<input value={sessionDraft.room} onChange={event => setSessionDraft({ ...sessionDraft, room: event.target.value })} placeholder="Ví dụ: A203" maxLength={80}/></label>
    <div className="session-form-actions"><button className="primary-button" disabled={busy}><Check size={15}/> {editingSession ? 'Lưu lịch' : 'Thêm lịch'}</button><button className="soft-button" type="button" onClick={() => { setSessionCourse(null); setEditingSession(null); setSessionDraft(blankSession); }}>Hủy</button></div>
  </form>;

  return <>
    <div className="page-heading"><div><div className="eyebrow"><span/> HỌC TẬP CÓ CHỦ ĐÍCH</div><h1>Không gian học tập</h1><p>Quản lý môn học, lịch lên lớp và thời gian tự học.</p></div><div className="study-heading-actions"><button className="soft-button" type="button" onClick={() => setShowLogForm(value => !value)}><Clock3 size={16}/> Ghi thời gian học</button><button className="soft-button" type="button" onClick={() => { setEditingAssignment(null); setAssignmentDraft(emptyAssignment()); setShowAssignmentForm(value => !value); }}><Plus size={16}/> Thêm bài tập</button><button className="primary-button" type="button" onClick={() => { setEditingCourse(null); setCourseDraft(blankCourse); setShowCourseForm(value => !value); }}><Plus size={17}/> Thêm môn học</button></div></div>
    {loading && <div className="loading-bar"><span/></div>}
    <div className="study-summary-grid"><SummaryCard label="Môn đang học" value={String(summary?.activeCourses ?? 0)} detail="Môn học đang hoạt động" icon={<BookOpen size={18}/>} tone="violet"/><SummaryCard label="Bài tập chờ" value={String(summary?.pendingAssignments ?? 0)} detail={`Tổng ${summary?.assignments ?? 0} bài tập`} icon={<CalendarDays size={18}/>} tone="amber"/><SummaryCard label="Giờ học tuần này" value={`${Math.floor(currentWeekMinutes / 60)}h ${currentWeekMinutes % 60}m`} detail="Đã ghi nhận trong tuần này" icon={<Clock3 size={18}/>} tone="blue"/></div>

    {showAssignmentForm && <form className="panel study-editor" onSubmit={event => void saveAssignment(event)}><div className="panel-heading"><div><h3>{editingAssignment ? 'Chỉnh sửa bài tập' : 'Thêm bài tập'}</h3><p>Đặt hạn nộp và mức ưu tiên cho bài tập.</p></div><button className="icon-button" type="button" aria-label="Đóng" onClick={() => { setShowAssignmentForm(false); setEditingAssignment(null); setAssignmentDraft(emptyAssignment()); }}><X size={17}/></button></div><div className="study-form-grid assignment-form-grid"><label>Tên bài tập<input autoFocus value={assignmentDraft.title} onChange={event => setAssignmentDraft({ ...assignmentDraft, title: event.target.value })} required maxLength={200} placeholder="Ví dụ: Nộp báo cáo cuối kỳ"/></label><label>Ngày nộp<input type="date" value={assignmentDraft.deadline} onChange={event => setAssignmentDraft({ ...assignmentDraft, deadline: event.target.value })} required/></label><label>Môn học<select value={assignmentDraft.courseId} onChange={event => setAssignmentDraft({ ...assignmentDraft, courseId: event.target.value })}><option value="">Chưa gắn môn học</option>{courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label>Ưu tiên<select value={assignmentDraft.priority} onChange={event => setAssignmentDraft({ ...assignmentDraft, priority: event.target.value })}><option value="High">Cao</option><option value="Medium">Vừa</option><option value="Low">Thấp</option></select></label></div><div className="study-editor-actions"><button className="primary-button" disabled={busy}>{busy ? 'Đang lưu…' : editingAssignment ? 'Lưu thay đổi' : 'Thêm bài tập'}</button><button className="soft-button" type="button" onClick={() => { setShowAssignmentForm(false); setEditingAssignment(null); }}>Hủy</button></div></form>}

    {showCourseForm && <form className="panel study-editor" onSubmit={event => void saveCourse(event)}><div className="panel-heading"><div><h3>{editingCourse ? 'Chỉnh sửa môn học' : 'Thêm môn học'}</h3><p>Thông tin môn học của bạn.</p></div><button className="icon-button" type="button" aria-label="Đóng" onClick={() => { setShowCourseForm(false); setEditingCourse(null); setCourseDraft(blankCourse); }}><X size={17}/></button></div><div className="study-form-grid"><label>Tên môn học<input autoFocus value={courseDraft.name} onChange={event => setCourseDraft({ ...courseDraft, name: event.target.value })} required maxLength={160} placeholder="Ví dụ: Cơ sở dữ liệu"/></label><label>Mã môn<input value={courseDraft.code} onChange={event => setCourseDraft({ ...courseDraft, code: event.target.value })} maxLength={40} placeholder="Ví dụ: IT301"/></label><label>Học kỳ<input value={courseDraft.semester} onChange={event => setCourseDraft({ ...courseDraft, semester: event.target.value })} maxLength={40} placeholder="Ví dụ: Học kỳ 1"/></label><label>Giảng viên<input value={courseDraft.instructor} onChange={event => setCourseDraft({ ...courseDraft, instructor: event.target.value })} maxLength={120} placeholder="Tên giảng viên"/></label></div><div className="study-editor-actions"><button className="primary-button" disabled={busy}>{busy ? 'Đang lưu…' : editingCourse ? 'Lưu thay đổi' : 'Thêm môn'}</button><button className="soft-button" type="button" onClick={() => { setShowCourseForm(false); setEditingCourse(null); }}>Hủy</button></div></form>}

    {showLogForm && <section className="panel study-editor timer-editor"><div className="panel-heading"><div><h3>Bấm giờ tự học</h3><p>Bắt đầu bộ đếm khi bạn ngồi vào học; dừng lại để lưu vào heatmap.</p></div><button className="icon-button" type="button" aria-label="Đóng" onClick={() => setShowLogForm(false)}><X size={17}/></button></div><div className="study-form-grid timer-meta-grid"><label>Môn học<select disabled={timerActive} value={timer.courseId} onChange={event => setTimer(current => ({ ...current, courseId: event.target.value }))}><option value="">Tự học chung</option>{courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label>Ghi chú<input disabled={timerActive} value={timer.note} onChange={event => setTimer(current => ({ ...current, note: event.target.value }))} maxLength={500} placeholder="Nội dung sẽ học"/></label></div><div className="study-stopwatch"><strong aria-live="off">{timerDisplay}</strong><span>{timer.date ? `Phiên học · ${dateLabel(timer.date)}` : 'Sẵn sàng bắt đầu phiên học'}</span><div className="stopwatch-controls">{timer.startedAt === null ? <button className="primary-button" type="button" onClick={startTimer} disabled={busy}><Play size={16}/>{timerActive ? 'Tiếp tục' : 'Bắt đầu bấm giờ'}</button> : <button className="soft-button" type="button" onClick={pauseTimer} disabled={busy}><Pause size={16}/>Tạm dừng</button>}{timerActive && <><button className="primary-button timer-save-button" type="button" onClick={() => void saveLog()} disabled={busy}><Check size={16}/>{busy ? 'Đang lưu…' : 'Kết thúc & lưu'}</button><button className="icon-button danger-icon" type="button" title="Bỏ phiên" aria-label="Bỏ phiên bấm giờ" onClick={discardTimer} disabled={busy}><RotateCcw size={16}/></button></>}</div></div><p className="timer-hint">Thời gian được lưu theo phút gần nhất. Bạn có thể tạm dừng và tiếp tục sau.</p></section>}

    <section className="panel course-list-panel"><div className="panel-heading"><div><h3>Môn học của bạn</h3><p>Chọn một môn để xem lịch và thao tác chỉnh sửa.</p></div><span className="count-pill">{courses.length} môn</span></div>{courses.length ? <div className="course-list">{courses.map((course, i) => { const courseSessions = sessions.filter(session => session.courseId === course.id).sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)); const isExpanded = expandedCourse === course.id; return <article className={`course-card ${isExpanded ? 'course-card-open' : ''}`} key={course.id}><button className="course-card-summary" type="button" aria-expanded={isExpanded} onClick={() => setExpandedCourse(isExpanded ? null : course.id)}><div className={`course-badge course-${i % 4}`}><BookOpen size={18}/></div><div className="course-card-title"><strong>{course.name}</strong><span>{[course.code, course.semester, course.instructor].filter(Boolean).join(' · ') || 'Chưa có mã môn hoặc giảng viên'}</span><small>{courseSessions.length ? `${courseSessions.length} buổi học` : 'Chưa có lịch học'} · Nhấn để xem chi tiết</small></div><ChevronDown className={`course-expand-icon ${isExpanded ? 'expanded' : ''}`} size={17}/></button>{isExpanded && <div className="course-card-details"><div className="course-card-actions course-detail-actions"><button className="soft-button" type="button" onClick={() => startEditCourse(course)}><Pencil size={14}/> Sửa môn</button><button className="soft-button danger-course-button" type="button" onClick={() => void deleteCourse(course)}><Trash2 size={14}/> Xóa môn</button></div><div className="course-session-list">{courseSessions.length ? courseSessions.map(session => <div className="course-session-row" key={session.id}><div className="session-time"><strong>{weekdayNames[session.weekday - 1]}</strong><span>{session.startTime}–{session.endTime} · Tiết {session.periodStart}{session.periodEnd !== session.periodStart ? `–${session.periodEnd}` : ''}</span></div><span className="session-location"><MapPin size={13}/>{[session.location, session.room].filter(Boolean).join(' · ') || 'Chưa đặt địa điểm/phòng'}</span><div className="course-card-actions"><button className="icon-button" type="button" title="Sửa lịch học" aria-label="Sửa lịch học" onClick={() => beginEditSession(session)}><Pencil size={14}/></button><button className="icon-button danger-icon" type="button" title="Xóa lịch học" aria-label="Xóa lịch học" onClick={() => void deleteSession(session)}><Trash2 size={14}/></button></div></div>) : <div className="course-no-sessions">Chưa có lịch lên lớp.</div>}</div><button className="text-button add-session-button" type="button" onClick={() => { setSessionCourse(course.id); setEditingSession(null); setSessionDraft(blankSession); }}><Plus size={14}/> Thêm buổi học</button>{sessionForm(course.id)}</div>}</article>; })}</div> : <div className="study-empty"><BookOpen size={24}/><strong>Chưa có môn học</strong><span>Thêm môn học đầu tiên để bắt đầu tạo thời khóa biểu.</span></div>}</section>

    <section className="panel timetable-panel"><div className="panel-heading"><div><h3>Thời khóa biểu tuần</h3><p>{sessions.length ? `${sessions.length} buổi học · Thời gian, tiết, địa điểm và phòng học.` : 'Thời gian, tiết, địa điểm và phòng học.'}</p></div>{sessions.length > 0 && <button className="soft-button timetable-expand-button" type="button" aria-expanded={showTimetable} onClick={() => setShowTimetable(value => !value)}><ChevronDown className={showTimetable ? 'expanded' : ''} size={15}/>{showTimetable ? 'Thu gọn' : 'Xem đầy đủ'}</button>}</div>{sessions.length ? <>{!showTimetable && <div className="compact-week-scroll"><div className="compact-week-summary">{weekdayNames.map((day, index) => { const daySessions = sessions.filter(session => session.weekday === index + 1).sort((a, b) => a.startTime.localeCompare(b.startTime)); const firstSession = daySessions[0]; const course = firstSession ? courses.find(item => item.id === firstSession.courseId) : null; return <div className="compact-week-day" key={day}><strong>{weekdayShortNames[index]}</strong>{firstSession ? <><div className="compact-week-entry"><span title={course?.name ?? 'Môn học'}>{course?.name ?? 'Môn học'}</span><small>{firstSession.startTime}–{firstSession.endTime}</small></div>{daySessions.length > 1 && <span className="compact-week-count">+{daySessions.length - 1} buổi</span>}</> : <small className="compact-week-empty">Trống</small>}</div>; })}</div></div>}{showTimetable && <div className="timetable-scroll"><div className="weekly-timetable"><div className="timetable-corner">Giờ</div>{weekdayNames.map(day => <div className="timetable-day-heading" key={day}>{day}</div>)}<div className="timetable-times">{Array.from({ length: 16 }, (_, i) => <span key={i}>{`${String(i + 6).padStart(2, '0')}:00`}</span>)}</div>{weekdayNames.map((day, index) => <div className="timetable-day" key={day}>{sessions.filter(session => session.weekday === index + 1).map(session => { const top = Math.max(0, (minutesOf(session.startTime) - 360) * 0.8); const height = Math.max(28, (minutesOf(session.endTime) - minutesOf(session.startTime)) * 0.8); const course = courses.find(item => item.id === session.courseId); return <div className={`timetable-session timetable-tone-${courses.findIndex(item => item.id === session.courseId) % 4}`} key={session.id} style={{ top, height }} title={`${course?.name ?? 'Môn học'} · ${session.startTime}–${session.endTime}`}><strong>{course?.name ?? 'Môn học'}</strong><span>{session.startTime}–{session.endTime}</span><small>Tiết {session.periodStart}–{session.periodEnd}</small>{(session.room || session.location) && <small>{[session.room, session.location].filter(Boolean).join(' · ')}</small>}</div>; })}</div>)}</div></div>}</> : <div className="study-empty compact"><CalendarDays size={22}/><span>Thêm lịch học vào môn học để xem thời khóa biểu.</span></div>}</section>

    <section className="panel heatmap-panel"><div className="panel-heading"><div><h3>Thời gian tự học trong tuần</h3><p>{Math.floor(currentWeekMinutes / 60)} giờ {currentWeekMinutes % 60} phút đã ghi nhận</p></div><div className="week-controls"><button className="icon-button" type="button" title="Tuần trước" aria-label="Tuần trước" onClick={() => setWeekOffset(value => value - 1)}><ArrowLeft size={16}/></button><span>{weekOffset === 0 ? 'Tuần này' : weekOffset === -1 ? 'Tuần trước' : `${dateLabel(weekDays[0].iso)} – ${dateLabel(weekDays[6].iso)}`}</span><button className="icon-button" type="button" title="Tuần sau" aria-label="Tuần sau" onClick={() => setWeekOffset(value => value + 1)} disabled={weekOffset >= 0}><ArrowRight size={16}/></button></div></div><div className="weekly-heatmap">{weekDays.map(day => { const minutes = minutesByDate[day.iso] ?? 0; const intensity = minutes === 0 ? 0 : minutes < 60 ? 1 : minutes < 120 ? 2 : minutes < 240 ? 3 : 4; return <div className={`heatmap-day heatmap-level-${intensity}`} key={day.iso}><span>{day.name}</span><strong>{minutes ? `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} giờ` : '—'}</strong><small>{dateLabel(day.iso)}</small></div>; })}</div><div className="heatmap-legend"><span>Ít</span>{[0, 1, 2, 3, 4].map(level => <i className={`heatmap-swatch heatmap-level-${level}`} key={level}/ >)}<span>Nhiều</span></div>{showLogForm === false && <button className="text-button log-entry-link" type="button" onClick={() => setShowLogForm(true)}><Plus size={14}/> Ghi thời gian học</button>}{logs.filter(log => weekDays.some(day => day.iso === log.date)).length > 0 && <div className="study-log-list">{logs.filter(log => weekDays.some(day => day.iso === log.date)).sort((a, b) => b.date.localeCompare(a.date)).map(log => <div className="study-log-row" key={log.id}><span>{dateLabel(log.date)}</span><strong>{courses.find(course => course.id === log.courseId)?.name ?? 'Tự học chung'}</strong><span>{Math.floor(log.durationMinutes / 60) ? `${Math.floor(log.durationMinutes / 60)} giờ ` : ''}{log.durationMinutes % 60 ? `${log.durationMinutes % 60} phút` : ''}</span>{log.note && <small>{log.note}</small>}<button className="icon-button danger-icon" type="button" title="Xóa bản ghi" aria-label="Xóa bản ghi thời gian học" onClick={() => void deleteLog(log)}><Trash2 size={14}/></button></div>)}</div>}</section>

    <section className="panel assignment-panel"><div className="panel-heading"><div><h3>Bài tập</h3><p>Quản lý hạn nộp và theo dõi tiến độ hoàn thành.</p></div><span className="count-pill">{assignments.filter(item => item.status !== 'Completed').length} chờ</span></div>{assignments.length ? <div className="task-list">{[...assignments].sort((a, b) => a.deadline.localeCompare(b.deadline)).map(item => <AssignmentRow key={item.id} item={item} courses={courses} onToggle={() => void toggleAssignment(item)} onEdit={() => startEditAssignment(item)} onDelete={() => void deleteAssignment(item)}/>)}</div> : <div className="study-empty compact"><span>Chưa có bài tập nào. Thêm bài tập đầu tiên để theo dõi hạn nộp.</span></div>}</section>
  </>;
}

function SummaryCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: string }) {
  return <div className="study-stat-card"><div className={`study-stat-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function AssignmentRow({ item, courses, onToggle, onEdit, onDelete }: { item: Assignment; courses: Course[]; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const course = courses.find(row => row.id === item.courseId);
  const done = item.status === 'Completed';
  const remaining = daysUntil(item.deadline);
  const state = done ? 'Hoàn thành' : remaining < 0 ? `Trễ ${Math.abs(remaining)} ngày` : remaining === 0 ? 'Đến hạn hôm nay' : remaining === 1 ? 'Còn 1 ngày' : `Còn ${remaining} ngày`;
  return <div className={`project-task ${done ? 'project-task-done' : ''}`}><button className="task-check" type="button" aria-label={done ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'} onClick={onToggle}>{done ? <CheckCircle2 size={18}/> : <Circle size={18}/>}</button><div className="task-copy"><strong>{item.title}</strong><span><i className={`priority-dot priority-${item.priority.toLowerCase()}`}/>{course?.name ?? 'Chưa gắn môn'} · {item.priority === 'High' ? 'Ưu tiên cao' : item.priority === 'Low' ? 'Ưu tiên thấp' : 'Ưu tiên vừa'} · Nộp {formatDeadline(item.deadline)}</span></div><span className={`task-due-state ${!done && remaining < 0 ? 'overdue' : !done && remaining === 1 ? 'due-soon' : ''}`}>{state}</span><button className="icon-button" type="button" title="Sửa bài tập" aria-label={`Sửa bài tập ${item.title}`} onClick={onEdit}><Pencil size={15}/></button><button className="icon-button task-delete" type="button" title="Xóa bài tập" aria-label={`Xóa bài tập ${item.title}`} onClick={onDelete}><Trash2 size={15}/></button></div>;
}
