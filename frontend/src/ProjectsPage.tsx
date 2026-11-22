import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpDown,
  ChevronRight,
  Bell,
  BellOff,
  BellRing,
  CalendarDays,
  Filter,
  FolderKanban,
  Pencil,
  Pin,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { api, type NoticeHandler, type Project, type ProjectTask } from './api';
import type { SearchTarget } from './GlobalSearch';
import ProjectDetail from './ProjectDetail';
import ProjectWorkProgress from './ProjectWorkProgress';
import { localDate } from './studyPlanning';
import './project-detail.css';

export type ProjectView = 'list' | 'deadlines';

type Props = {
  userId?: string;
  projects: Project[];
  tasksByProject?: Record<string, ProjectTask[]>;
  onTasksUpdated?: () => Promise<void>;
  loading: boolean;
  refresh: () => Promise<void>;
  onNotice: NoticeHandler;
  openTarget: SearchTarget | null;
  onTargetOpened: () => void;
  remindersEnabled: boolean;
  onToggleReminders: (enabled: boolean) => void;
  view: ProjectView;
  onViewChange: (view: ProjectView) => void;
  selectedProjectId?: string | null;
  selectedTaskId?: string | null;
  onSelectProject?: (projectId: string | null, taskId?: string | null) => void;
};

type ProjectDraft = {
  title: string;
  description: string;
  tag: string;
  priority: string;
  status: string;
  progress: number;
  startDate: string;
  endDate: string;
  isPinned: boolean;
};

const emptyProjectDraft: ProjectDraft = {
  title: '',
  description: '',
  tag: '',
  priority: 'Medium',
  status: 'Active',
  progress: 0,
  startDate: '',
  endDate: '',
  isPinned: false,
};

const VALID_PROJECT_STATUS_FILTERS = ['all', 'pinned', 'Active', 'Planning', 'In Progress', 'Paused', 'Completed'];
const VALID_PRIORITY_FILTERS = ['all', 'High', 'Medium', 'Low'];
const VALID_PROJECT_SORTS = ['pinned', 'priority', 'progress', 'endDate', 'title'];
const VALID_TASK_STATUS_FILTERS = ['all', 'pending', 'in-progress', 'done', 'milestone'];
const VALID_TASK_SORTS = ['created', 'dueDate', 'priority', 'timeline'];

function safeEnum<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const reminderKey = (task: ProjectTask) => `lifeos:deadline-reminder:${task.id}:${task.dueDate}`;

function daysUntil(value: string) {
  const parts = value.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const now = new Date();
  return Math.round(
    (Date.UTC(parts[0], parts[1] - 1, parts[2]) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86_400_000,
  );
}

function formatShortDate(value: string | null) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  );
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const priorityRank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

export function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === 'active') return 'Đang chạy';
  if (s === 'in progress' || s === 'in-progress') return 'Đang thực hiện';
  if (s === 'paused') return 'Tạm dừng';
  if (s === 'completed' || s === 'done') return 'Hoàn thành';
  if (s === 'planning') return 'Lên kế hoạch';
  return status;
}

