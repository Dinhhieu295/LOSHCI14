import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Briefcase, CheckCircle2, Circle, ClipboardList, FolderKanban, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { api, type NoticeHandler, type Project, type ProjectTask, type TaskCategory } from './api';
import ProjectWorkProgress from './ProjectWorkProgress';
import { dateLabel, localDate, timeLabel, weekdays } from './studyPlanning';
import { dateOf, durationMinutes, undone, weekdayOf, workCategoryLabels } from './taskCalendar';
import './planning.css';

export type WorkView = TaskCategory | 'projects';

type TaskInput = Pick<ProjectTask, 'title' | 'dueDate' | 'estimate' | 'priority' | 'fixedSlot'> & { category: TaskCategory };

type Props = {
  view: WorkView;
  activeTaskId: string | null;
  personalTasks: ProjectTask[];
  setPersonalTasks: Dispatch<SetStateAction<ProjectTask[]>>;
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  onViewChange: (view: WorkView) => void;
  onSelectTask: (id: string | null) => void;
  onOpenProjectTask: (projectId: string, taskId: string) => void;
  onNotice: NoticeHandler;
};

export default function WorkPage({ view, activeTaskId, personalTasks, setPersonalTasks, projects, tasksByProject,
  onViewChange, onSelectTask, onOpenProjectTask, onNotice }: Props) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const category = view === 'employment' ? 'employment' : 'personal';
  const weekly = category === 'employment';
  const groupTasks = personalTasks.filter((task) => (task.category ?? 'personal') === category);
  const selected = groupTasks.find((task) => task.id === activeTaskId);
  const today = localDate(new Date());
  const rows = groupTasks.filter((task) => (filter === 'all' || (filter === 'open' ? undone(task) : !undone(task))) &&
    (weekly || typeFilter === 'all' || Boolean(task.fixedSlot) === (typeFilter === 'fixed')))
    .sort((a, b) => Number(undone(b)) - Number(undone(a)) ||
      (a.fixedSlot?.date ?? a.dueDate ?? '9999').localeCompare(b.fixedSlot?.date ?? b.dueDate ?? '9999') ||
      a.title.localeCompare(b.title, 'vi'));

  const run = async (message: string, operation: () => Promise<void>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
      onNotice(message);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được thay đổi. Hãy thử lại.');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const commit = async (input: Partial<TaskInput & Pick<ProjectTask, 'isDone'>>, id?: string) => {
    const saved = await api<ProjectTask>(id ? `/tasks/${id}` : '/tasks', {
      method: id ? 'PATCH' : 'POST', body: JSON.stringify(input),
    });
    setPersonalTasks((items) => id ? items.map((task) => task.id === id ? saved : task) : [...items, saved]);
  };
  const closeEditor = () => {
    setCreating(false);
    onSelectTask(null);
    setError('');
  };
  const changeView = (nextView: WorkView) => {
    setCreating(false);
    setFilter('all');
    setTypeFilter('all');
    setError('');
    onViewChange(nextView);
  };
  const save = async (input: TaskInput) => {
    if (await run(selected ? 'Đã cập nhật công việc.' : 'Đã thêm công việc.', () => commit(input, selected?.id))) {
      setFilter('all');
      setTypeFilter('all');
      if (input.category === category) closeEditor();
      else changeView(input.category);
    }
  };
  const remove = async (task: ProjectTask) => {
    if (!window.confirm(`Xóa công việc “${task.title}” và các phiên đã xếp cho việc này?`)) return;
    if (await run('Đã xóa công việc.', async () => {
      await api<void>(`/tasks/${task.id}`, { method: 'DELETE' });
      setPersonalTasks((items) => items.filter((item) => item.id !== task.id));
    }) && task.id === activeTaskId) closeEditor();
  };

  return (
    <div className="planning-page">
      <header className="planning-heading">
        <h1>Công việc</h1>
        <p>Theo dõi việc làm, việc cá nhân và việc dự án.</p>
      </header>
      <nav className="planning-nav" aria-label="Mục công việc">
        <button type="button" aria-pressed={view === 'employment'} onClick={() => changeView('employment')}>
          <Briefcase size={16} /> {workCategoryLabels.employment}
        </button>
        <button type="button" aria-pressed={view === 'personal'} onClick={() => changeView('personal')}>
          <ClipboardList size={16} /> {workCategoryLabels.personal}
        </button>
        <button type="button" aria-pressed={view === 'projects'} onClick={() => changeView('projects')}>
          <FolderKanban size={16} /> Việc dự án
        </button>
      </nav>
      {view === 'projects' ? (
        <ProjectWorkProgress projects={projects} tasksByProject={tasksByProject} onOpenTask={onOpenProjectTask} today={today} />
      ) : (
        <>
          {(creating || selected) && <PersonalTaskForm key={selected?.id ?? category}
            task={selected} initialCategory={category} busy={busy} onSave={save} onClose={closeEditor} />}
          {error && <p className="form-error" role="alert">{error}</p>}
          <section className="panel planning-panel">
            <div className="planning-section-head">
              <div><h2>{workCategoryLabels[category]}</h2><p>{weekly
                ? `${groupTasks.filter((task) => task.fixedSlot && undone(task)).length} lịch hằng tuần đang hoạt động`
                : `${groupTasks.filter(undone).length} việc chưa hoàn thành`}</p></div>
              {!creating && !selected && <button className="primary-button" onClick={() => { setError(''); setCreating(true); }}>
                <Plus size={16} /> Thêm công việc
              </button>}
            </div>
            {activeTaskId && !selected && !creating && <p role="status">Công việc này đã bị xóa hoặc không còn tồn tại.</p>}
            {groupTasks.length > 0 && <div className="planning-form">
              {!weekly && <div className="planning-field">
                <label htmlFor="work-personal-type">Lọc theo cách xếp giờ</label>
                <select id="work-personal-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">Tất cả</option><option value="fixed">Giờ cố định</option><option value="flexible">Linh hoạt</option>
                </select>
              </div>}
              <div className="planning-field">
                <label htmlFor="work-personal-filter">Trạng thái</label>
                <select id="work-personal-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">Tất cả</option><option value="open">{weekly ? 'Đang hoạt động' : 'Chưa hoàn thành'}</option>
                  <option value="done">{weekly ? 'Đã tạm dừng' : 'Đã hoàn thành'}</option>
                </select>
              </div>
            </div>}
            {rows.length === 0 ? (
              <p>{groupTasks.length ? 'Không có việc trong bộ lọc này.' : category === 'employment'
                ? 'Thêm lịch đi dạy hoặc ca làm thêm lặp hằng tuần.'
                : 'Thêm một việc như dự sinh nhật hoặc đi du lịch.'}</p>
            ) : <ul className="planning-list">
              {rows.map((task) => {
                const active = undone(task);
                const action = weekly ? (active ? 'Tạm dừng' : 'Tiếp tục') : (active ? 'Hoàn thành' : 'Mở lại');
                const StatusIcon = weekly ? (active ? Pause : Play) : (active ? Circle : CheckCircle2);
                return (
                  <li className="planning-row" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      {task.fixedSlot ? (
                        <p>{weekly ? `Hằng tuần · ${weekdays[weekdayOf(dateOf(task.fixedSlot.date)) - 1]}` : `Một lần · ${dateLabel(task.fixedSlot.date)}`}
                          {` · ${timeLabel(task.fixedSlot.start)}–${timeLabel(task.fixedSlot.end)}`}</p>
                      ) : weekly ? <p>Chưa đặt lịch hằng tuần</p> : <p>Linh hoạt · {task.dueDate ? `Hạn ${dateLabel(task.dueDate)}` : 'Chưa đặt hạn'}
                        {task.dueDate && task.dueDate < today && active ? ' · Quá hạn' : ''}</p>}
                      {!active && <p>{weekly ? 'Đã tạm dừng' : 'Đã hoàn thành'}</p>}
                    </div>
                    <div className="planning-actions">
                      {(!weekly || task.fixedSlot) && <button type="button" className="icon-button" disabled={busy}
                        aria-label={`${action} ${task.title}`} title={action}
                        onClick={() => void run(weekly ? `Đã ${action.toLowerCase()} lịch hằng tuần.` : `Đã ${action.toLowerCase()} công việc.`,
                          () => commit({ isDone: active }, task.id))}>
                        <StatusIcon size={18} />
                      </button>}
                      <button type="button" className="icon-button" disabled={busy} aria-label={`Sửa ${task.title}`}
                        onClick={() => { setCreating(false); setError(''); onSelectTask(task.id); }}><Pencil size={16} /></button>
                      <button type="button" className="icon-button" disabled={busy} aria-label={`Xóa ${task.title}`} onClick={() => void remove(task)}><Trash2 size={16} /></button>
                    </div>
                  </li>
                );
              })}
            </ul>}
          </section>
        </>
      )}
    </div>
  );
}

