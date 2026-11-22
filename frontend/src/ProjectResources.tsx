import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, FileText, Play, Square, Trash2, Upload } from 'lucide-react';
import { api, downloadProjectFile, uploadWorkspaceFile, type ProjectFile, type ProjectTask, type ProjectTimerSession, type ProjectTimerState } from './api';

const fileLimit = 10 * 1024 * 1024;
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;
const fileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2
  ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

type WorkspaceScope = { projectId: string; courseId?: never } | { courseId: string; projectId?: never };

export function ProjectDocuments({ projectId, courseId, tasks, taskId, onOpenTask, onBusy }: WorkspaceScope & {
  tasks: ReadonlyArray<Pick<ProjectTask, 'id' | 'title'>>;
  taskId?: string;
  onOpenTask?: (taskId: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const path = courseId ? `/study/courses/${courseId}` : `/projects/${projectId}`;
  const itemLabel = courseId ? 'bài tập' : 'task';

  useEffect(() => {
    const abort = new AbortController();
    api<ProjectFile[]>(`${path}/files`, { signal: abort.signal })
      .then(setFiles).catch((reason: unknown) => {
        if (!abort.signal.aborted) setError(message(reason, 'Không tải được danh sách tài liệu.'));
      });
    return () => abort.abort();
  }, [path, attempt]);

  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail === path) setAttempt((value) => value + 1);
    };
    window.addEventListener('lifeos:workspace-files', refresh);
    return () => window.removeEventListener('lifeos:workspace-files', refresh);
  }, [path]);

  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setError('');
    setBusy(true);
    onBusy?.(true);
    try {
      await operation();
    } catch (reason) {
      setError(message(reason, 'Thao tác với tài liệu chưa thành công.'));
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selected.length === 0) return;
    void run(async () => {
      const failures: string[] = [];
      for (const file of selected) {
        try {
          if (file.size === 0 || file.size > fileLimit) throw new Error('Tệp phải có nội dung và tối đa 10 MB.');
          const destination = taskId ? `${path}/${courseId ? 'assignments' : 'tasks'}/${taskId}` : path;
          const result = await uploadWorkspaceFile(destination, file);
          setFiles((current) => [result, ...(current ?? [])]);
        } catch (reason) {
          failures.push(`${file.name} — ${message(reason, 'Tải lên thất bại.')}`);
        }
      }
      setError(failures.join('\n'));
    });
  };

  const remove = (file: ProjectFile) => {
    if (!window.confirm(`Xóa tài liệu “${file.name}”?`)) return;
    void run(async () => {
      await api(`${path}/files/${file.id}`, { method: 'DELETE' });
      setFiles((current) => current?.filter((item) => item.id !== file.id) ?? []);
    });
  };

  const visible = taskId ? files?.filter((file) => file.taskId === taskId) : files;
  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  return <div className="project-documents">
    <div className="project-upload">
      <input type="file" aria-label="Chọn tài liệu" multiple hidden ref={input} onChange={upload} />
      <button className="primary-button" type="button" disabled={busy || !files} onClick={() => input.current?.click()}>
        <Upload size={16} /> Tải tài liệu lên
      </button>
      <small>Tối đa 10 MB mỗi tệp</small>
    </div>
    {busy && <p role="status">Đang xử lý tài liệu…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!visible ? error ? <button className="soft-button" type="button" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Tải lại</button>
      : <p role="status">Đang tải tài liệu…</p>
      : visible.length === 0 ? <p className="project-section-empty">{taskId ? 'Chưa đính kèm tài liệu.' : `Tài liệu từ các ${itemLabel} sẽ xuất hiện ở đây.`}</p>
      : <ul className="project-file-list">
        {visible.map((file) => <li key={file.id}>
          <FileText size={19} />
          <div className="project-file-info">
            <strong>{file.name}</strong>
            <small>{fileSize(file.size)}{!taskId && file.taskId && titles.has(file.taskId) && <> · <button type="button" className="text-button"
              onClick={() => { if (file.taskId) onOpenTask?.(file.taskId); }}>{titles.get(file.taskId)}</button></>}</small>
          </div>
          <button type="button" className="icon-button" disabled={busy} title="Tải xuống" aria-label={`Tải xuống ${file.name}`}
            onClick={() => void run(() => downloadProjectFile(path, file))}><Download size={16} /></button>
          <button type="button" className="icon-button" disabled={busy} title="Xóa tài liệu" aria-label={`Xóa tài liệu ${file.name}`}
            onClick={() => remove(file)}><Trash2 size={16} /></button>
        </li>)}
      </ul>}
  </div>;
}

