import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, ClipboardList, Clock3, Diamond, FileText, Filter, GitBranch, Layers, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Project, type ProjectTask, type ProjectTimerState } from './api';
import { CalendarDialog } from './CalendarEditors';
import { formatProjectTime, ProjectDocuments, ProjectTimer } from './ProjectResources';
import ProjectTaskEditor from './ProjectTaskEditor';
import ProjectTimeline from './ProjectTimeline';
import { dateLabel, localDate } from './studyPlanning';

type FilterState = {
  status: string;
  priority: string;
  sort: string;
  setStatus: (status: string) => void;
  setPriority: (priority: string) => void;
  setSort: (sort: string) => void;
};

type Props = {
  project: Project;
  tasks: ProjectTask[];
  visibleTasks: ProjectTask[];
  filter: FilterState;
  highlightedTaskId: string | null;
  selectedTaskId?: string | null;
  searchOpen: boolean;
  itemBusyId: string | null;
  loading: boolean;
  editForm: ReactNode;
  backHref: string;
  onSelectTask: (id: string | null) => void;
  onBack: () => void;
  onEdit: () => void;
  onToggle: (task: ProjectTask) => void;
  onDelete: (task: ProjectTask) => void;
  onTaskSaved: (task?: ProjectTask) => void;
};

const isDone = (task: ProjectTask) => task.isDone || task.status === 'done';