export default function ProjectsPage({
  userId = 'default',
  projects,
  tasksByProject: externalTasksByProject,
  onTasksUpdated,
  loading,
  refresh,
  onNotice,
  openTarget,
  onTargetOpened,
  remindersEnabled,
  onToggleReminders,
  view,
  onViewChange,
  selectedProjectId,
  selectedTaskId,
  onSelectProject,
}: Props) {
  const filterStorageKey = `lifeos:project-filters:${userId}`;
  const initialStored = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(filterStorageKey) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }, [filterStorageKey]);

  const [showForm, setShowForm] = useState(false);
  const [showCreateAdvanced, setShowCreateAdvanced] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectDraft, setEditProjectDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [projectFormError, setProjectFormError] = useState('');

  const [busy, setBusy] = useState(false);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);
  const [localTasksByProject, setLocalTasksByProject] = useState<Record<string, ProjectTask[]>>({});
  const tasksByProject = externalTasksByProject ?? localTasksByProject;

  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(selectedTaskId ?? null);

  // Project filter & sort (persisted per account in localStorage)
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>(() =>
    safeEnum(initialStored.projectStatusFilter, VALID_PROJECT_STATUS_FILTERS, 'all'),
  );
  const [projectPriorityFilter, setProjectPriorityFilter] = useState<string>(() =>
    safeEnum(initialStored.projectPriorityFilter, VALID_PRIORITY_FILTERS, 'all'),
  );
  const [projectSort, setProjectSort] = useState<string>(() =>
    safeEnum(initialStored.projectSort || localStorage.getItem('lifeos:project-sort'), VALID_PROJECT_SORTS, 'pinned'),
  );

  // Task filter & sort (persisted per account in localStorage)
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>(() =>
    safeEnum(initialStored.taskStatusFilter, VALID_TASK_STATUS_FILTERS, 'all'),
  );
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>(() =>
    safeEnum(initialStored.taskPriorityFilter, VALID_PRIORITY_FILTERS, 'all'),
  );
  const [taskSort, setTaskSort] = useState<string>(() =>
    safeEnum(initialStored.taskSort || localStorage.getItem('lifeos:task-sort'), VALID_TASK_SORTS, 'created'),
  );

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  );

  useEffect(() => {
    setEditingProjectId(null);
  }, [selectedProjectId]);

  const checkedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        filterStorageKey,
        JSON.stringify({
          projectStatusFilter,
          projectPriorityFilter,
          projectSort,
          taskStatusFilter,
          taskPriorityFilter,
          taskSort,
        }),
      );
      localStorage.setItem('lifeos:project-sort', projectSort);
      localStorage.setItem('lifeos:task-sort', taskSort);
    } catch {
      /* ignore quota errors */
    }
  }, [
    filterStorageKey,
    projectStatusFilter,
    projectPriorityFilter,
    projectSort,
    taskStatusFilter,
    taskPriorityFilter,
    taskSort,
  ]);

  const reloadTasks = useCallback(async () => {
    if (onTasksUpdated) {
      await onTasksUpdated();
      return;
    }
    if (!projects.length) {
      setLocalTasksByProject({});
      return;
    }
    try {
      const rows = await Promise.all(
        projects.map(async (project) => [project.id, await api<ProjectTask[]>(`/projects/${project.id}/tasks`)] as const),
      );
      setLocalTasksByProject(Object.fromEntries(rows));
    } catch (error) {
      onNotice({
        message: error instanceof Error ? error.message : 'Không tải được danh sách task.',
        type: 'error',
        retry: () => void reloadTasks(),
      });
    }
  }, [projects, onNotice, onTasksUpdated]);

  useEffect(() => {
    if (!externalTasksByProject) {
      void reloadTasks();
    }
  }, [reloadTasks, externalTasksByProject]);

  // Verify URL deep link when projects/tasks finish loading
  useEffect(() => {
    if (!selectedProjectId) {
      checkedDeepLinkRef.current = null;
      setHighlightedTaskId(null);
      return;
    }
    if (loading) return;
    const key = `${selectedProjectId}:${selectedTaskId ?? ''}`;
    if (checkedDeepLinkRef.current === key) return;
    if (!projects.some((p) => p.id === selectedProjectId)) {
      checkedDeepLinkRef.current = key;
      onNotice({
        message: 'Không tìm thấy dự án trong liên kết hoặc dự án đã bị xóa.',
        type: 'warning',
      });
      onSelectProject?.(null, null);
      return;
    }
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      const pTasks = tasksByProject[selectedProjectId];
      if (!pTasks) return; // wait for tasks to load
      checkedDeepLinkRef.current = key;
      setProjectStatusFilter('all');
      setProjectPriorityFilter('all');
      if (selectedTaskId) {
        if (!pTasks.some((t) => t.id === selectedTaskId)) {
          onNotice({
            message: 'Không tìm thấy công việc được liên kết trong dự án này.',
            type: 'warning',
          });
          onSelectProject?.(selectedProjectId, null);
          return;
        }
        setTaskStatusFilter('all');
        setTaskPriorityFilter('all');
        setHighlightedTaskId(selectedTaskId);
        const timer = window.setTimeout(() => {
          document.getElementById(`task-${selectedTaskId}`)?.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'center',
          });
        }, 120);
        const hTimer = window.setTimeout(() => setHighlightedTaskId(null), 4500);
        return () => {
          window.clearTimeout(timer);
          window.clearTimeout(hTimer);
        };
      }
    }
  }, [loading, projects, tasksByProject, selectedProjectId, selectedTaskId, onNotice, onSelectProject]);

  useEffect(() => {
    if (!openTarget || !openTarget.projectId) return;
    const targetProjectId = openTarget.projectId;
    setProjectStatusFilter('all');
    setProjectPriorityFilter('all');
    setTaskStatusFilter('all');
    setTaskPriorityFilter('all');
    if (openTarget.taskId) setHighlightedTaskId(openTarget.taskId);
    const targetTasks = tasksByProject[targetProjectId] ?? [];
    if (openTarget.taskId && !targetTasks.some((task) => task.id === openTarget.taskId)) return;
    const timer = window.setTimeout(() => {
      const elementId = openTarget.taskId ? `task-${openTarget.taskId}` : `project-${targetProjectId}`;
      document.getElementById(elementId)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
      });
      onTargetOpened();
    }, 180);
    const highlightTimer = window.setTimeout(() => setHighlightedTaskId(null), 4500);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(highlightTimer);
    };
  }, [openTarget, tasksByProject, onTargetOpened]);

  const safeRefreshAfterMutation = async (successMessage: string, refreshFn: () => Promise<void>) => {
    try {
      await refreshFn();
      onNotice({ message: successMessage, type: 'success' });
    } catch {
      onNotice({
        message: `${successMessage} Tuy nhiên chưa tải lại được danh sách mới nhất.`,
        type: 'warning',
        retry: () => void refreshFn(),
        retryLabel: 'Tải lại danh sách',
      });
    }
  };

  const buildProjectPayload = (d: ProjectDraft) => {
    if (!d.title.trim()) {
      throw new Error('Vui lòng nhập tên dự án.');
    }
    if (d.title.trim().length > 200) {
      throw new Error('Tên dự án không vượt quá 200 ký tự.');
    }
    if (d.startDate && d.endDate && d.endDate < d.startDate) {
      throw new Error('Ngày kết thúc dự án phải bằng hoặc sau ngày bắt đầu.');
    }
    const progressNum = Number(d.progress);
    if (Number.isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
      throw new Error('Tiến độ dự án phải nằm trong khoảng 0 đến 100%.');
    }
    const computedDaysLeft = d.endDate ? Math.max(0, daysUntil(d.endDate) ?? 0) : 0;
    return {
      title: d.title.trim(),
      description: d.description.trim(),
      tag: d.tag.trim(),
      priority: d.priority,
      status: d.status,
      progress: Math.round(progressNum),
      startDate: d.startDate || null,
      endDate: d.endDate || null,
      daysLeft: computedDaysLeft,
      isPinned: d.isPinned,
    };
  };

  const executeCreateProject = async () => {
    if (busy) return;
    setProjectFormError('');
    let payload: ReturnType<typeof buildProjectPayload>;
    try {
      payload = buildProjectPayload(projectDraft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dữ liệu dự án chưa hợp lệ.';
      setProjectFormError(msg);
      return;
    }
    setBusy(true);
    try {
      await api('/projects', { method: 'POST', body: JSON.stringify(payload) });
      setProjectDraft(emptyProjectDraft);
      setShowCreateAdvanced(false);
      setShowForm(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không tạo được dự án.';
      setProjectFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeCreateProject(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation('Đã tạo dự án mới.', refresh);
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    await executeCreateProject();
  };

  const startEditProject = (project: Project) => {
    setProjectFormError('');
    setEditingProjectId(project.id);
    setEditProjectDraft({
      title: project.title,
      description: project.description ?? '',
      tag: project.tag ?? '',
      priority: project.priority || 'Medium',
      status: project.status || 'Active',
      progress: Math.round(project.progress ?? 0),
      startDate: project.startDate ?? '',
      endDate: project.endDate ?? '',
      isPinned: Boolean(project.isPinned),
    });
  };

  const executeSaveEditProject = async () => {
    if (!editingProjectId || busy) return;
    const targetId = editingProjectId;
    setProjectFormError('');
    let payload: ReturnType<typeof buildProjectPayload>;
    try {
      payload = buildProjectPayload(editProjectDraft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dữ liệu dự án chưa hợp lệ.';
      setProjectFormError(msg);
      return;
    }
    setBusy(true);
    try {
      await api(`/projects/${targetId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setEditingProjectId(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không cập nhật được dự án.';
      setProjectFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveEditProject(),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation('Đã cập nhật thông tin dự án.', refresh);
  };

  const saveEditProject = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveEditProject();
  };

  const togglePinProject = async (project: Project) => {
    if (itemBusyId === project.id) return;
    setItemBusyId(project.id);
    try {
      await api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPinned: !project.isPinned }),
      });
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không cập nhật được trạng thái ghim.',
        type: 'error',
        retry: () => void togglePinProject(project),
      });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation(project.isPinned ? 'Đã bỏ ghim dự án.' : 'Đã ghim dự án lên đầu.', refresh);
  };

  const deleteProject = async (project: Project) => {
    if (itemBusyId === project.id) return;
    if (!window.confirm(`Xóa dự án “${project.title}” cùng toàn bộ task bên trong?`)) return;
    setItemBusyId(project.id);
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      for (const task of tasksByProject[project.id] ?? []) localStorage.removeItem(reminderKey(task));
      if (selectedProjectId === project.id) onSelectProject?.(null, null);
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không xóa được dự án.',
        type: 'error',
      });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa dự án.', refresh);
  };

  const enableReminders = async () => {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      onNotice({
        message: 'Trình duyệt này chưa hỗ trợ thông báo ngoài trình duyệt; nhắc hạn trong LifeOS đã bật.',
        type: 'info',
      });
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    onNotice({
      message:
        result === 'granted'
          ? 'Đã bật nhắc hạn. LifeOS nhắc trước hạn một ngày khi ứng dụng đang mở.'
          : 'Nhắc hạn trong LifeOS đã bật; bạn chưa cấp quyền thông báo ngoài trình duyệt.',
      type: 'info',
    });
  };

  const toggleReminders = () => {
    const enabled = !remindersEnabled;
    onToggleReminders(enabled);
    if (enabled) void enableReminders();
    else onNotice({ message: 'Đã tắt nhắc hạn.', type: 'info' });
  };

  const toggleTask = async (projectId: string, task: ProjectTask) => {
    if (itemBusyId === task.id) return;
    const isDone = !(task.isDone || task.status === 'done');
    setItemBusyId(task.id);
    try {
      await api(`/projects/${projectId}/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isDone,
          status: isDone ? 'done' : 'todo',
          dueDate: task.dueDate,
        }),
      });
      if (!isDone) localStorage.removeItem(reminderKey(task));
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không cập nhật được task.',
        type: 'error',
        retry: () => void toggleTask(projectId, task),
      });
      return;
    }
    setItemBusyId(null);
    await reloadTasks();
  };

  const deleteTask = async (projectId: string, task: ProjectTask) => {
    if (itemBusyId === task.id) return;
    if (!window.confirm(`Xóa task “${task.title}” và tài liệu đính kèm?`)) return;
    setItemBusyId(task.id);
    try {
      await api(`/projects/${projectId}/tasks/${task.id}`, { method: 'DELETE' });
      localStorage.removeItem(reminderKey(task));
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không xóa được task.',
        type: 'error',
      });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation('Đã xóa task.', reloadTasks);
  };

  const filteredProjects = useMemo(() => {
    return [...projects]
      .filter((p) => {
        if (projectStatusFilter === 'pinned') return p.isPinned;
        if (projectStatusFilter !== 'all' && p.status.toLowerCase() !== projectStatusFilter.toLowerCase()) return false;
        if (projectPriorityFilter !== 'all' && p.priority !== projectPriorityFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (projectSort === 'pinned') {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        }
        if (projectSort === 'priority') {
          return (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0);
        }
        if (projectSort === 'progress') {
          const tasksA = tasksByProject[a.id] ?? [];
          const progA = tasksA.length
            ? Math.round((tasksA.filter((t) => t.isDone || t.status === 'done').length / tasksA.length) * 100)
            : a.progress;
          const tasksB = tasksByProject[b.id] ?? [];
          const progB = tasksB.length
            ? Math.round((tasksB.filter((t) => t.isDone || t.status === 'done').length / tasksB.length) * 100)
            : b.progress;
          return progB - progA;
        }
        if (projectSort === 'endDate') {
          return (a.endDate || '9999-12-31').localeCompare(b.endDate || '9999-12-31');
        }
        if (projectSort === 'title') {
          return a.title.localeCompare(b.title, 'vi');
        }
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
  }, [projects, projectStatusFilter, projectPriorityFilter, projectSort, tasksByProject]);

  const filterAndSortTasks = (tasks: ProjectTask[]) => {
    return [...tasks]
      .filter((t) => {
        const done = t.isDone || t.status === 'done';
        if (taskStatusFilter === 'pending' && done) return false;
        if (taskStatusFilter === 'in-progress' && t.status !== 'in-progress') return false;
        if (taskStatusFilter === 'done' && !done) return false;
        if (taskStatusFilter === 'milestone' && !t.isMilestone) return false;
        if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (taskSort === 'dueDate') {
          return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
        }
        if (taskSort === 'priority') {
          return (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0);
        }
        if (taskSort === 'timeline') {
          return (a.startDay ?? 0) - (b.startDay ?? 0);
        }
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
  };

  const editProjectForm = editingProjectId ? (
    <form className="panel project-edit-panel" onSubmit={(event) => void saveEditProject(event)}>
          <div className="panel-heading">
            <div>
              <h3>Chỉnh sửa dự án</h3>
              <p>Cập nhật tiến độ nhập tay, trạng thái, hạn và thành viên dự án.</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Đóng chỉnh sửa dự án"
              onClick={() => {
                setEditingProjectId(null);
                setProjectFormError('');
              }}
            >
              <X size={17} />
            </button>
          </div>
          <div className="project-advanced-grid">
            <label className="project-span-2">
              Tên dự án
              <input
                autoFocus
                value={editProjectDraft.title}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, title: e.target.value })}
                required
                maxLength={200}
              />
            </label>
            <label className="project-span-2">
              Mô tả dự án
              <input
                value={editProjectDraft.description}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, description: e.target.value })}
                maxLength={10000}
                placeholder="Mô tả mục tiêu dự án"
              />
            </label>
            <label>
              Nhãn / Tag
              <input
                value={editProjectDraft.tag}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, tag: e.target.value })}
                maxLength={80}
                placeholder="Ví dụ: AI / Web"
              />
            </label>
            <label>
              Trạng thái
              <select
                value={editProjectDraft.status}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, status: e.target.value })}
              >
                <option value="Active">Đang chạy (Active)</option>
                <option value="Planning">Lên kế hoạch (Planning)</option>
                <option value="In Progress">Đang thực hiện (In Progress)</option>
                <option value="Paused">Tạm dừng (Paused)</option>
                <option value="Completed">Hoàn thành (Completed)</option>
              </select>
            </label>
            <label>
              Mức ưu tiên
              <select
                value={editProjectDraft.priority}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, priority: e.target.value })}
              >
                <option value="High">Cao</option>
                <option value="Medium">Vừa</option>
                <option value="Low">Thấp</option>
              </select>
            </label>
            <label>
              Tiến độ nhập tay ({editProjectDraft.progress}%)
              <input
                type="number"
                min={0}
                max={100}
                value={editProjectDraft.progress}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, progress: Number(e.target.value) })}
              />
            </label>
            <label>
              Ngày bắt đầu
              <input
                type="date"
                value={editProjectDraft.startDate}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, startDate: e.target.value })}
              />
            </label>
            <label>
              Ngày kết thúc
              <input
                type="date"
                value={editProjectDraft.endDate}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, endDate: e.target.value })}
              />
            </label>
            <label className="checkbox-inline-label">
              <input
                type="checkbox"
                checked={editProjectDraft.isPinned}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, isPinned: e.target.checked })}
              />
              <span>Ghim dự án lên đầu</span>
            </label>
          </div>
          {projectFormError && (
            <div className="form-error" role="alert">
              {projectFormError}
            </div>
          )}
          <div className="study-editor-actions">
            <button className="primary-button" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu dự án'}
            </button>
            <button
              type="button"
              className="soft-button"
              onClick={() => {
                setEditingProjectId(null);
                setProjectFormError('');
              }}
            >
              Hủy
            </button>
          </div>
        </form>
  ) : null;

  const activeProject = projects.find((project) => project.id === selectedProjectId);
  if (selectedProjectId && !activeProject) return <p role="status">{loading ? 'Đang tải dự án…' : 'Không tìm thấy dự án.'}</p>;
  if (activeProject) {
    const tasks = tasksByProject[activeProject.id] ?? [];
    return <ProjectDetail key={activeProject.id} project={activeProject} tasks={tasks} visibleTasks={filterAndSortTasks(tasks)}
      filter={{ status: taskStatusFilter, priority: taskPriorityFilter, sort: taskSort,
        setStatus: setTaskStatusFilter, setPriority: setTaskPriorityFilter, setSort: setTaskSort }}
      highlightedTaskId={highlightedTaskId} selectedTaskId={selectedTaskId} searchOpen={Boolean(openTarget?.projectId)}
      itemBusyId={itemBusyId} loading={loading && !tasksByProject[activeProject.id]} editForm={editProjectForm}
      backHref={view === 'deadlines' ? '/projects?view=deadlines' : '/projects'}
      onSelectTask={(id) => onSelectProject?.(activeProject.id, id)} onBack={() => onSelectProject?.(null, null)}
      onEdit={() => startEditProject(activeProject)} onToggle={(task) => void toggleTask(activeProject.id, task)}
      onDelete={(task) => void deleteTask(activeProject.id, task)}
      onTaskSaved={(task) => {
        if (task) localStorage.removeItem(reminderKey(task));
        void safeRefreshAfterMutation(task ? 'Đã cập nhật task.' : 'Đã thêm task.', reloadTasks);
      }} />;
  }

  const header = (
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> LẬP KẾ HOẠCH
          </div>
          <h1>Dự án của bạn</h1>
        </div>
        <div className="project-page-actions">
          <button
            className="soft-button"
            type="button"
            title={remindersEnabled ? 'Tắt nhắc hạn task' : 'Bật nhắc hạn task'}
            aria-label={remindersEnabled ? 'Tắt nhắc hạn task' : 'Bật nhắc hạn task'}
            aria-pressed={remindersEnabled}
            onClick={toggleReminders}
          >
            {remindersEnabled ? (
              permission === 'granted' ? (
                <BellRing size={16} />
              ) : (
                <BellOff size={16} />
              )
            ) : (
              <Bell size={16} />
            )}{' '}
            {remindersEnabled ? 'Tắt nhắc hạn' : 'Bật nhắc hạn'}
          </button>
          {view === 'list' && <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingProjectId(null);
              setProjectFormError('');
              setShowForm((value) => !value);
            }}
          >
            <Plus size={17} /> Tạo dự án
          </button>}
        </div>
      </div>
  );

  const navigation = <div className="planning-page project-list-nav">
    <nav className="planning-nav" aria-label="Mục dự án">
      <button type="button" aria-pressed={view === 'list'} onClick={() => onViewChange('list')}>
        <FolderKanban size={16} /> Danh sách dự án
      </button>
      <button type="button" aria-pressed={view === 'deadlines'} onClick={() => onViewChange('deadlines')}>
        <CalendarDays size={16} /> Hạn task
      </button>
    </nav>
  </div>;

  if (view === 'deadlines') return <>
    {header}
    {navigation}
    <div className="planning-page">
      {loading ? <p role="status">Đang tải task…</p> : <ProjectWorkProgress mode="deadlines" projects={projects}
        tasksByProject={tasksByProject} today={localDate(new Date())} onOpenTask={(id, taskId) => onSelectProject?.(id, taskId)} />}
    </div>
  </>;

  return (
    <>
      {header}
      {navigation}
      {showForm && (
        <form className="create-project panel" onSubmit={(event) => void createProject(event)}>
          <div className="create-project-head">
            <div>
              <h3>Dự án mới</h3>
              <p>Bắt đầu bằng một cái tên bạn yêu thích và thiết lập mục tiêu chi tiết.</p>
            </div>
            <div className="create-project-head-actions">
              <button
                type="button"
                className="soft-button"
                onClick={() => setShowCreateAdvanced((v) => !v)}
              >
                <SlidersHorizontal size={14} /> {showCreateAdvanced ? 'Ẩn chi tiết' : 'Thiết lập nâng cao'}
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setProjectDraft(emptyProjectDraft);
                  setProjectFormError('');
                  setShowForm(false);
                }}
                aria-label="Đóng"
              >
                <X size={17} />
              </button>
            </div>
          </div>
          <div className="form-row">
            <input
              autoFocus
              placeholder="Tên dự án"
              aria-label="Tên dự án"
              value={projectDraft.title}
              onChange={(event) => setProjectDraft({ ...projectDraft, title: event.target.value })}
              required
              maxLength={200}
            />
            <input
              placeholder="Mô tả ngắn (không bắt buộc)"
              aria-label="Mô tả dự án"
              value={projectDraft.description}
              onChange={(event) => setProjectDraft({ ...projectDraft, description: event.target.value })}
              maxLength={10000}
            />
            <button className="primary-button" disabled={busy}>
              {busy ? 'Đang tạo…' : 'Tạo dự án'}
            </button>
          </div>
          {showCreateAdvanced && (
            <div className="project-advanced-grid">
              <label>
                Nhãn / Tag
                <input
                  placeholder="Ví dụ: AI / Web, Cá nhân"
                  value={projectDraft.tag}
                  onChange={(e) => setProjectDraft({ ...projectDraft, tag: e.target.value })}
                  maxLength={80}
                />
              </label>
              <label>
                Trạng thái
                <select
                  value={projectDraft.status}
                  onChange={(e) => setProjectDraft({ ...projectDraft, status: e.target.value })}
                >
                  <option value="Active">Đang chạy (Active)</option>
                  <option value="Planning">Lên kế hoạch (Planning)</option>
                  <option value="In Progress">Đang thực hiện (In Progress)</option>
                  <option value="Paused">Tạm dừng (Paused)</option>
                  <option value="Completed">Hoàn thành (Completed)</option>
                </select>
              </label>
              <label>
                Mức ưu tiên
                <select
                  value={projectDraft.priority}
                  onChange={(e) => setProjectDraft({ ...projectDraft, priority: e.target.value })}
                >
                  <option value="High">Cao</option>
                  <option value="Medium">Vừa</option>
                  <option value="Low">Thấp</option>
                </select>
              </label>
              <label>
                Tiến độ nhập tay ({projectDraft.progress}%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={projectDraft.progress}
                  onChange={(e) => setProjectDraft({ ...projectDraft, progress: Number(e.target.value) })}
                />
              </label>
              <label>
                Ngày bắt đầu
                <input
                  type="date"
                  value={projectDraft.startDate}
                  onChange={(e) => setProjectDraft({ ...projectDraft, startDate: e.target.value })}
                />
              </label>
              <label>
                Ngày kết thúc
                <input
                  type="date"
                  value={projectDraft.endDate}
                  onChange={(e) => setProjectDraft({ ...projectDraft, endDate: e.target.value })}
                />
              </label>
              <label className="checkbox-inline-label">
                <input
                  type="checkbox"
                  checked={projectDraft.isPinned}
                  onChange={(e) => setProjectDraft({ ...projectDraft, isPinned: e.target.checked })}
                />
                <span>Ghim dự án lên đầu</span>
              </label>
            </div>
          )}
          {projectFormError && (
            <div className="form-error" role="alert">
              {projectFormError}
            </div>
          )}
        </form>
      )}

      {editProjectForm}

      {projects.length > 0 && (
        <div className="filter-toolbar panel">
          <div className="filter-group">
            <span className="filter-label">
              <Filter size={14} /> Lọc dự án:
            </span>
            <select
              aria-label="Lọc trạng thái dự án"
              value={projectStatusFilter}
              onChange={(e) => setProjectStatusFilter(e.target.value)}
            >
              <option value="all">Tất cả trạng thái ({projects.length})</option>
              <option value="pinned">Đã ghim</option>
              <option value="Active">Đang chạy (Active)</option>
              <option value="Planning">Lên kế hoạch</option>
              <option value="In Progress">Đang thực hiện</option>
              <option value="Paused">Tạm dừng</option>
              <option value="Completed">Hoàn thành</option>
            </select>
            <select
              aria-label="Lọc ưu tiên dự án"
              value={projectPriorityFilter}
              onChange={(e) => setProjectPriorityFilter(e.target.value)}
            >
              <option value="all">Mọi mức ưu tiên</option>
              <option value="High">Ưu tiên cao</option>
              <option value="Medium">Ưu tiên vừa</option>
              <option value="Low">Ưu tiên thấp</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">
              <ArrowUpDown size={14} /> Sắp xếp:
            </span>
            <select
              aria-label="Sắp xếp dự án"
              value={projectSort}
              onChange={(e) => setProjectSort(e.target.value)}
            >
              <option value="pinned">Đã ghim & Mới cập nhật</option>
              <option value="priority">Mức ưu tiên cao nhất</option>
              <option value="progress">Tiến độ cao nhất</option>
              <option value="endDate">Hạn kết thúc gần nhất</option>
              <option value="title">Tên dự án (A–Z)</option>
            </select>
            {(projectStatusFilter !== 'all' || projectPriorityFilter !== 'all') && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setProjectStatusFilter('all');
                  setProjectPriorityFilter('all');
                }}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        </div>
      )}

      {loading && <div className="loading-bar"><span /></div>}

      {loading && !projects.length && (
        <div className="projects-grid" aria-busy="true" aria-label="Đang tải danh sách dự án">
          {[0, 1, 2].map((idx) => (
            <div className="project-card skeleton-card" key={idx}>
              <div className="skeleton-line skeleton-short" />
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line" />
              <div className="skeleton-line skeleton-bar" />
            </div>
          ))}
        </div>
      )}

      <div className="projects-grid">
        {filteredProjects.map((project, index) => {
          const tasks = tasksByProject[project.id] ?? [];
          const completed = tasks.filter((task) => task.isDone || task.status === 'done').length;
          const progress = tasks.length ? Math.round(completed / tasks.length * 100) : Math.round(project.progress ?? 0);
          return <article id={`project-${project.id}`} key={project.id}
            className={`project-card project-list-card${project.isPinned ? ' project-card-pinned' : ''}`}>
            <div className="project-card-top">
              <div className={`project-symbol project-symbol-${index % 3}`}><FolderKanban size={19} /></div>
              <span className="project-status">{statusLabel(project.status)}</span>
              <div className="project-card-actions">
                <button className={`icon-button ${project.isPinned ? 'pin-active' : ''}`} type="button" disabled={itemBusyId === project.id}
                  aria-label={`${project.isPinned ? 'Bỏ ghim' : 'Ghim'} dự án ${project.title}`} title={project.isPinned ? 'Bỏ ghim dự án' : 'Ghim dự án'}
                  onClick={() => void togglePinProject(project)}><Pin size={15} /></button>
                <button className="icon-button" type="button" title="Sửa dự án" aria-label={`Sửa dự án ${project.title}`}
                  onClick={() => startEditProject(project)}><Pencil size={15} /></button>
                <button className="icon-button project-delete" type="button" title="Xóa dự án" aria-label={`Xóa dự án ${project.title}`}
                  disabled={itemBusyId === project.id} onClick={() => void deleteProject(project)}><Trash2 size={16} /></button>
              </div>
            </div>
            {project.tag && <span className="project-card-tag">{project.isPinned ? '📌 ' : ''}{project.tag}</span>}
            <h3><a className="project-card-link" href={`/projects?project=${encodeURIComponent(project.id)}`} onClick={(event) => {
              if (!onSelectProject || event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
              event.preventDefault();
              onSelectProject(project.id, null);
            }}>
              {project.title}<ChevronRight size={16} aria-hidden="true" />
            </a></h3>
            {project.description && <p className="project-card-description">{project.description}</p>}
            {project.endDate && <div className="project-date-range"><CalendarDays size={14} /> Hạn {formatShortDate(project.endDate)}</div>}
            <div className="project-card-progress">
              <div className="progress-label"><span>{completed}/{tasks.length} task hoàn thành</span><strong>{progress}%</strong></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            </div>
          </article>;
        })}
      </div>

      {projects.length > 0 && filteredProjects.length === 0 && (
        <div className="panel task-empty-state">
          <Filter size={22} />
          <strong>Không tìm thấy dự án khớp bộ lọc</strong>
          <span>Thử đổi bộ lọc trạng thái hoặc mức ưu tiên để xem toàn bộ dự án.</span>
          <button
            className="soft-button"
            type="button"
            onClick={() => {
              setProjectStatusFilter('all');
              setProjectPriorityFilter('all');
            }}
          >
            Xóa bộ lọc dự án
          </button>
        </div>
      )}

      {!projects.length && !loading && (
        <div className="panel task-empty-state">
          <FolderKanban size={22} />
          <strong>Chưa có dự án nào</strong>
          <span>Tạo dự án đầu tiên để bắt đầu thêm task và theo dõi hạn nộp.</span>
          <button className="primary-button" type="button" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Tạo dự án
          </button>
        </div>
      )}
    </>
  );
}