export const formatProjectTime = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  .map((part) => String(part).padStart(2, '0')).join(':');

export function ProjectTimer({ projectId, courseId, taskId, taskNames, onChanged }: WorkspaceScope & {
  taskId?: string;
  taskNames: ReadonlyMap<string, string>;
  onChanged: () => void;
}) {
  const [data, setData] = useState<ProjectTimerState | null>(null);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const path = courseId ? `/study/courses/${courseId}/timer` : `/projects/${projectId}/timer`;
  const itemLabel = courseId ? 'bài tập' : 'task';
  const scopeLabel = courseId ? 'môn học' : 'dự án';
  const projectActive = data?.active ?? null;
  const elsewhere = Boolean(taskId && projectActive && projectActive.taskId !== taskId);
  const active = elsewhere ? null : projectActive;
  const elapsed = active ? Math.max(0, Math.floor((now - Date.parse(active.startedAt)) / 1000)) : 0;
  const sessionTitle = (session: ProjectTimerSession) =>
    (session.taskId ? taskNames.get(session.taskId) : null) || session.taskTitle;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await api<ProjectTimerState>(taskId ? `${path}?taskId=${taskId}` : path, { signal });
      if (signal?.aborted) return;
      setData(result);
      setNow(Date.now());
      setError('');
    } catch (reason) {
      if (!signal?.aborted) setError(message(reason, 'Không tải được bộ bấm giờ.'));
    }
  }, [path, taskId]);

  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const toggle = async () => {
    if (busy || !data) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api<ProjectTimerSession>(`${path}/${active ? `${active.id}/stop` : 'start'}`, {
        method: 'POST',
        body: active ? undefined : JSON.stringify({ taskId: taskId ?? null, switchFrom: elsewhere ? projectActive?.id : undefined }),
      });
      setNow(Date.now());
      setData((current) => current && ({
        ...current,
        active: saved.stoppedAt ? null : saved,
        seconds: current.seconds + (active ? saved.durationSeconds ?? 0 : 0),
        sessions: [saved, ...current.sessions.filter((session) => session.id !== saved.id)].slice(0, 20),
      }));
      onChanged();
      await load();
    } catch (reason) {
      await load();
      onChanged();
      setError(message(reason, 'Không cập nhật được bộ bấm giờ.'));
    } finally {
      setBusy(false);
    }
  };

  return <div className="project-timer">
    {error && <p className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={() => void load()}>Tải lại</button></p>}
    {!data ? !error && <p role="status">Đang tải bộ bấm giờ…</p> : <>
      <div className="project-watch">
        <p>{elsewhere && projectActive ? `Đang bấm giờ cho ${sessionTitle(projectActive) ?? scopeLabel}`
          : active ? (taskId || !sessionTitle(active) ? 'Đang bấm giờ' : `Đang bấm giờ · ${sessionTitle(active)}`) : 'Sẵn sàng bắt đầu'}</p>
        <strong aria-label={`Thời gian phiên ${formatProjectTime(elapsed)}`}>{formatProjectTime(elapsed)}</strong>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void toggle()}>
          {active ? <><Square size={15} /> Dừng và lưu phiên</>
            : <><Play size={15} /> {elsewhere ? `Lưu phiên trước và chuyển sang ${itemLabel} này` : 'Bắt đầu bấm giờ'}</>}
        </button>
        <span>Tổng thời gian {taskId ? itemLabel : scopeLabel} <b>{formatProjectTime(data.seconds)}</b></span>
      </div>
      {data.sessions.some((session) => session.stoppedAt) && <section aria-label="Lịch sử bấm giờ">
        <h3>Phiên gần đây</h3>
        <ul className="project-timer-history">
          {data.sessions.filter((session) => session.stoppedAt).map((session) => <li key={session.id}>
            <div className="project-timer-entry">
              {!taskId && <span>{sessionTitle(session) ?? 'Thời gian chung'}</span>}
              <time dateTime={session.startedAt}>{new Date(session.startedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</time>
            </div>
            <strong>{formatProjectTime(session.durationSeconds ?? 0)}</strong>
          </li>)}
        </ul>
      </section>}
    </>}
  </div>;
}