function PersonalTaskForm({ task, initialCategory, busy, onSave, onClose }: {
  task?: ProjectTask;
  initialCategory: TaskCategory;
  busy: boolean;
  onSave: (input: TaskInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [category, setCategory] = useState(task?.category ?? initialCategory);
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [kind, setKind] = useState<'flexible' | 'fixed'>(task?.fixedSlot ? 'fixed' : 'flexible');
  const [date, setDate] = useState(task?.fixedSlot?.date ?? task?.dueDate ?? localDate(new Date()));
  const [start, setStart] = useState(task?.fixedSlot ? timeLabel(task.fixedSlot.start) : '09:00');
  const [end, setEnd] = useState(task?.fixedSlot ? timeLabel(task.fixedSlot.end % 1440) : '10:00');
  const [length, setLength] = useState(String((task && durationMinutes(task.estimate)) || 60));
  const [priority, setPriority] = useState(task?.priority ?? 'Medium');
  const [timeError, setTimeError] = useState('');
  const weekly = category === 'employment';
  const withTime = weekly || kind === 'fixed';
  const weekday = date ? weekdays[weekdayOf(dateOf(date)) - 1]?.toLowerCase() : undefined;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const startMinute = minutes(start);
    const endMinute = minutes(end);
    const fixedSlot = withTime ? {
      date, start: startMinute, end: endMinute === 0 && startMinute > 0 ? 1440 : endMinute,
    } : null;
    if (fixedSlot && (!date || !start || !end || fixedSlot.end - fixedSlot.start < 15)) {
      setTimeError('Giờ kết thúc phải sau giờ bắt đầu ít nhất 15 phút.');
      return;
    }
    setTimeError('');
    void onSave({ title: title.trim(), category, dueDate: dueDate || null,
      estimate: `${fixedSlot ? fixedSlot.end - fixedSlot.start : Number(length) || 60}m`, priority, fixedSlot });
  };
  return (
    <form className="panel planning-panel" onSubmit={submit}>
      <h2>{task ? 'Sửa công việc' : 'Thêm công việc'}</h2>
      <div className="planning-form">
        <label className="planning-field">Tên công việc
          <input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)}
            placeholder={category === 'employment' ? 'Ví dụ: Đi dạy gia sư' : 'Ví dụ: Dự sinh nhật bạn'} />
        </label>
        <label className="planning-field">Nhóm công việc
          <select aria-label="Nhóm công việc" value={category} onChange={(event) => setCategory(event.target.value === 'employment' ? 'employment' : 'personal')}>
            <option value="employment">{workCategoryLabels.employment}</option><option value="personal">{workCategoryLabels.personal}</option>
          </select>
        </label>
        {!weekly && <div className="planning-field">
          <label htmlFor="personal-task-kind">Cách xếp giờ</label>
          <select id="personal-task-kind" value={kind} onChange={(event) => {
            setKind(event.target.value === 'fixed' ? 'fixed' : 'flexible');
            setTimeError('');
          }}>
            <option value="flexible">Linh hoạt</option><option value="fixed">Giờ cố định</option>
          </select>
        </div>}
      </div>
      {withTime ? (
        <div className="planning-form">
          <label className="planning-field">{weekly ? 'Ngày bắt đầu' : 'Ngày thực hiện'}<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="planning-field">Giờ bắt đầu<input type="time" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="planning-field">Giờ kết thúc<input type="time" required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
      ) : <label className="planning-field planning-semester">Hạn chót (tùy chọn)
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </label>}
      <p>{weekly ? (weekday ? `Lặp vào ${weekday} hằng tuần kể từ ngày bắt đầu.` : 'Lặp hằng tuần kể từ ngày bắt đầu.')
        : withTime ? 'Việc sẽ hiện một lần trên Lịch trình vào ngày giờ đã chọn.' : 'Việc sẽ vào hàng đợi để bạn chọn giờ sau.'}</p>
      {timeError && <p className="form-error" role="alert">{timeError}</p>}
      <details className="planning-scale">
        <summary>{withTime ? 'Hạn chót và ưu tiên' : 'Thời lượng và ưu tiên'}</summary>
        <div className="planning-form">
          {withTime ? <label className="planning-field">Hạn chót (tùy chọn)
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label> : <label className="planning-field">Thời lượng (phút)
            <input type="number" value={length} min="15" max="1440" onChange={(event) => setLength(event.target.value)} />
          </label>}
          <div className="planning-field"><label htmlFor="personal-task-priority">Ưu tiên</label>
            <select id="personal-task-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="Low">Thấp</option><option value="Medium">Vừa</option><option value="High">Cao</option>
            </select>
          </div>
        </div>
      </details>
      <div className="planning-actions">
        <button className="primary-button" disabled={busy || !title.trim()}>{task ? 'Lưu thay đổi' : 'Thêm công việc'}</button>
        <button className="soft-button" type="button" disabled={busy} onClick={onClose}>Hủy</button>
      </div>
    </form>
  );
}
