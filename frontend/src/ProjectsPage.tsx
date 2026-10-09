import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bell, BellOff, BellRing, CalendarDays, CheckCircle2, ChevronDown, Circle, FolderKanban, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, type Project, type ProjectTask } from './api';
import type { SearchTarget } from './GlobalSearch';

type Props = { projects: Project[]; loading: boolean; refresh: () => Promise<void>; onNotice: (message: string) => void; openTarget: SearchTarget | null; onTargetOpened: () => void; remindersEnabled: boolean; onToggleReminders: (enabled: boolean) => void };
type Draft = { title: string; dueDate: string; priority: string };
const emptyDraft: Draft = { title: '', dueDate: '', priority: 'Medium' };
const reminderKey = (task: ProjectTask) => `lifeos:deadline-reminder:${task.id}:${task.dueDate}`;

function daysUntil(value: string) {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const now = new Date();
  return Math.round((Date.UTC(parts[0], parts[1] - 1, parts[2]) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}

function formatDate(value: string | null) {
  if (!value) return 'Chưa đặt ngày nộp';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day));
}

export default function ProjectsPage({ projects, loading, refresh, onNotice, openTarget, onTargetOpened, remindersEnabled, onToggleReminders }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [tasksByProject, setTasksByProject] = useState<Record<string, ProjectTask[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => 'Notification' in window ? Notification.permission : 'unsupported');

  const reloadTasks = useCallback(async () => {
    if (!projects.length) { setTasksByProject({}); return; }
    try {
      const rows = await Promise.all(projects.map(async project => [project.id, await api<ProjectTask[]>(`/projects/${project.id}/tasks`)] as const));
      setTasksByProject(Object.fromEntries(rows));
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không tải được danh sách task.'); }
  }, [projects, onNotice]);
  useEffect(() => { void reloadTasks(); }, [reloadTasks]);
  useEffect(() => {
    if (!openTarget) return;
    setExpanded(openTarget.projectId);
    if (openTarget.taskId) setHighlightedTaskId(openTarget.taskId);
    const targetTasks = tasksByProject[openTarget.projectId] ?? [];
    if (openTarget.taskId && !targetTasks.some(task => task.id === openTarget.taskId)) return;
    const timer = window.setTimeout(() => {
      const elementId = openTarget.taskId ? `task-${openTarget.taskId}` : `project-${openTarget.projectId}`;
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onTargetOpened();
    }, 180);
    const highlightTimer = window.setTimeout(() => setHighlightedTaskId(null), 4500);
    return () => { window.clearTimeout(timer); window.clearTimeout(highlightTimer); };
  }, [openTarget, tasksByProject, onTargetOpened]);

  const createProject = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await api('/projects', { method: 'POST', body: JSON.stringify({ title, description }) }); setTitle(''); setDescription(''); setShowForm(false); await refresh(); onNotice('Đã tạo dự án mới.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Không tạo được dự án.'); }
    finally { setBusy(false); }
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Xóa dự án “${project.title}” cùng toàn bộ task bên trong?`)) return;
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      for (const task of tasksByProject[project.id] ?? []) localStorage.removeItem(reminderKey(task));
      await refresh();
      onNotice('Đã xóa dự án.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không xóa được dự án.'); }
  };

  const enableReminders = async () => {
    if (!('Notification' in window)) { setPermission('unsupported'); onNotice('Trình duyệt này chưa hỗ trợ thông báo ngoài trình duyệt; nhắc hạn trong LifeOS đã bật.'); return; }
    const result = await Notification.requestPermission(); setPermission(result);
    onNotice(result === 'granted' ? 'Đã bật nhắc hạn. LifeOS nhắc trước hạn một ngày khi ứng dụng đang mở.' : 'Nhắc hạn trong LifeOS đã bật; bạn chưa cấp quyền thông báo ngoài trình duyệt.');
  };

  const toggleReminders = () => {
    const enabled = !remindersEnabled;
    onToggleReminders(enabled);
    if (enabled) void enableReminders();
    else onNotice('Đã tắt nhắc hạn.');
  };

  const addTask = async (projectId: string, event: FormEvent) => {
    event.preventDefault(); if (!draft.title.trim()) return; setBusy(true);
    try {
      await api(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify({ title: draft.title.trim(), dueDate: draft.dueDate || null, priority: draft.priority, status: 'todo', isDone: false }) });
      setDraft(emptyDraft); await reloadTasks(); onNotice('Đã thêm task vào dự án.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không thêm được task.'); }
    finally { setBusy(false); }
  };

  const toggleTask = async (projectId: string, task: ProjectTask) => {
    const isDone = !(task.isDone || task.status === 'done');
    try {
      await api(`/projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ isDone, status: isDone ? 'done' : 'todo', dueDate: task.dueDate }) });
      if (!isDone) localStorage.removeItem(reminderKey(task));
      await reloadTasks();
    }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Không cập nhật được task.'); }
  };

  const saveTask = async (projectId: string, event: FormEvent) => {
    event.preventDefault(); if (!editing || !draft.title.trim()) return;
    try {
      await api(`/projects/${projectId}/tasks/${editing}`, { method: 'PATCH', body: JSON.stringify({ title: draft.title.trim(), dueDate: draft.dueDate || null, priority: draft.priority }) });
      const previousTask = tasksByProject[projectId]?.find(task => task.id === editing);
      if (previousTask) localStorage.removeItem(reminderKey(previousTask));
      setEditing(null); setDraft(emptyDraft); await reloadTasks(); onNotice('Đã cập nhật task.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Không cập nhật được task.'); }
  };

  const deleteTask = async (projectId: string, task: ProjectTask) => {
    try { await api(`/projects/${projectId}/tasks/${task.id}`, { method: 'DELETE' }); localStorage.removeItem(reminderKey(task)); await reloadTasks(); onNotice('Đã xóa task.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Không xóa được task.'); }
  };

  return <>
    <div className="page-heading"><div><div className="eyebrow"><span/> LẬP KẾ HOẠCH</div><h1>Dự án của bạn</h1><p>Chia mục tiêu lớn thành những bước nhỏ có thể hoàn thành.</p></div><div className="project-page-actions"><button className="soft-button" type="button" title={remindersEnabled ? 'Tắt nhắc hạn task' : 'Bật nhắc hạn task'} aria-label={remindersEnabled ? 'Tắt nhắc hạn task' : 'Bật nhắc hạn task'} aria-pressed={remindersEnabled} onClick={toggleReminders}>{remindersEnabled ? (permission === 'granted' ? <BellRing size={16}/> : <BellOff size={16}/>) : <Bell size={16}/>} {remindersEnabled ? 'Tắt nhắc hạn' : 'Bật nhắc hạn'}</button><button className="primary-button" onClick={() => setShowForm(value => !value)}><Plus size={17}/> Tạo dự án</button></div></div>
    {showForm && <form className="create-project panel" onSubmit={event => void createProject(event)}><div className="create-project-head"><div><h3>Dự án mới</h3><p>Bắt đầu bằng một cái tên bạn yêu thích.</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Đóng"><X size={17}/></button></div><div className="form-row"><input autoFocus placeholder="Tên dự án" value={title} onChange={event => setTitle(event.target.value)} required maxLength={200}/><input placeholder="Mô tả ngắn (không bắt buộc)" value={description} onChange={event => setDescription(event.target.value)} maxLength={10000}/><button className="primary-button" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo dự án'}</button></div></form>}
    {loading && <div className="loading-bar"><span/></div>}
    <div className="projects-grid">{projects.map((project, index) => {
      const tasks = tasksByProject[project.id] ?? [];
      const completed = tasks.filter(task => task.isDone || task.status === 'done').length;
      const isExpanded = expanded === project.id;
      const progress = tasks.length ? Math.round(completed / tasks.length * 100) : project.progress;
      return <article id={`project-${project.id}`} className={`project-card ${isExpanded ? 'project-card-expanded' : ''}`} key={project.id}>
        <div className="project-card-top"><div className={`project-symbol project-symbol-${index % 3}`}><FolderKanban size={19}/></div><span className="project-status"><i className={`status-dot status-${project.status.toLowerCase()}`}/>{project.status}</span><button className="icon-button project-delete" type="button" title="Xóa dự án" aria-label={`Xóa dự án ${project.title}`} onClick={() => void deleteProject(project)}><Trash2 size={16}/></button></div><span className="project-card-tag">{project.tag || 'DỰ ÁN CÁ NHÂN'}</span><h3>{project.title}</h3><p>{project.description || 'Một hành trình mới đang bắt đầu.'}</p>
        <div className="project-card-progress"><div className="progress-label"><span>Tiến độ task</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }}/></div></div><div className="project-card-foot"><span><CalendarDays size={14}/>{tasks.length} task · {completed} hoàn thành</span><span className="member-stack">{project.members.slice(0, 3).map((member, i) => <i key={`${member}-${i}`}>{member.slice(0, 1).toUpperCase()}</i>)}</span></div>
        <button className="task-toggle" type="button" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : project.id)}>{isExpanded ? 'Thu gọn task' : 'Quản lý task'} <ChevronDown className={isExpanded ? 'rotate' : ''} size={16}/></button>
        {isExpanded && <div className="task-manager"><div className="task-manager-heading"><strong>Công việc trong dự án <span>{tasks.length} task</span></strong><span>Nhắc hạn trước 1 ngày</span></div>
          <form className="task-create-form" onSubmit={event => void addTask(project.id, event)}><label className="task-title-field"><span>Tên task</span><input placeholder="Ví dụ: Hoàn thiện bản thiết kế" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} required maxLength={200}/></label><label><span>Ngày nộp</span><input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })}/></label><label><span>Ưu tiên</span><select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}><option value="High">Cao</option><option value="Medium">Vừa</option><option value="Low">Thấp</option></select></label><button className="primary-button task-add-button" disabled={busy}><Plus size={15}/> Thêm task</button></form>
          {tasks.length ? <div className="task-list">{tasks.map(task => {
            const done = task.isDone || task.status === 'done'; const remaining = task.dueDate ? daysUntil(task.dueDate) : null; const isEditing = editing === task.id;
            return <div id={`task-${task.id}`} className={`project-task ${done ? 'project-task-done' : ''} ${highlightedTaskId === task.id ? 'task-search-highlight' : ''}`} key={task.id}><button className="task-check" type="button" aria-label={done ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'} onClick={() => void toggleTask(project.id, task)}>{done ? <CheckCircle2 size={18}/> : <Circle size={18}/>}</button>
              {isEditing ? <form className="task-edit-form" onSubmit={event => void saveTask(project.id, event)}><input aria-label="Tên task" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} required maxLength={200}/><input aria-label="Ngày nộp" type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })}/><select aria-label="Ưu tiên" value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}><option value="High">Cao</option><option value="Medium">Vừa</option><option value="Low">Thấp</option></select><button className="icon-button" aria-label="Lưu"><CheckCircle2 size={16}/></button><button className="icon-button" type="button" aria-label="Hủy" onClick={() => setEditing(null)}><X size={16}/></button></form> : <><div className="task-copy"><strong>{task.title}</strong><span><i className={`priority-dot priority-${task.priority.toLowerCase()}`}/>{task.priority === 'High' ? 'Ưu tiên cao' : task.priority === 'Low' ? 'Ưu tiên thấp' : 'Ưu tiên vừa'} · {formatDate(task.dueDate)}</span></div><span className={`task-due-state ${remaining !== null && remaining < 0 && !done ? 'overdue' : remaining === 1 && !done ? 'due-soon' : ''}`}>{done ? 'Hoàn thành' : remaining === null ? 'Chưa đặt hạn' : remaining < 0 ? `Trễ ${Math.abs(remaining)} ngày` : remaining === 0 ? 'Đến hạn hôm nay' : remaining === 1 ? 'Còn 1 ngày' : `Còn ${remaining} ngày`}</span><button className="icon-button" type="button" aria-label="Sửa task" onClick={() => { setEditing(task.id); setDraft({ title: task.title, dueDate: task.dueDate ?? '', priority: task.priority }); }}><Pencil size={15}/></button><button className="icon-button task-delete" type="button" aria-label="Xóa task" onClick={() => void deleteTask(project.id, task)}><Trash2 size={15}/></button></>}
            </div>;
          })}</div> : <div className="task-empty">Chưa có task. Thêm công việc đầu tiên cho dự án này.</div>}
        </div>}
      </article>;
    })}</div>
    {!projects.length && !loading && <div className="panel task-empty-state"><FolderKanban size={22}/><strong>Chưa có dự án nào</strong><span>Tạo dự án đầu tiên để bắt đầu thêm task và theo dõi hạn nộp.</span><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={16}/> Tạo dự án</button></div>}
  </>;
}
