import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Project, ProjectTask } from './api';
import { dateLabel } from './studyPlanning';

export default function ProjectWorkProgress({ projects, tasksByProject, onOpenTask, today }: {
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  onOpenTask: (projectId: string, taskId: string) => void;
  today: string;
}) {
  const [filter, setFilter] = useState('all');
  const [projectId, setProjectId] = useState('');
  const scopedProject = projects.some((project) => project.id === projectId) ? projectId : '';
  const items = projects.flatMap((project) => (tasksByProject[project.id] ?? []).map((task) => ({
    project, task, done: task.isDone || task.status === 'done',
  })));
  const visible = items.filter(({ project, task, done }) =>
    (!scopedProject || project.id === scopedProject) &&
    (filter === 'all' || (filter === 'done' ? done : !done && (filter === 'open' || Boolean(task.dueDate && task.dueDate < today)))),
  ).sort((a, b) => Number(a.done) - Number(b.done) ||
    (a.done && b.done ? (b.task.completedAt ?? '').localeCompare(a.task.completedAt ?? '') :
      (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999')));

  return (
    <section className="panel planning-panel">
      <h2>Tiến độ công việc</h2>
      <p>{items.filter((item) => item.done).length}/{items.length} công việc đã hoàn thành.</p>
      <div className="planning-form">
        <div className="planning-field">
          <label htmlFor="work-project">Dự án</label>
          <select id="work-project" value={scopedProject} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Tất cả dự án</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </div>
        <div className="planning-field">
          <label htmlFor="work-status">Trạng thái</label>
          <select id="work-status" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Tất cả</option><option value="open">Chưa hoàn thành</option>
            <option value="overdue">Quá hạn</option><option value="done">Hoàn thành</option>
          </select>
        </div>
      </div>
      {visible.length === 0 ? <p>Không có công việc trong bộ lọc này.</p> : (
        <ul className="planning-list">
          {visible.map(({ project, task, done }) => (
            <li className="planning-row" key={task.id}>
              <div>
                <button type="button" className="planning-open" onClick={() => onOpenTask(project.id, task.id)}>{task.title} <ArrowUpRight size={14} /></button>
                <p>{project.title} · {task.dueDate ? `Hạn ${dateLabel(task.dueDate)}` : 'Chưa đặt hạn'}</p>
                <p>
                  {task.subtasksTotal > 0 && `${task.subtasksDone}/${task.subtasksTotal} bước · `}
                  {done ? task.completedAt
                    ? `Xong lúc ${new Date(task.completedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`
                    : 'Chưa ghi thời điểm hoàn thành'
                    : 'Đang theo dõi'}
                  {task.actual && task.actual !== '0h' && ` · Thực tế ${task.actual}`}
                </p>
              </div>
              <span className="planning-pill">{done ? 'Hoàn thành' : task.dueDate && task.dueDate < today ? 'Quá hạn' : task.status === 'in-progress' ? 'Đang làm' : 'Chưa bắt đầu'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
