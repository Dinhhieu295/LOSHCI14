import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Paperclip, Send, X } from 'lucide-react';
import { api, assistantProviders, supportsAssistantPdf, uploadWorkspaceFile, type AiProvider, type AssistantStatus } from './api';
import { timeLabel, weekdays } from './studyPlanning';

type Source = { title: string; href: string };
type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[]; model?: string; steps?: { tool: string; status: string }[] };
export type AssistantScope = { kind: 'course' | 'project'; id: string; title: string };
type Change = {
  id: string;
  resource: string;
  resourceKey: string;
  target: string;
  operation: 'create' | 'update' | 'delete' | 'plan';
  details: Record<string, unknown>;
  before?: Record<string, unknown>;
  impact?: string[];
  steps?: { key: string; operation: 'create' | 'update' | 'delete'; resource: string; target: string; details: Record<string, unknown>; dependsOn?: string[]; before?: Record<string, unknown>; impact?: string[] }[];
};

const operations = { create: 'Thêm', update: 'Cập nhật', delete: 'Xóa', plan: 'Thực hiện' };
const toolLabels: Record<string, string> = { read_lifeos: 'Đọc dữ liệu', search_lifeos: 'Tìm mục liên quan', get_lifeos_overview: 'Tổng hợp công việc',
  get_lifeos_workspace: 'Đọc ngữ cảnh môn học hoặc dự án',
  get_lifeos_agenda: 'Tra lịch và hạn chót', find_free_slots: 'Tính giờ trống', preview_lifeos_schedule: 'Xếp lịch dự kiến',
  calculate_lifeos_grades: 'Tính điểm học tập', open_lifeos_item: 'Tìm liên kết', get_lifeos_help: 'Tra hướng dẫn',
  get_lifeos_timer: 'Tra thời gian làm việc', read_lifeos_file: 'Đọc tài liệu', describe_lifeos_change: 'Kiểm tra yêu cầu thay đổi',
  propose_lifeos_change: 'Soạn đề xuất', propose_lifeos_plan: 'Soạn kế hoạch', propose_attachment_upload: 'Chuẩn bị lưu tài liệu' };
const labels: Record<string, string> = {
  title: 'Tên', name: 'Tên môn', code: 'Mã môn', instructor: 'Giảng viên', credits: 'Tín chỉ', semester: 'Học kỳ',
  description: 'Mô tả', status: 'Trạng thái', priority: 'Mức ưu tiên', progress: 'Tiến độ', score10: 'Điểm hệ 10',
  date: 'Ngày', dueDate: 'Hạn chót', deadline: 'Hạn nộp', startDate: 'Ngày bắt đầu', endDate: 'Ngày kết thúc',
  start: 'Giờ bắt đầu', end: 'Giờ kết thúc', startTime: 'Giờ bắt đầu', endTime: 'Giờ kết thúc', weekday: 'Thứ',
  location: 'Địa điểm', room: 'Phòng', fixedSlot: 'Khung giờ', estimate: 'Thời lượng dự kiến', isDone: 'Đã hoàn thành',
  category: 'Loại công việc', durationMinutes: 'Số phút', courseId: 'Môn học', taskId: 'Công việc',
  blocks: 'Phiên làm việc', windows: 'Khung giờ rảnh', preference: 'Phản hồi', fullName: 'Họ tên', dob: 'Ngày sinh',
  avatarUrl: 'Ảnh đại diện', phone: 'Điện thoại', bio: 'Giới thiệu', note: 'Ghi chú', content: 'Nội dung',
  workspaceKind: 'Không gian', workspaceId: 'Mục lưu', workKind: 'Loại công việc', sessionId: 'Phiên bấm giờ',
  switchFrom: 'Phiên cần chuyển', estimatedTime: 'Thời lượng dự kiến', gradeComponents: 'Đầu điểm', weight: 'Tỷ trọng (%)',
  dependencies: 'Phụ thuộc', absences: 'Số buổi nghỉ', trackedSeconds: 'Thời gian ghi nhận',
};

function fieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Để trống';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if ((key === 'start' || key === 'end') && typeof value === 'number') return timeLabel(value);
  if (key === 'weekday' && typeof value === 'number') return weekdays[value - 1] ?? String(value);
  if (key === 'category') return value === 'employment' ? 'Việc làm hằng tuần' : 'Việc cá nhân';
  if (key === 'workKind') return value === 'assignment' ? 'Bài tập' : 'Công việc';
  if (key === 'workspaceKind') return value === 'course' ? 'Môn học' : 'Dự án';
  if (typeof value === 'string' && /^\$[a-z][a-z0-9_]*\.id$/.test(value)) return `Kết quả bước ${value.slice(1, -3)}`;
  if (Array.isArray(value)) return value.map((item) => fieldValue(key, item)).join('\n') || 'Trống';
  if (typeof value === 'object') return Object.entries(value).map(([field, item]) => `${labels[field] ?? field} ${fieldValue(field, item)}`).join(' · ');
  return String(value);
}