export default function ProjectDetail({ project, tasks, visibleTasks, filter, highlightedTaskId, selectedTaskId, searchOpen,
  itemBusyId, loading, editForm, backHref, onSelectTask, onBack, onEdit, onToggle, onDelete, onTaskSaved }: Props) {
  const [view, setView] = useState<'tasks' | 'documents' | 'timer'>('tasks');
  const [taskEditor, setTaskEditor] = useState<'new' | ProjectTask | null>(null);
  const [documentTask, setDocumentTask] = useState<ProjectTask | null>(null);
  const [timerTask, setTimerTask] = useState<ProjectTask | null>(null);
  const [timerSummary, setTimerSummary] = useState<ProjectTimerState | null>(null);
  const [timerRevision, setTimerRevision] = useState(0);
  const [filesBusy, setFilesBusy] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
  const today = localDate(new Date());

  useEffect(() => {
    if (selectedTaskId || searchOpen) setView('tasks');
  }, [selectedTaskId, searchOpen]);

  useEffect(() => {
    if (view !== 'tasks' || !tasks.length) return;
    const controller = new AbortController();
    void api<ProjectTimerState>(`/projects/${project.id}/timer`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setTimerSummary(result);
    }).catch(() => {
      if (!controller.signal.aborted) setTimerSummary(null);
    });
    return () => controller.abort();
  }, [project.id, tasks.length, timerRevision, view]);

  const refreshTimerSummary = () => setTimerRevision((value) => value + 1);

  const changeView = (next: typeof view) => {
    if (next !== 'tasks' && selectedTaskId) onSelectTask(null);
    setView(next);
  };

  return <div className="project-detail planning-page">
    <header className="project-detail-header">
      <a href={backHref} className="soft-button project-back" onClick={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onBack();
      }}><ArrowLeft size={16} aria-hidden="true" /> Quay lại danh sách</a>
      <div className="planning-section-head">
        <h1>{project.title}</h1>
        <button type="button" className="icon-button" title="Sửa dự án" aria-label="Sửa dự án" onClick={onEdit}><Pencil size={16} /></button>
      </div>
      {project.description && <p className="project-detail-description">{project.description}</p>}
      <div className="project-detail-meta">
        <span>{tasks.filter(isDone).length}/{tasks.length} task hoàn thành</span>
        {project.endDate && <span><CalendarDays size={14} /> Hạn {dateLabel(project.endDate)}</span>}
      </div>
    </header>
    {editForm}
    <nav className="planning-nav project-detail-nav" aria-label="Mục trong dự án">
      <button type="button" aria-pressed={view === 'tasks'} onClick={() => changeView('tasks')}><ClipboardList size={16} /> Công việc</button>
      <button type="button" aria-pressed={view === 'documents'} onClick={() => changeView('documents')}><FileText size={16} /> Tài liệu</button>
      <button type="button" aria-pressed={view === 'timer'} onClick={() => changeView('timer')}><Clock3 size={16} /> Bấm giờ</button>
    </nav>

    {view === 'documents' && <section className="panel planning-panel">
      <h2>Tài liệu dự án</h2>
      <ProjectDocuments projectId={project.id} tasks={tasks} onOpenTask={(taskId) => {
        setView('tasks');
        onSelectTask(taskId);
      }} />
    </section>}
    {view === 'timer' && <section className="panel planning-panel">
      <h2>Theo dõi thời gian</h2>
      <ProjectTimer projectId={project.id} taskNames={taskTitles} onChanged={refreshTimerSummary} />
    </section>}
    {view === 'tasks' && <section className="panel planning-panel">
      <div className="planning-section-head">
        <h2>Công việc</h2>
        <button type="button" className="primary-button" onClick={() => setTaskEditor('new')} disabled={loading}><Plus size={16} /> Thêm task</button>
      </div>
      {tasks.length > 0 && <details className="project-task-options project-task-filters">
        <summary><Filter size={15} /> Bộ lọc và sắp xếp{(filter.status !== 'all' || filter.priority !== 'all') && ' · Đang lọc'}</summary>
        <div className="task-filter-bar">
          <select aria-label="Lọc trạng thái task" value={filter.status} onChange={(event) => filter.setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option><option value="pending">Chưa hoàn thành</option>
            <option value="in-progress">Đang làm</option><option value="done">Đã hoàn thành</option><option value="milestone">Cột mốc</option>
          </select>
          <select aria-label="Lọc ưu tiên task" value={filter.priority} onChange={(event) => filter.setPriority(event.target.value)}>
            <option value="all">Mọi ưu tiên</option><option value="High">Cao</option><option value="Medium">Vừa</option><option value="Low">Thấp</option>
          </select>
          <select aria-label="Sắp xếp task" value={filter.sort} onChange={(event) => filter.setSort(event.target.value)}>
            <option value="created">Thứ tự tạo</option><option value="dueDate">Hạn nộp gần nhất</option>
            <option value="priority">Ưu tiên cao nhất</option><option value="timeline">Thứ tự Timeline</option>
          </select>
        </div>
      </details>}
      {loading ? <p role="status">Đang tải công việc…</p> : visibleTasks.length > 0 ? <ul className="task-list project-detail-tasks">
        {visibleTasks.map((task) => {
          const done = isDone(task);
          const busy = itemBusyId === task.id;
          const dependencies = (task.dependencies ?? []).map((id) => taskTitles.get(id)).filter(Boolean);
          const taskSeconds = timerSummary?.taskSeconds[task.id];
          const timing = timerSummary?.active?.taskId === task.id;
          return <li id={`task-${task.id}`} key={task.id}
            className={`project-task ${done ? 'project-task-done' : ''} ${highlightedTaskId === task.id ? 'task-search-highlight' : ''}`}>
            <button className="task-check" type="button" disabled={busy} aria-label={done ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}
              onClick={() => onToggle(task)}>{done ? <CheckCircle2 size={19} /> : <Circle size={19} />}</button>
            <div className="task-copy">
              <div className="task-title-line">
                <strong>{task.title}</strong>
                {(task.isMilestone || task.durationDays === 0) && <span className="task-milestone-badge"><Diamond size={11} /> Cột mốc</span>}
              </div>
              <div className="project-task-meta">
                {done ? <span>Hoàn thành</span> : task.status === 'in-progress' ? <span>Đang làm</span> : null}
                {task.priority === 'High' && <span><i className="priority-dot priority-high" /> Ưu tiên cao</span>}
                {task.dueDate && <span className={!done && task.dueDate < today ? 'overdue-text' : ''}>{dateLabel(task.dueDate)}</span>}
                {dependencies.length > 0 && <span title={dependencies.join(', ')}><GitBranch size={13} /> {dependencies.length} phụ thuộc</span>}
                {timing ? <span className="project-running-timer"><Clock3 size={13} /> Đang bấm giờ</span>
                  : taskSeconds !== undefined && <span title="Tổng thời gian task đã lưu"><Clock3 size={13} /> {formatProjectTime(taskSeconds)}</span>}
              </div>
            </div>
            <div className="project-task-actions">
              <button type="button" className="icon-button" title="Bấm giờ" aria-label={`Bấm giờ cho ${task.title}`}
                onClick={() => setTimerTask(task)}><Clock3 size={16} /></button>
              <button type="button" className="icon-button" title="Tài liệu task" aria-label={`Tài liệu của ${task.title}`}
                onClick={() => setDocumentTask(task)}><Paperclip size={16} /></button>
              <button type="button" className="icon-button" title="Sửa task" aria-label="Sửa task" onClick={() => setTaskEditor(task)}><Pencil size={16} /></button>
              <button type="button" className="icon-button" title="Xóa task" aria-label="Xóa task" disabled={busy}
                onClick={() => onDelete(task)}><Trash2 size={16} /></button>
            </div>
          </li>;
        })}
      </ul> : <p className="project-section-empty">{tasks.length ? 'Không có task khớp bộ lọc.' : 'Dự án này chưa có task.'}</p>}
      {tasks.length > 0 && <button type="button" className="soft-button project-timeline-toggle" onClick={() => setShowTimeline((value) => !value)}>
        <Layers size={14} /> {showTimeline ? 'Ẩn Timeline' : 'Xem Timeline'}
      </button>}
      {showTimeline && tasks.length > 0 && <ProjectTimeline tasks={tasks} />}
    </section>}
    {taskEditor && <ProjectTaskEditor projectId={project.id} tasks={tasks} task={taskEditor === 'new' ? undefined : taskEditor}
      onClose={() => setTaskEditor(null)} onSaved={() => {
        setTaskEditor(null);
        onTaskSaved(taskEditor === 'new' ? undefined : taskEditor);
      }} />}
    {documentTask && <CalendarDialog title={`Tài liệu của ${documentTask.title}`} busy={filesBusy} wide onClose={() => setDocumentTask(null)}>
      <ProjectDocuments projectId={project.id} tasks={tasks} taskId={documentTask.id} onBusy={setFilesBusy} />
    </CalendarDialog>}
    {timerTask && <CalendarDialog title={`Bấm giờ · ${timerTask.title}`} onClose={() => setTimerTask(null)}>
      <ProjectTimer projectId={project.id} taskId={timerTask.id} taskNames={taskTitles} onChanged={refreshTimerSummary} />
    </CalendarDialog>}
  </div>;
}
