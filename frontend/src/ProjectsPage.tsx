import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpDown,
  Bell,
  BellOff,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Diamond,
  Filter,
  FolderKanban,
  GitBranch,
  Layers,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, type NoticeHandler, type Project, type ProjectTask } from './api';
import type { SearchTarget } from './GlobalSearch';

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
  membersText: string;
};

type TaskDraft = {
  title: string;
  dueDate: string;
  priority: string;
  status: string;
  assignee: string;
  estimate: string;
  actual: string;
  subtasksDone: number;
  subtasksTotal: number;
  startDay: number;
  durationDays: number;
  baselineStart: number;
  baselineDuration: number;
  isMilestone: boolean;
  dependencies: string[];
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
  membersText: '',
};

const emptyTaskDraft: TaskDraft = {
  title: '',
  dueDate: '',
  priority: 'Medium',
  status: 'todo',
  assignee: '',
  estimate: '2h',
  actual: '0h',
  subtasksDone: 0,
  subtasksTotal: 0,
  startDay: 0,
  durationDays: 1,
  baselineStart: 0,
  baselineDuration: 1,
  isMilestone: false,
  dependencies: [],
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

function formatDate(value: string | null) {
  if (!value) return 'Chưa đặt ngày nộp';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, day),
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

export function hasTaskDependencyCycle(
  tasks: ProjectTask[],
  targetTaskId: string,
  candidateDeps: string[],
): boolean {
  const depMap = new Map<string, string[]>(
    tasks.map((t) => [t.id, t.id === targetTaskId ? candidateDeps : t.dependencies ?? []]),
  );
  depMap.set(targetTaskId, candidateDeps);
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const dfs = (node: string): boolean => {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of depMap.get(node) ?? []) {
      if (dfs(neighbor)) return true;
    }
    inStack.delete(node);
    return false;
  };
  return dfs(targetTaskId);
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
  const [taskFormError, setTaskFormError] = useState('');

  const [busy, setBusy] = useState(false);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);
  const [localTasksByProject, setLocalTasksByProject] = useState<Record<string, ProjectTask[]>>({});
  const tasksByProject = externalTasksByProject ?? localTasksByProject;

  const [expanded, setExpandedState] = useState<string | null>(selectedProjectId ?? null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(selectedTaskId ?? null);

  const [draft, setDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [showTaskAdvanced, setShowTaskAdvanced] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [showTimelineByProject, setShowTimelineByProject] = useState<Record<string, boolean>>({});

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

  const setExpanded = useCallback(
    (nextId: string | null, taskId: string | null = null) => {
      setExpandedState(nextId);
      onSelectProject?.(nextId, taskId);
    },
    [onSelectProject],
  );

  useEffect(() => {
    if (selectedProjectId !== undefined && selectedProjectId !== expanded) {
      setExpandedState(selectedProjectId);
    }
  }, [selectedProjectId]);

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
    if (loading || !selectedProjectId) return;
    const key = `${selectedProjectId}:${selectedTaskId ?? ''}`;
    if (checkedDeepLinkRef.current === key) return;
    if (!projects.some((p) => p.id === selectedProjectId)) {
      checkedDeepLinkRef.current = key;
      onNotice({
        message: 'Không tìm thấy dự án trong liên kết hoặc dự án đã bị xóa.',
        type: 'warning',
      });
      setExpanded(null, null);
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
          setExpanded(selectedProjectId, null);
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
  }, [loading, projects, tasksByProject, selectedProjectId, selectedTaskId, onNotice, setExpanded]);

  useEffect(() => {
    if (!openTarget || !openTarget.projectId) return;
    const targetProjectId = openTarget.projectId;
    setProjectStatusFilter('all');
    setProjectPriorityFilter('all');
    setTaskStatusFilter('all');
    setTaskPriorityFilter('all');
    setExpanded(targetProjectId, openTarget.taskId ?? null);
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
  }, [openTarget, tasksByProject, onTargetOpened, setExpanded]);

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
    const members = d.membersText
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
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
      members,
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
      membersText: (project.members ?? []).join(', '),
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

  const syncProjectProgressFromTasks = async (project: Project, taskProgress: number) => {
    if (itemBusyId === project.id) return;
    setItemBusyId(project.id);
    try {
      await api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ progress: taskProgress }),
      });
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không đồng bộ được tiến độ dự án.',
        type: 'error',
        retry: () => void syncProjectProgressFromTasks(project, taskProgress),
      });
      return;
    }
    setItemBusyId(null);
    await safeRefreshAfterMutation(`Đã đồng bộ tiến độ dự án (${taskProgress}%).`, refresh);
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
      if (expanded === project.id) setExpanded(null);
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

  const validateTaskPayload = (projectId: string, d: TaskDraft, currentTaskId?: string) => {
    if (!d.title.trim()) {
      throw new Error('Tên task không được để trống.');
    }
    const projectTasks = tasksByProject[projectId] ?? [];
    const validTaskIds = new Set(projectTasks.filter((t) => t.id !== currentTaskId).map((t) => t.id));
    const cleanDeps = d.dependencies.filter((id) => validTaskIds.has(id));
    if (currentTaskId && hasTaskDependencyCycle(projectTasks, currentTaskId, cleanDeps)) {
      throw new Error('Phụ thuộc tạo thành vòng lặp giữa các công việc trong dự án.');
    }
    const subtasksTotal = Math.max(0, Math.trunc(Number(d.subtasksTotal) || 0));
    const subtasksDone = Math.max(0, Math.trunc(Number(d.subtasksDone) || 0));
    if (subtasksDone > subtasksTotal) {
      throw new Error('Số bước nhỏ hoàn thành không được vượt quá tổng số bước nhỏ.');
    }
    const dur = Number(d.durationDays);
    const baseDur = Number(d.baselineDuration);
    if (Number.isNaN(dur) || dur < 0 || Number.isNaN(baseDur) || baseDur < 0) {
      throw new Error('Thời lượng ngày phải lớn hơn hoặc bằng 0.');
    }
    const isDone = d.status === 'done';
    return {
      title: d.title.trim(),
      dueDate: d.dueDate || null,
      priority: d.priority,
      status: d.status,
      isDone,
      assignee: d.assignee.trim(),
      estimate: d.estimate.trim() || '0h',
      actual: d.actual.trim() || '0h',
      subtasksDone,
      subtasksTotal,
      startDay: Math.trunc(Number(d.startDay) || 0),
      durationDays: Math.trunc(dur),
      baselineStart: Math.trunc(Number(d.baselineStart) || 0),
      baselineDuration: Math.trunc(baseDur),
      isMilestone: Boolean(d.isMilestone),
      dependencies: cleanDeps,
    };
  };

  const executeAddTask = async (projectId: string) => {
    if (busy || !draft.title.trim()) return;
    setTaskFormError('');
    let payload: ReturnType<typeof validateTaskPayload>;
    try {
      payload = validateTaskPayload(projectId, draft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dữ liệu task chưa hợp lệ.';
      setTaskFormError(msg);
      onNotice({ message: msg, type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await api(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDraft(emptyTaskDraft);
      setShowTaskAdvanced(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thêm được task.';
      setTaskFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeAddTask(projectId),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation('Đã thêm task vào dự án.', reloadTasks);
  };

  const addTask = async (projectId: string, event: FormEvent) => {
    event.preventDefault();
    await executeAddTask(projectId);
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

  const incrementSubtask = async (projectId: string, task: ProjectTask) => {
    if (!task.subtasksTotal || itemBusyId === task.id) return;
    const nextDone = task.subtasksDone >= task.subtasksTotal ? 0 : task.subtasksDone + 1;
    setItemBusyId(task.id);
    try {
      await api(`/projects/${projectId}/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ subtasksDone: nextDone }),
      });
    } catch (error) {
      setItemBusyId(null);
      onNotice({
        message: error instanceof Error ? error.message : 'Không cập nhật được subtask.',
        type: 'error',
        retry: () => void incrementSubtask(projectId, task),
      });
      return;
    }
    setItemBusyId(null);
    await reloadTasks();
  };

  const beginEditTask = (task: ProjectTask) => {
    setTaskFormError('');
    setEditing(task.id);
    setEditDraft({
      title: task.title,
      dueDate: task.dueDate ?? '',
      priority: task.priority || 'Medium',
      status: task.status || (task.isDone ? 'done' : 'todo'),
      assignee: task.assignee ?? '',
      estimate: task.estimate ?? '0h',
      actual: task.actual ?? '0h',
      subtasksDone: task.subtasksDone ?? 0,
      subtasksTotal: task.subtasksTotal ?? 0,
      startDay: task.startDay ?? 0,
      durationDays: task.durationDays ?? 0,
      baselineStart: task.baselineStart ?? 0,
      baselineDuration: task.baselineDuration ?? 0,
      isMilestone: Boolean(task.isMilestone),
      dependencies: task.dependencies ?? [],
    });
  };

  const executeSaveTask = async (projectId: string) => {
    if (!editing || !editDraft.title.trim() || busy) return;
    const targetTaskId = editing;
    setTaskFormError('');
    let payload: ReturnType<typeof validateTaskPayload>;
    try {
      payload = validateTaskPayload(projectId, editDraft, targetTaskId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dữ liệu task chưa hợp lệ.';
      setTaskFormError(msg);
      onNotice({ message: msg, type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await api(`/projects/${projectId}/tasks/${targetTaskId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const previousTask = tasksByProject[projectId]?.find((task) => task.id === targetTaskId);
      if (previousTask) localStorage.removeItem(reminderKey(previousTask));
      setEditing(null);
      setEditDraft(emptyTaskDraft);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không cập nhật được task.';
      setTaskFormError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveTask(projectId),
        retryLabel: 'Thử lưu lại',
      });
      setBusy(false);
      return;
    }
    setBusy(false);
    await safeRefreshAfterMutation('Đã cập nhật task.', reloadTasks);
  };

  const saveTask = async (projectId: string, event: FormEvent) => {
    event.preventDefault();
    await executeSaveTask(projectId);
  };

  const deleteTask = async (projectId: string, task: ProjectTask) => {
    if (itemBusyId === task.id) return;
    if (!window.confirm(`Xóa task “${task.title}”?`)) return;
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

  const toggleDependency = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> LẬP KẾ HOẠCH
          </div>
          <h1>Dự án của bạn</h1>
          <p>Chia mục tiêu lớn thành những bước nhỏ có thể hoàn thành.</p>
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
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingProjectId(null);
              setProjectFormError('');
              setShowForm((value) => !value);
            }}
          >
            <Plus size={17} /> Tạo dự án
          </button>
        </div>
      </div>

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
              <label className="project-members-field">
                Thành viên (ngăn cách bằng dấu phẩy)
                <input
                  placeholder="Ví dụ: Minh Anh, Nhóm 4"
                  value={projectDraft.membersText}
                  onChange={(e) => setProjectDraft({ ...projectDraft, membersText: e.target.value })}
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

      {editingProjectId && (
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
            <label className="project-span-2">
              Thành viên (ngăn cách bằng dấu phẩy)
              <input
                value={editProjectDraft.membersText}
                onChange={(e) => setEditProjectDraft({ ...editProjectDraft, membersText: e.target.value })}
                placeholder="Ví dụ: Minh Anh, Nhóm 4"
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
      )}

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
          const visibleTasks = filterAndSortTasks(tasks);
          const completed = tasks.filter((task) => task.isDone || task.status === 'done').length;
          const isExpanded = expanded === project.id;
          const manualProgress = Math.round(project.progress ?? 0);
          const taskProgress = tasks.length ? Math.round((completed / tasks.length) * 100) : null;
          const displayedProgress = taskProgress !== null ? taskProgress : manualProgress;
          const endRemaining = project.endDate ? daysUntil(project.endDate) : null;
          const showTimeline = Boolean(showTimelineByProject[project.id]);
          const maxTimelineDay = Math.max(
            7,
            ...tasks.map((t) =>
              Math.max(
                (t.startDay ?? 0) + (t.durationDays ?? 0) + 1,
                (t.baselineStart ?? 0) + (t.baselineDuration ?? 0) + 1,
              ),
            ),
          );

          return (
            <article
              id={`project-${project.id}`}
              className={`project-card ${isExpanded ? 'project-card-expanded' : ''} ${project.isPinned ? 'project-card-pinned' : ''}`}
              key={project.id}
            >
              <div className="project-card-top">
                <div className={`project-symbol project-symbol-${index % 3}`}>
                  <FolderKanban size={19} />
                </div>
                <span className="project-status">
                  <i className={`status-dot status-${project.status.toLowerCase().replace(/\s+/g, '-')}`} />
                  {project.status}
                </span>
                <span className={`priority-badge priority-badge-${project.priority.toLowerCase()}`}>
                  {project.priority === 'High' ? 'Cao' : project.priority === 'Low' ? 'Thấp' : 'Vừa'}
                </span>
                <div className="project-card-actions">
                  <button
                    className={`icon-button ${project.isPinned ? 'pin-active' : ''}`}
                    type="button"
                    disabled={itemBusyId === project.id}
                    title={project.isPinned ? 'Bỏ ghim dự án' : 'Ghim dự án'}
                    aria-label={project.isPinned ? `Bỏ ghim dự án ${project.title}` : `Ghim dự án ${project.title}`}
                    onClick={() => void togglePinProject(project)}
                  >
                    <Pin size={15} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    title="Sửa dự án"
                    aria-label={`Sửa dự án ${project.title}`}
                    onClick={() => startEditProject(project)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button project-delete"
                    type="button"
                    disabled={itemBusyId === project.id}
                    title="Xóa dự án"
                    aria-label={`Xóa dự án ${project.title}`}
                    onClick={() => void deleteProject(project)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <span className="project-card-tag">
                {project.isPinned ? '📌 ' : ''}
                {project.tag || 'DỰ ÁN CÁ NHÂN'}
              </span>
              <h3>{project.title}</h3>
              <p>{project.description || 'Một hành trình mới đang bắt đầu.'}</p>

              {(project.startDate || project.endDate) && (
                <div className="project-date-range">
                  <CalendarDays size={13} />
                  <span>
                    {project.startDate ? formatShortDate(project.startDate) : '—'} →{' '}
                    {project.endDate ? formatShortDate(project.endDate) : '—'}
                  </span>
                  {endRemaining !== null && project.status.toLowerCase() !== 'completed' && (
                    <small className={endRemaining < 0 ? 'overdue-text' : ''}>
                      ({endRemaining < 0 ? `Quá hạn ${Math.abs(endRemaining)} ngày` : `Còn ${endRemaining} ngày`})
                    </small>
                  )}
                </div>
              )}

              <div className="project-card-progress">
                <div className="progress-label">
                  <span>
                    {taskProgress !== null
                      ? `Tiến độ task (${completed}/${tasks.length}) · Nhập tay: ${manualProgress}%`
                      : `Tiến độ dự án (nhập tay)`}
                  </span>
                  <strong>{displayedProgress}%</strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${displayedProgress}%` }} />
                </div>
              </div>

              <div className="project-card-foot">
                <span>
                  <CalendarDays size={14} />
                  {tasks.length} task · {completed} hoàn thành
                </span>
                {project.members.length > 0 ? (
                  <span className="member-stack" title={`Thành viên: ${project.members.join(', ')}`}>
                    {project.members.slice(0, 4).map((member, i) => (
                      <i key={`${member}-${i}`}>{member.slice(0, 1).toUpperCase()}</i>
                    ))}
                  </span>
                ) : (
                  <span className="member-empty">
                    <Users size={13} /> Cá nhân
                  </span>
                )}
              </div>

              <button
                className="task-toggle"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpanded(isExpanded ? null : project.id)}
              >
                {isExpanded ? 'Thu gọn task' : 'Quản lý task'}
                <ChevronDown className={isExpanded ? 'rotate' : ''} size={16} />
              </button>

              {isExpanded && (
                <div className="task-manager">
                  <div className="task-manager-heading">
                    <strong>
                      Công việc trong dự án <span>{tasks.length} task</span>
                    </strong>
                    <div className="task-manager-tools">
                      {taskProgress !== null && taskProgress !== manualProgress && (
                        <button
                          type="button"
                          className="soft-button compact-btn"
                          disabled={itemBusyId === project.id}
                          onClick={() => void syncProjectProgressFromTasks(project, taskProgress)}
                          title="Cập nhật trường tiến độ dự án bằng tỷ lệ hoàn thành task"
                        >
                          <RefreshCw size={13} /> Đồng bộ tiến độ ({taskProgress}%)
                        </button>
                      )}
                      <button
                        type="button"
                        className="soft-button compact-btn"
                        onClick={() => setShowTaskAdvanced((v) => !v)}
                      >
                        <SlidersHorizontal size={13} /> {showTaskAdvanced ? 'Ẩn nâng cao' : 'Task nâng cao'}
                      </button>
                      {tasks.length > 0 && (
                        <button
                          type="button"
                          className="soft-button compact-btn"
                          onClick={() =>
                            setShowTimelineByProject((prev) => ({
                              ...prev,
                              [project.id]: !prev[project.id],
                            }))
                          }
                        >
                          <Layers size={13} /> {showTimeline ? 'Ẩn Timeline' : 'Xem Timeline'}
                        </button>
                      )}
                    </div>
                  </div>

                  <form className="task-create-form" onSubmit={(event) => void addTask(project.id, event)}>
                    <label className="task-title-field">
                      <span>Tên task</span>
                      <input
                        placeholder="Ví dụ: Hoàn thiện bản thiết kế"
                        value={draft.title}
                        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                        required
                        maxLength={200}
                      />
                    </label>
                    <label>
                      <span>Ngày nộp</span>
                      <input
                        type="date"
                        value={draft.dueDate}
                        onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Ưu tiên</span>
                      <select
                        value={draft.priority}
                        onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                      >
                        <option value="High">Cao</option>
                        <option value="Medium">Vừa</option>
                        <option value="Low">Thấp</option>
                      </select>
                    </label>
                    <button className="primary-button task-add-button" disabled={busy}>
                      <Plus size={15} /> Thêm task
                    </button>

                    {showTaskAdvanced && (
                      <div className="task-advanced-fields">
                        <label>
                          <span>Người phụ trách</span>
                          <input
                            placeholder="Tên thành viên"
                            value={draft.assignee}
                            onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                            maxLength={120}
                          />
                        </label>
                        <label>
                          <span>Trạng thái</span>
                          <select
                            value={draft.status}
                            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                          >
                            <option value="todo">Chưa làm (Todo)</option>
                            <option value="in-progress">Đang làm (In Progress)</option>
                            <option value="done">Hoàn thành (Done)</option>
                          </select>
                        </label>
                        <label>
                          <span>Ước lượng</span>
                          <input
                            placeholder="VD: 4h"
                            value={draft.estimate}
                            onChange={(e) => setDraft({ ...draft, estimate: e.target.value })}
                            maxLength={24}
                          />
                        </label>
                        <label>
                          <span>Thực tế</span>
                          <input
                            placeholder="VD: 2h"
                            value={draft.actual}
                            onChange={(e) => setDraft({ ...draft, actual: e.target.value })}
                            maxLength={24}
                          />
                        </label>
                        <label>
                          <span>Subtasks xong</span>
                          <input
                            type="number"
                            min={0}
                            max={draft.subtasksTotal}
                            value={draft.subtasksDone}
                            onChange={(e) => setDraft({ ...draft, subtasksDone: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          <span>Tổng subtasks</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.subtasksTotal}
                            onChange={(e) => {
                              const total = Math.max(0, Number(e.target.value));
                              setDraft({
                                ...draft,
                                subtasksTotal: total,
                                subtasksDone: Math.min(draft.subtasksDone, total),
                              });
                            }}
                          />
                        </label>
                        <label>
                          <span>Ngày bắt đầu (Day #)</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.startDay}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                startDay: Number(e.target.value),
                                baselineStart: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Thời lượng (ngày, 0 = mốc)</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.durationDays}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                durationDays: Number(e.target.value),
                                baselineDuration: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Baseline bắt đầu (Day #)</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.baselineStart}
                            onChange={(e) => setDraft({ ...draft, baselineStart: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          <span>Baseline thời lượng (ngày)</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.baselineDuration}
                            onChange={(e) => setDraft({ ...draft, baselineDuration: Number(e.target.value) })}
                          />
                        </label>
                        <label className="checkbox-inline-label">
                          <input
                            type="checkbox"
                            checked={draft.isMilestone}
                            onChange={(e) => setDraft({ ...draft, isMilestone: e.target.checked })}
                          />
                          <span>Là cột mốc (Milestone)</span>
                        </label>
                        {tasks.length > 0 && (
                          <div className="task-deps-selector">
                            <span>Phụ thuộc vào task cùng dự án:</span>
                            <div className="deps-chip-list">
                              {tasks.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  className={`dep-chip ${draft.dependencies.includes(t.id) ? 'dep-chip-active' : ''}`}
                                  onClick={() =>
                                    setDraft({
                                      ...draft,
                                      dependencies: toggleDependency(draft.dependencies, t.id),
                                    })
                                  }
                                >
                                  {t.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </form>

                  {taskFormError && (
                    <div className="form-error" role="alert">
                      {taskFormError}
                    </div>
                  )}

                  {tasks.length > 0 && (
                    <div className="task-filter-bar">
                      <select
                        aria-label="Lọc trạng thái task"
                        value={taskStatusFilter}
                        onChange={(e) => setTaskStatusFilter(e.target.value)}
                      >
                        <option value="all">Tất cả task ({tasks.length})</option>
                        <option value="pending">Chưa hoàn thành</option>
                        <option value="in-progress">Đang thực hiện</option>
                        <option value="done">Đã hoàn thành</option>
                        <option value="milestone">Cột mốc (Milestone)</option>
                      </select>
                      <select
                        aria-label="Lọc ưu tiên task"
                        value={taskPriorityFilter}
                        onChange={(e) => setTaskPriorityFilter(e.target.value)}
                      >
                        <option value="all">Mọi ưu tiên</option>
                        <option value="High">Cao</option>
                        <option value="Medium">Vừa</option>
                        <option value="Low">Thấp</option>
                      </select>
                      <select
                        aria-label="Sắp xếp task"
                        value={taskSort}
                        onChange={(e) => setTaskSort(e.target.value)}
                      >
                        <option value="created">Thứ tự tạo</option>
                        <option value="dueDate">Hạn nộp gần nhất</option>
                        <option value="priority">Ưu tiên cao nhất</option>
                        <option value="timeline">Thứ tự Timeline</option>
                      </select>
                      {(taskStatusFilter !== 'all' || taskPriorityFilter !== 'all') && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setTaskStatusFilter('all');
                            setTaskPriorityFilter('all');
                          }}
                        >
                          Xóa bộ lọc task
                        </button>
                      )}
                    </div>
                  )}

                  {showTimeline && tasks.length > 0 && (
                    <div className="project-timeline-box">
                      <div className="timeline-header">
                        <strong>Timeline dự án (Gantt & Baseline)</strong>
                        <span>Thang {maxTimelineDay} ngày · Thanh xanh: Kế hoạch · Thanh xám: Baseline · ◆: Cột mốc 0 ngày</span>
                      </div>
                      <div className="timeline-scroll-wrap">
                        <div className="timeline-rows">
                          {tasks.map((t) => {
                            const startDay = t.startDay ?? 0;
                            const dur = t.durationDays ?? 0;
                            const baseStart = t.baselineStart ?? 0;
                            const baseDur = t.baselineDuration ?? 0;

                            const leftPct = Math.min(94, Math.max(0, (startDay / maxTimelineDay) * 100));
                            const widthPct =
                              dur === 0
                                ? 0
                                : Math.min(100 - leftPct, Math.max(3, (dur / maxTimelineDay) * 100));

                            const baseLeftPct = Math.min(94, Math.max(0, (baseStart / maxTimelineDay) * 100));
                            const baseWidthPct =
                              baseDur === 0
                                ? 0
                                : Math.min(100 - baseLeftPct, Math.max(3, (baseDur / maxTimelineDay) * 100));

                            const isZeroDuration = dur === 0;
                            return (
                              <div className="timeline-row" key={`tl-${t.id}`}>
                                <div className="timeline-row-label">
                                  {(t.isMilestone || isZeroDuration) && <Diamond size={11} className="milestone-icon" />}
                                  <span title={t.title}>{t.title}</span>
                                </div>
                                <div className="timeline-track-wrap">
                                  {baseDur === 0 ? (
                                    <div
                                      className="timeline-milestone-baseline"
                                      style={{ left: `${baseLeftPct}%` }}
                                      title={`Baseline cột mốc: Ngày ${baseStart} (0 ngày)`}
                                    />
                                  ) : (
                                    <div
                                      className="timeline-bar-baseline"
                                      style={{ left: `${baseLeftPct}%`, width: `${baseWidthPct}%` }}
                                      title={`Baseline: Ngày ${baseStart} → Ngày ${baseStart + baseDur} (${baseDur} ngày)`}
                                    />
                                  )}
                                  {isZeroDuration ? (
                                    <div
                                      className={`timeline-milestone-zero ${t.isDone || t.status === 'done' ? 'done' : ''}`}
                                      style={{ left: `${leftPct}%` }}
                                      title={`Cột mốc 0 ngày: Ngày ${startDay} (0 ngày)`}
                                    >
                                      ◆
                                    </div>
                                  ) : (
                                    <div
                                      className={`timeline-bar-actual ${t.isDone || t.status === 'done' ? 'done' : ''} ${t.isMilestone ? 'milestone' : ''}`}
                                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                      title={`Ngày ${startDay} → Ngày ${startDay + dur} (${dur} ngày)`}
                                    />
                                  )}
                                </div>
                                <small className="timeline-days-meta">
                                  N{startDay} ({dur}d{t.isMilestone || isZeroDuration ? ' ◆' : ''})
                                </small>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {visibleTasks.length ? (
                    <div className="task-list">
                      {visibleTasks.map((task) => {
                        const done = task.isDone || task.status === 'done';
                        const remaining = task.dueDate ? daysUntil(task.dueDate) : null;
                        const isEditing = editing === task.id;
                        const depNames = (task.dependencies ?? [])
                          .map((depId) => tasks.find((t) => t.id === depId)?.title)
                          .filter(Boolean);

                        return (
                          <div
                            id={`task-${task.id}`}
                            className={`project-task ${done ? 'project-task-done' : ''} ${highlightedTaskId === task.id ? 'task-search-highlight' : ''}`}
                            key={task.id}
                          >
                            <button
                              className="task-check"
                              type="button"
                              disabled={itemBusyId === task.id}
                              aria-label={done ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}
                              onClick={() => void toggleTask(project.id, task)}
                            >
                              {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </button>

                            {isEditing ? (
                              <form className="task-edit-form task-edit-expanded" onSubmit={(event) => void saveTask(project.id, event)}>
                                <div className="task-edit-main-row">
                                  <input
                                    aria-label="Tên task"
                                    value={editDraft.title}
                                    onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                                    required
                                    maxLength={200}
                                  />
                                  <input
                                    aria-label="Ngày nộp"
                                    type="date"
                                    value={editDraft.dueDate}
                                    onChange={(event) => setEditDraft({ ...editDraft, dueDate: event.target.value })}
                                  />
                                  <select
                                    aria-label="Ưu tiên"
                                    value={editDraft.priority}
                                    onChange={(event) => setEditDraft({ ...editDraft, priority: event.target.value })}
                                  >
                                    <option value="High">Cao</option>
                                    <option value="Medium">Vừa</option>
                                    <option value="Low">Thấp</option>
                                  </select>
                                  <button className="icon-button" aria-label="Lưu" disabled={busy}>
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    type="button"
                                    aria-label="Hủy"
                                    onClick={() => {
                                      setEditing(null);
                                      setTaskFormError('');
                                    }}
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                                <div className="task-edit-extra-grid">
                                  <label>
                                    <span>Phụ trách</span>
                                    <input
                                      aria-label="Người phụ trách"
                                      placeholder="Người phụ trách"
                                      value={editDraft.assignee}
                                      onChange={(e) => setEditDraft({ ...editDraft, assignee: e.target.value })}
                                      maxLength={120}
                                    />
                                  </label>
                                  <label>
                                    <span>Trạng thái</span>
                                    <select
                                      aria-label="Trạng thái task"
                                      value={editDraft.status}
                                      onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value })}
                                    >
                                      <option value="todo">Chưa làm</option>
                                      <option value="in-progress">Đang làm</option>
                                      <option value="done">Hoàn thành</option>
                                    </select>
                                  </label>
                                  <label>
                                    <span>Ước lượng</span>
                                    <input
                                      aria-label="Ước lượng"
                                      value={editDraft.estimate}
                                      onChange={(e) => setEditDraft({ ...editDraft, estimate: e.target.value })}
                                      maxLength={24}
                                    />
                                  </label>
                                  <label>
                                    <span>Thực tế</span>
                                    <input
                                      aria-label="Thực tế"
                                      value={editDraft.actual}
                                      onChange={(e) => setEditDraft({ ...editDraft, actual: e.target.value })}
                                      maxLength={24}
                                    />
                                  </label>
                                  <label>
                                    <span>Subtasks xong</span>
                                    <input
                                      aria-label="Subtasks hoàn thành"
                                      type="number"
                                      min={0}
                                      max={editDraft.subtasksTotal}
                                      value={editDraft.subtasksDone}
                                      onChange={(e) =>
                                        setEditDraft({ ...editDraft, subtasksDone: Number(e.target.value) })
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span>Tổng subtasks</span>
                                    <input
                                      aria-label="Tổng subtasks"
                                      type="number"
                                      min={0}
                                      value={editDraft.subtasksTotal}
                                      onChange={(e) => {
                                        const total = Math.max(0, Number(e.target.value));
                                        setEditDraft({
                                          ...editDraft,
                                          subtasksTotal: total,
                                          subtasksDone: Math.min(editDraft.subtasksDone, total),
                                        });
                                      }}
                                    />
                                  </label>
                                  <label>
                                    <span>Ngày bắt đầu (Day #)</span>
                                    <input
                                      aria-label="Ngày bắt đầu timeline"
                                      type="number"
                                      min={0}
                                      value={editDraft.startDay}
                                      onChange={(e) =>
                                        setEditDraft({ ...editDraft, startDay: Number(e.target.value) })
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span>Thời lượng (ngày, 0 = mốc)</span>
                                    <input
                                      aria-label="Thời lượng ngày"
                                      type="number"
                                      min={0}
                                      value={editDraft.durationDays}
                                      onChange={(e) =>
                                        setEditDraft({ ...editDraft, durationDays: Number(e.target.value) })
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span>Baseline bắt đầu (Day #)</span>
                                    <input
                                      aria-label="Baseline bắt đầu"
                                      type="number"
                                      min={0}
                                      value={editDraft.baselineStart}
                                      onChange={(e) =>
                                        setEditDraft({ ...editDraft, baselineStart: Number(e.target.value) })
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span>Baseline thời lượng (ngày)</span>
                                    <input
                                      aria-label="Baseline thời lượng"
                                      type="number"
                                      min={0}
                                      value={editDraft.baselineDuration}
                                      onChange={(e) =>
                                        setEditDraft({ ...editDraft, baselineDuration: Number(e.target.value) })
                                      }
                                    />
                                  </label>
                                  <label className="checkbox-inline-label">
                                    <input
                                      type="checkbox"
                                      checked={editDraft.isMilestone}
                                      onChange={(e) =>
                                        setEditDraft({ ...editDraft, isMilestone: e.target.checked })
                                      }
                                    />
                                    <span>Cột mốc (Milestone)</span>
                                  </label>
                                  {tasks.filter((t) => t.id !== task.id).length > 0 && (
                                    <div className="task-deps-selector">
                                      <span>Phụ thuộc (cùng dự án, tự động chặn vòng lặp):</span>
                                      <div className="deps-chip-list">
                                        {tasks
                                          .filter((t) => t.id !== task.id)
                                          .map((t) => {
                                            const isSelected = editDraft.dependencies.includes(t.id);
                                            const candidate = toggleDependency(editDraft.dependencies, t.id);
                                            const createsCycle =
                                              !isSelected && hasTaskDependencyCycle(tasks, task.id, candidate);
                                            return (
                                              <button
                                                key={t.id}
                                                type="button"
                                                disabled={createsCycle}
                                                title={
                                                  createsCycle
                                                    ? 'Không thể chọn vì tạo vòng lặp phụ thuộc'
                                                    : undefined
                                                }
                                                className={`dep-chip ${isSelected ? 'dep-chip-active' : ''}`}
                                                onClick={() =>
                                                  setEditDraft({
                                                    ...editDraft,
                                                    dependencies: candidate,
                                                  })
                                                }
                                              >
                                                {t.title}
                                                {createsCycle ? ' (Vòng lặp)' : ''}
                                              </button>
                                            );
                                          })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className="task-copy">
                                  <div className="task-title-line">
                                    <strong>{task.title}</strong>
                                    {(task.isMilestone || task.durationDays === 0) && (
                                      <span className="task-milestone-badge" title="Cột mốc quan trọng">
                                        <Diamond size={10} /> Cột mốc{task.durationDays === 0 ? ' (0d)' : ''}
                                      </span>
                                    )}
                                    {task.status === 'in-progress' && !done && (
                                      <span className="task-status-chip">Đang làm</span>
                                    )}
                                  </div>
                                  <span>
                                    <i className={`priority-dot priority-${task.priority.toLowerCase()}`} />
                                    {task.priority === 'High'
                                      ? 'Ưu tiên cao'
                                      : task.priority === 'Low'
                                        ? 'Ưu tiên thấp'
                                        : 'Ưu tiên vừa'}{' '}
                                    · {formatDate(task.dueDate)}
                                    {task.assignee && ` · 👤 ${task.assignee}`}
                                    {(task.estimate && task.estimate !== '0h') || (task.actual && task.actual !== '0h') ? (
                                      <>
                                        {' '}
                                        · <Clock3 size={11} /> {task.actual && task.actual !== '0h' ? `${task.actual}/` : ''}
                                        {task.estimate || '0h'}
                                      </>
                                    ) : null}
                                  </span>
                                  {(task.subtasksTotal > 0 || depNames.length > 0) && (
                                    <div className="task-meta-pills">
                                      {task.subtasksTotal > 0 && (
                                        <button
                                          type="button"
                                          className="subtask-pill"
                                          disabled={itemBusyId === task.id}
                                          title="Nhấn để tăng tiến độ subtask"
                                          onClick={() => void incrementSubtask(project.id, task)}
                                        >
                                          ✓ {task.subtasksDone}/{task.subtasksTotal} bước nhỏ
                                        </button>
                                      )}
                                      {depNames.length > 0 && (
                                        <span className="dep-pill" title={`Phụ thuộc: ${depNames.join(', ')}`}>
                                          <GitBranch size={11} /> Phụ thuộc: {depNames.join(', ')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span
                                  className={`task-due-state ${remaining !== null && remaining < 0 && !done ? 'overdue' : remaining === 1 && !done ? 'due-soon' : ''}`}
                                >
                                  {done
                                    ? 'Hoàn thành'
                                    : remaining === null
                                      ? 'Chưa đặt hạn'
                                      : remaining < 0
                                        ? `Trễ ${Math.abs(remaining)} ngày`
                                        : remaining === 0
                                          ? 'Đến hạn hôm nay'
                                          : remaining === 1
                                            ? 'Còn 1 ngày'
                                            : `Còn ${remaining} ngày`}
                                </span>
                                <button
                                  className="icon-button"
                                  type="button"
                                  aria-label="Sửa task"
                                  onClick={() => beginEditTask(task)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  className="icon-button task-delete"
                                  type="button"
                                  disabled={itemBusyId === task.id}
                                  aria-label="Xóa task"
                                  onClick={() => void deleteTask(project.id, task)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="task-empty">
                      {tasks.length
                        ? 'Không có task nào khớp bộ lọc hiện tại.'
                        : 'Chưa có task. Thêm công việc đầu tiên cho dự án này.'}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
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
