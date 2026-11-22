import { useState, type FormEvent } from 'react';
import { api, type ProjectTask } from './api';
import { CalendarDialog } from './CalendarEditors';

function createsCycle(tasks: ProjectTask[], editingId: string, dependencies: string[]) {
  const byId = new Map(tasks.map((task) => [task.id, task.dependencies ?? []]));
  const seen = new Set<string>();
  const pending = [...dependencies];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === editingId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(byId.get(id) ?? []));
  }
  return false;
}

export default function ProjectTaskEditor({ projectId, task, tasks, onClose, onSaved }: {
  projectId: string;
  task?: ProjectTask;
  tasks: ProjectTask[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'Medium');
  const [status, setStatus] = useState(task?.isDone ? 'done' : task?.status || 'todo');
  const [dependencies, setDependencies] = useState(task?.dependencies ?? []);
  const [isMilestone, setIsMilestone] = useState(Boolean(task?.isMilestone || task?.durationDays === 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const candidates = tasks.filter((item) => item.id !== task?.id);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !title.trim()) return;
    const selected = candidates.filter((item) => dependencies.includes(item.id)).map((item) => item.id);
    if (task && createsCycle(tasks, task.id, selected)) {
      setError('Các task đang phụ thuộc lẫn nhau. Hãy đổi mục phụ thuộc.');
      return;
    }
    const payload = {
      title: title.trim(), dueDate: dueDate || null, priority, status, isDone: status === 'done',
      dependencies: selected, isMilestone,
      ...(isMilestone ? { durationDays: 0, ...(task ? {} : { baselineDuration: 0 }) }
        : task?.durationDays === 0 ? { durationDays: 1 } : {}),
    };
    setSaving(true);
    setError('');
    try {
      await api(`/projects/${projectId}/tasks${task ? `/${task.id}` : ''}`, {
        method: task ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được task.');
      setSaving(false);
      return;
    }
    onSaved();
  };

  return <CalendarDialog title={task ? 'Sửa task' : 'Thêm task'} busy={saving} onClose={onClose}>
    <form className="project-task-editor" onSubmit={(event) => void save(event)}>
      <fieldset disabled={saving} className="project-task-fields">
        <label className="planning-field project-task-name">Tên task
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus required maxLength={200} />
        </label>
        <label className="planning-field">Ngày nộp
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label className="planning-field">Ưu tiên
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="Low">Thấp</option><option value="Medium">Vừa</option><option value="High">Cao</option>
          </select>
        </label>
        <label className="planning-field">Trạng thái
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="todo">Chưa làm</option><option value="in-progress">Đang làm</option><option value="done">Hoàn thành</option>
          </select>
        </label>
      </fieldset>
      <details className="project-task-options" open={dependencies.length > 0 || undefined}>
        <summary>Phụ thuộc task cùng dự án{dependencies.length ? ` (${dependencies.length})` : ''}</summary>
        {candidates.length ? <div className="project-dependencies">
          {candidates.map((item) => {
            const checked = dependencies.includes(item.id);
            const blocked = Boolean(task && !checked && createsCycle(tasks, task.id, [...dependencies, item.id]));
            return <label key={item.id}>
              <input type="checkbox" checked={checked} disabled={saving || blocked} onChange={() => {
                setDependencies((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id]);
              }} /> {item.title}{blocked && ' (tạo vòng lặp)'}
            </label>;
          })}
        </div> : <p>Chưa có task khác trong dự án này.</p>}
      </details>
      <label className="project-milestone">
        <input type="checkbox" checked={isMilestone} disabled={saving} onChange={(event) => setIsMilestone(event.target.checked)} /> Là cột mốc
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="planning-actions">
        <button className="primary-button" disabled={saving || !title.trim()}>{task ? 'Lưu' : 'Tạo task'}</button>
        <button type="button" className="soft-button" onClick={onClose} disabled={saving}>Hủy</button>
      </div>
    </form>
  </CalendarDialog>;
}
