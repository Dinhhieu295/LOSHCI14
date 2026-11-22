import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { CalendarTime, ScheduleItem } from './api';
import { parseTimeRange, timeLabel } from './studyPlanning';

export function CalendarDialog({ title, busy = false, wide = false, onClose, children }: {
  title: string;
  busy?: boolean;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="calendar-dialog planning-page" data-wide={wide || undefined} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="planning-section-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" disabled={busy} aria-label="Đóng" onClick={onClose}><X size={18} /></button>
      </div>
      {children}
    </dialog>
  );
}

export function TaskSlotEditor({ title, initial, busy, done, errorMessage, onClose, onSave, onReturn, onOpenTask }: {
  title: string;
  initial: CalendarTime;
  busy: boolean;
  done: boolean;
  errorMessage: string;
  onClose: () => void;
  onSave: (target: CalendarTime) => Promise<boolean>;
  onReturn?: () => void;
  onOpenTask: () => void;
}) {
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(timeLabel(initial.start));
  const [length, setLength] = useState(String(initial.end - initial.start));
  const [error, setError] = useState('');
  const firstMinute = parseTimeRange(start)?.[0];
  const end = firstMinute === undefined ? 0 : firstMinute + Number(length);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (firstMinute === undefined || !date || end > 1440 || end - firstMinute < 15) {
      setError('Phiên làm việc phải từ 15 phút và kết thúc trong ngày đã chọn.');
      return;
    }
    setError('');
    void onSave({ date, start: firstMinute, end });
  }
  return (
    <CalendarDialog title={title} busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="calendar-editor">
        <fieldset disabled={busy || done} className="calendar-editor-fields">
          <label className="planning-field">Ngày làm việc <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="planning-field">Giờ bắt đầu <input type="time" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="planning-field">Thời lượng (phút) <input type="number" min="15" max="1440" required value={length} onChange={(event) => setLength(event.target.value)} /></label>
          {end > 0 && end <= 1440 && <p>Kết thúc lúc {timeLabel(end)}</p>}
        </fieldset>
        {(error || errorMessage) && <p className="form-error" role="alert">{error || errorMessage}</p>}
        <div className="planning-actions">
          {!done && <button className="primary-button" disabled={busy}>Lưu phiên</button>}
          {onReturn && <button type="button" className="soft-button" disabled={busy} onClick={onReturn}>Trả về hàng đợi</button>}
          <button type="button" className="soft-button" disabled={busy} onClick={onOpenTask}>Mở công việc</button>
        </div>
      </form>
    </CalendarDialog>
  );
}

export type PersonalDraft = Pick<ScheduleItem, 'title' | 'date' | 'time' | 'color'>;

export function PersonalEventEditor({ initial, date, busy, errorMessage, onClose, onSave, onDelete, checkConflict }: {
  initial?: ScheduleItem;
  date: string;
  busy: boolean;
  errorMessage: string;
  onClose: () => void;
  onSave: (draft: PersonalDraft, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  checkConflict: (time: CalendarTime, ignoreId?: string) => string | undefined;
}) {
  const [draft, setDraft] = useState<PersonalDraft>(initial ?? { title: '', date, time: '', color: '#8a62ae' });
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const range = parseTimeRange(draft.time);
  const conflict = range && checkConflict({ date: draft.date, start: range[0], end: range[1] }, initial?.id);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !range) {
      setError(!draft.title.trim() ? 'Tên sự kiện không được để trống.' : 'Khung giờ không hợp lệ. Giờ kết thúc phải sau giờ bắt đầu.');
      return;
    }
    setError('');
    void onSave({ ...draft, title: draft.title.trim(), time: draft.time.trim() }, initial?.id);
  };
  return (
    <CalendarDialog title={initial ? 'Sửa sự kiện cá nhân' : 'Thêm sự kiện cá nhân'} busy={busy} onClose={onClose}>
      <form className="calendar-editor" onSubmit={save}>
        <fieldset disabled={busy} className="calendar-editor-fields">
          <label className="planning-field">Tên sự kiện <input autoFocus required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="planning-field">Ngày <input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
          <label className="planning-field">Khung giờ (HH:MM - HH:MM) <input required maxLength={32} placeholder="14:00 - 16:00" value={draft.time} onChange={(event) => {
            setDraft({ ...draft, time: event.target.value });
            setError('');
          }} /></label>
          <label className="planning-field calendar-color">Màu sự kiện <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#8a62ae'} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label>
        </fieldset>
        {conflict && <p className="schedule-conflict-banner" role="status">Cảnh báo trùng lịch với {conflict}. Bạn có thể đổi giờ hoặc lưu sự kiện.</p>}
        {(error || errorMessage) && <p className="form-error" role="alert">{error || errorMessage}</p>}
        {confirmDelete && <p role="status">Xóa sự kiện này khỏi lịch trình?</p>}
        <div className="planning-actions">
          <button className="primary-button" disabled={busy}>{initial ? 'Lưu sự kiện' : 'Thêm vào lịch'}</button>
          {initial && <button type="button" className="soft-button" disabled={busy} onClick={() => {
            if (confirmDelete) void onDelete(initial.id);
            else setConfirmDelete(true);
          }}>{confirmDelete ? 'Xác nhận xóa' : 'Xóa sự kiện'}</button>}
          <button type="button" className="soft-button" disabled={busy} onClick={onClose}>Hủy</button>
        </div>
      </form>
    </CalendarDialog>
  );
}