const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Thao tác chưa thành công. Bạn hãy thử lại.';
const textMimeTypes: Record<string, string> = { txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json' };
const attachmentMime = (file: File) => textMimeTypes[file.name.split('.').at(-1)?.toLowerCase() ?? ''] ?? file.type;

function filePayload(file: File) {
  return new Promise<{ name: string; mimeType: string; data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: attachmentMime(file), data: String(reader.result).split(',')[1] ?? '' });
    reader.onerror = () => reject(new Error('Không đọc được tệp.'));
    reader.readAsDataURL(file);
  });
}

export default function LifeOsAssistant({ scope, onSettings, onApplied }: {
  scope?: AssistantScope;
  onSettings: () => void;
  onApplied: (resource: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [configured, setConfigured] = useState<boolean>();
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [messages, setMessages] = useState<Message[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [activeChange, setActiveChange] = useState<string>();
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState<File>();
  const [sentFile, setSentFile] = useState<File>();
  const [savedFile, setSavedFile] = useState<File>();
  const [savingFile, setSavingFile] = useState(false);
  const workspacePath = scope?.kind === 'course' ? `/study/courses/${scope.id}` : scope ? `/projects/${scope.id}` : undefined;
  const selectedFile = attachment ?? sentFile;
  const historyPath = scope ? `/assistant/history?${new URLSearchParams({ kind: scope.kind, id: scope.id })}` : '/assistant/history';

  useEffect(() => {
    if (dialog.current?.open) end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, changes, busy, error]);

  const open = () => {
    dialog.current?.showModal();
    setError('');
    setLoadingChat(true);
    void Promise.all([api<AssistantStatus>('/assistant/status'), api<{ messages: Message[]; changes?: Change[] }>(historyPath)])
      .then(([{ configured, provider }, history]) => {
        setConfigured(configured);
        setProvider(provider ?? 'openai');
        setMessages(history.messages);
        setChanges(history.changes ?? []);
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setLoadingChat(false));
  };

  const goToSettings = () => {
    dialog.current?.close();
    onSettings();
  };

  async function clearHistory() {
    if (!window.confirm('Xóa lịch sử cuộc trò chuyện này?')) return;
    setLoadingChat(true);
    setError('');
    try {
      await api(historyPath, { method: 'DELETE' });
      setMessages([]);
      setSentFile(undefined);
    } catch (reason) {
      setError(errorText(reason));
    } finally { setLoadingChat(false); }
  }

  function selectFile(file: File | undefined) {
    if (!file) return;
    const mimeType = attachmentMime(file);
    if (Object.values(textMimeTypes).includes(mimeType) && file.size > 80000) {
      setError('Tệp văn bản gửi trợ lý tối đa 80 KB.');
      return;
    }
    if (!supportsAssistantPdf(provider) && file.type === 'application/pdf') {
      setError('Hãy chọn ảnh PNG hoặc JPG của trang PDF cần đọc.');
      return;
    }
    if (!['application/pdf', 'image/png', 'image/jpeg', ...Object.values(textMimeTypes)].includes(mimeType) ||
      file.size === 0 || file.size > 6 * 1024 * 1024 || file.name.length > 180) {
      setError('Chọn PDF, PNG, JPG tối đa 6 MB hoặc TXT, MD, CSV, JSON tối đa 80 KB.');
      return;
    }
    setError('');
    setAttachment(file);
  }

  async function saveToWorkspace(file: File) {
    if (!workspacePath || savingFile) return;
    setSavingFile(true);
    setError('');
    try {
      await uploadWorkspaceFile(workspacePath, file);
      setSavedFile(file);
      window.dispatchEvent(new CustomEvent('lifeos:workspace-files', { detail: workspacePath }));
    } catch (reason) {
      setError(errorText(reason));
    } finally { setSavingFile(false); }
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = question.trim() || (attachment ? 'Đọc và tóm tắt tài liệu này.' : '');
    if (!content || !configured || loadingChat || busy || activeChange) return;
    const next = [...messages, { role: 'user', content } satisfies Message];
    const display = attachment ? [...messages, { role: 'user', content: `[${attachment.name}]\n${content}` } satisfies Message] : next;
    setMessages(display);
    setQuestion('');
    setError('');
    setBusy(true);
    try {
      const result = await api<{ reply: string; changes: Change[]; sources?: Source[]; steps?: Message['steps']; model?: string }>('/assistant/chat', { method: 'POST', body: JSON.stringify({
        messages: next.slice(-12).map((message) => ({ role: message.role, content: message.content.slice(0, 4000) })),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        scope: scope ? { kind: scope.kind, id: scope.id } : undefined,
        file: attachment ? await filePayload(attachment) : undefined,
      }) });
      setMessages([...display, { role: 'assistant', content: result.reply, sources: result.sources, steps: result.steps, model: result.model }]);
      if (attachment) {
        setSentFile(attachment);
        setAttachment(undefined);
      }
      setChanges((previous) => [...previous, ...result.changes]);
    } catch (reason) {
      setError(errorText(reason));
      setMessages(messages);
      setQuestion(content);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (change: Change, apply: boolean) => {
    if (activeChange || busy) return;
    setActiveChange(change.id);
    setError('');
    const summary = [operations[change.operation], change.resource, change.target].filter(Boolean).join(' · ');
    try {
      const route = `/assistant/changes/${change.id}`;
      const result = await api<{ resources?: string[] } | undefined>(apply ? `${route}/apply` : route, { method: apply ? 'POST' : 'DELETE' });
      setMessages((previous) => [...previous, { role: 'assistant', content: `${apply ? 'Đã thực hiện' : 'Đã bỏ đề xuất'} “${summary}”.` }]);
      if (apply) {
        for (const resource of result?.resources ?? [change.resourceKey]) onApplied(resource);
        window.dispatchEvent(new CustomEvent('lifeos:assistant-applied', { detail: { resources: result?.resources ?? [change.resourceKey] } }));
      }
      setChanges((previous) => previous.filter((item) => item.id !== change.id));
    } catch (reason) {
      setError(`${summary}. ${errorText(reason)}`);
    } finally {
      setActiveChange(undefined);
    }
  };

  return <>
    <button type="button" className="icon-button assistant-launch" aria-label="Mở trợ lý LifeOS" title="Trợ lý LifeOS" onClick={open}>
      <Bot size={20} /><span>Trợ lý</span>
    </button>
    <dialog className="lifeos-assistant" ref={dialog} aria-labelledby="assistant-title">
      <div className="assistant-layout">
        <header className="assistant-header">
          <div>
            <h2 id="assistant-title"><Bot size={22} /> Trợ lý LifeOS</h2>
            <p className="assistant-context">{scope?.title ?? 'Chat chung'}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Đóng trợ lý" onClick={() => dialog.current?.close()}><X size={19} /></button>
        </header>
        <div className="assistant-scroll">
          {loadingChat && <p role="status">Đang tải cuộc trò chuyện…</p>}
          {!loadingChat && configured === false && <div className="assistant-welcome">
            <p>Chọn kết nối AI để bắt đầu.</p>
            <button type="button" className="soft-button" onClick={goToSettings}>Mở Cài đặt AI</button>
          </div>}
          {configured && !loadingChat && !messages.length && <div className="assistant-welcome">
            <div className="assistant-actions">
              <button type="button" className="soft-button" onClick={() => setQuestion(scope ? 'Mục này có việc nào cần ưu tiên?' : 'Hôm nay mình nên làm gì trước?')}>
                Việc cần ưu tiên
              </button>
              <button type="button" className="soft-button" onClick={() => setQuestion('Giúp mình xếp lịch dựa trên giờ rảnh và các việc sắp đến hạn.')}>
                Xếp lịch
              </button>
            </div>
          </div>}
          <div role="log" aria-label="Cuộc trò chuyện">
            {messages.map((message, index) => <div key={index} className="assistant-message-group">
              <p className="assistant-message" data-role={message.role}>{message.content}</p>
              {message.sources?.length ? <nav className="assistant-sources" aria-label="Nguồn dữ liệu">
                {message.sources.filter((source) => /^\/(projects|study|work|calendar|overview|settings)(\?|$)/.test(source.href)).map((source) =>
                  <a key={source.href} href={source.href} onClick={() => dialog.current?.close()}>{source.title}</a>)}
              </nav> : null}
              {message.steps?.length ? <details className="assistant-tool-summary"><summary>Đã kiểm tra {message.steps.length} bước</summary>
                <ul>{message.steps.map((step, stepIndex) => <li key={stepIndex}>{toolLabels[step.tool] ?? 'Xử lý yêu cầu'}{step.status === 'error' ? ' · Cần bổ sung hoặc thử lại' : ' · Xong'}</li>)}</ul>
              </details> : null}
            </div>)}
          </div>
          {changes.map((change) => <section key={change.id} className="assistant-draft" aria-label="Đề xuất thay đổi">
            <h3>{operations[change.operation]} {change.resource.toLowerCase()}</h3>
            {change.target && <p>{change.target}</p>}
            {change.impact?.map((impact, index) => <p className="assistant-impact" key={index}>{impact}</p>)}
            {change.steps && <ol className="assistant-plan-steps">{change.steps.map((step) => <li key={step.key}>
              <strong>{operations[step.operation]} · {step.target || step.resource}</strong>
              {step.dependsOn?.length ? <p>Sau bước {step.dependsOn.map((key) => (change.steps?.findIndex((item) => item.key === key) ?? 0) + 1).join(', ')}</p> : null}
              <ChangeDetails details={step.details} before={step.before} />
              {step.impact?.map((impact, index) => <p key={index}>{impact}</p>)}
            </li>)}</ol>}
            {Object.keys(change.details).length > 0 && <dl>{Object.entries(change.details).map(([field, value]) => <div key={field}>
              <dt>{labels[field] ?? field}</dt><dd>{change.before && field in change.before ? <><del>{fieldValue(field, change.before[field])}</del> → </> : null}{fieldValue(field, value)}</dd>
            </div>)}</dl>}
            <div className="assistant-actions">
              <button type="button" className="primary-button" disabled={busy || Boolean(activeChange)} onClick={() => void resolve(change, true)}>
                {change.operation === 'delete' ? 'Xác nhận xóa' : change.operation === 'plan' ? 'Áp dụng kế hoạch' : 'Áp dụng'}
              </button>
              <button type="button" className="soft-button" disabled={busy || Boolean(activeChange)} onClick={() => void resolve(change, false)}>Bỏ qua</button>
            </div>
          </section>)}
          {(busy || activeChange) && <p role="status">{busy ? 'Trợ lý đang xử lý…' : 'Đang lưu…'}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div ref={end} />
        </div>
        {configured && !loadingChat && <form className="assistant-compose" onSubmit={(event) => void send(event)}>
          <label htmlFor="assistant-question" className="assistant-label">Yêu cầu của bạn</label>
          <div>
            <textarea id="assistant-question" value={question} rows={2} maxLength={4000} onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ví dụ: Xếp 2 tiếng làm slide trước thứ Sáu."
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); event.currentTarget.form?.requestSubmit();
              } }} />
            <input ref={fileInput} type="file" hidden
              accept={`${supportsAssistantPdf(provider) ? 'application/pdf,' : ''}image/png,image/jpeg,.txt,.md,.csv,.json`} aria-label="Chọn tệp cho trợ lý"
              onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ''; }} />
            <button className="icon-button" type="button" disabled={busy || Boolean(activeChange)} aria-label="Đính kèm tệp"
              onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button>
            <button className="primary-button" type="submit" disabled={busy || Boolean(activeChange) || (!question.trim() && !attachment)}
              aria-label="Gửi yêu cầu"><Send size={17} /></button>
          </div>
          {selectedFile && <div className="assistant-attachment">
            <span>{selectedFile.name}</span>
            {workspacePath && <button type="button" className="text-button" disabled={savingFile || selectedFile === savedFile}
              onClick={() => void saveToWorkspace(selectedFile)}>
              {selectedFile === savedFile ? 'Đã lưu vào Tài liệu' : 'Lưu vào Tài liệu'}
            </button>}
            {attachment && <button type="button" className="icon-button" title="Gỡ tệp đính kèm" aria-label="Gỡ tệp đính kèm"
              disabled={busy || savingFile} onClick={() => setAttachment(undefined)}><X size={14} /></button>}
          </div>}
          {messages.length > 0 && !busy && !activeChange && !changes.length && (
            <button type="button" className="text-button assistant-clear-history" onClick={() => void clearHistory()}>Xóa lịch sử chat</button>
          )}
          <small>Yêu cầu và dữ liệu cần thiết để xử lý sẽ được gửi tới {assistantProviders[provider]}.</small>
        </form>}
      </div>
    </dialog>
  </>;
}

function ChangeDetails({ details, before }: { details: Record<string, unknown>; before?: Record<string, unknown> }) {
  return <dl>{Object.entries(details).map(([field, value]) => <div key={field}>
    <dt>{labels[field] ?? field}</dt><dd>{before && field in before ? <><del>{fieldValue(field, before[field])}</del> → </> : null}{fieldValue(field, value)}</dd>
  </div>)}</dl>;
}
