import { useId, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Project, ProjectTask } from './api';
import { dateLabel, localDate } from './studyPlanning';
import { dateOf, shiftDate } from './taskCalendar';

export default function ProjectWorkProgress({ projects, tasksByProject, onOpenTask, today, mode = 'progress' }: {
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  onOpenTask: (projectId: string, taskId: string) => void;
  today: string;
  mode?: 'progress' | 'deadlines';
}) {
  const fieldId = useId();
  const [filter, setFilter] = useState('all');
  const [projectId, setProjectId] = useState('');
  const deadlineMode = mode === 'deadlines';
  const nextWeek = localDate(shiftDate(dateOf(today), 7));
  const scopedProject = projects.some((project) => project.id === projectId) ? projectId : '';
  const items = projects.flatMap((project) => (tasksByProject[project.id] ?? []).map((task) => {
    const done = task.isDone || task.status === 'done';
    const overdue = !done && Boolean(task.dueDate && task.dueDate < today);
    const soon = !done && Boolean(task.dueDate && task.dueDate >= today && task.dueDate <= nextWeek);
    return { project, task, done, overdue, soon };
  }));
  const visible = items.filter(({ project, done, overdue, soon }) => {
    if (scopedProject && project.id !== scopedProject) return false;
    if (filter === 'open') return !done;
    if (filter === 'overdue') return overdue;
    if (filter === 'soon') return soon;
    if (filter === 'done') return done;
    return true;
  }).sort((a, b) => Number(a.done) - Number(b.done) ||
    (a.done && b.done ? (b.task.completedAt ?? '').localeCompare(a.task.completedAt ?? '') :
      (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999')));

  return (
    <section className="panel planning-panel">
      <h2>{deadlineMode ? 'Task của các dự án' : 'Tiến độ công việc'}</h2>
      {!deadlineMode && <p>{items.filter((item) => item.done).length}/{items.length} công việc đã hoàn thành.</p>}
      <div className="planning-form">
        <div className="planning-field">
          <label htmlFor={`${fieldId}-project`}>Dự án</label>
          <select id={`${fieldId}-project`} value={scopedProject} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Tất cả dự án</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </div>
        <div className="planning-field">
          <label htmlFor={`${fieldId}-status`}>{deadlineMode ? 'Lọc task' : 'Trạng thái'}</label>
          <select id={`${fieldId}-status`} value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            {deadlineMode && <option value="soon">Sắp đến hạn (7 ngày)</option>}
            <option value="overdue">Quá hạn</option><option value="open">Chưa hoàn thành</option><option value="done">Hoàn thành</option>
          </select>
        </div>
      </div>
      {visible.length === 0 ? <p>{items.length ? 'Không có công việc trong bộ lọc này.' : 'Chưa có task trong các dự án.'}</p> : (
        <ul className="planning-list">
          {visible.map(({ project, task, done, overdue, soon }) => (
            <li className="planning-row" key={task.id}>
              <div>
                <button type="button" className="planning-open" onClick={() => onOpenTask(project.id, task.id)}>{task.title} <ArrowUpRight size={14} /></button>
                <p>{project.title} · {task.dueDate ? <>Hạn <time dateTime={task.dueDate}>{dateLabel(task.dueDate)}
                  {task.dueDate.slice(0, 4) !== today.slice(0, 4) && `/${task.dueDate.slice(0, 4)}`}</time></> : 'Chưa đặt hạn'}</p>
                {!deadlineMode && <p>
                  {done ? task.completedAt
                    ? `Xong lúc ${new Date(task.completedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`
                    : 'Chưa ghi thời điểm hoàn thành'
                    : 'Đang theo dõi'}
                </p>}
              </div>
              <span className="planning-pill" data-due={deadlineMode && (overdue ? 'overdue' : soon ? 'soon' : undefined) || undefined}>
                {done ? 'Hoàn thành' : overdue ? 'Quá hạn' : deadlineMode && soon
                  ? task.dueDate === today ? 'Đến hạn hôm nay' : 'Sắp đến hạn'
                  : task.status === 'in-progress' ? 'Đang làm' : 'Chưa bắt đầu'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
