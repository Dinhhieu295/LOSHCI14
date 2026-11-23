import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Upload } from 'lucide-react';
import { api, supportsAssistantPdf, type AssistantStatus } from './api';
import { CalendarDialog } from './CalendarEditors';

type SlideRow = { name: string; weight: number; page: number | null; excerpt: string };
type Extraction = { components: SlideRow[]; note: string };
type PreviewRow = Omit<SlideRow, 'weight'> & { weight: string };
const format = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function SlideGradeImport({ courseId, onClose, onUse }: {
  courseId: string;
  onClose: () => void;
  onUse: (rows: { name: string; weight: string }[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<PreviewRow[]>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imagesOnly, setImagesOnly] = useState(false);
  const total = (preview ?? []).reduce((sum, row) => sum + Number(row.weight), 0);
  const names = (preview ?? []).map((row) => normalizeGradeName(row.name));
  const valid = !!preview?.length && Math.abs(total - 100) < 0.000001 &&
    preview.every((row) => row.name.trim() && row.weight !== '' && Number(row.weight) >= 0 && Number(row.weight) <= 100) &&
    new Set(names).size === names.length;

  useEffect(() => {
    const controller = new AbortController();
    void api<AssistantStatus>('/assistant/status', { signal: controller.signal }).then((status) => {
      if (!controller.signal.aborted) setImagesOnly(!supportsAssistantPdf(status.provider));
    }).catch(() => { /* The extraction endpoint reports provider errors. */ });
    return () => controller.abort();
  }, []);

  async function extract(event: FormEvent) {
    event.preventDefault();
    if (!file || busy) return;
    setError('');
    setPreview(undefined);
    setNote('');
    if (imagesOnly && file.type === 'application/pdf') {
      setError('Hãy chọn ảnh PNG hoặc JPG của trang PDF cần đọc.');
      return;
    }
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0) {
      setError('Chọn tệp PDF, PNG hoặc JPG có nội dung và tối đa 8 MB.');
      return;
    }
    setBusy(true);
    try {
      const result = await api<Extraction>(`/assistant/grade-extraction?${new URLSearchParams({ courseId, filename: file.name })}`, {
        method: 'POST', headers: { 'Content-Type': file.type }, body: file,
      });
      setPreview(result.components.map((row) => ({ ...row, weight: String(row.weight) })));
      setNote(result.note);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa đọc được slide.');
    } finally { setBusy(false); }
  }

  return <CalendarDialog title="Lấy tỷ trọng từ slide" busy={busy} onClose={onClose}>
    <div className="slide-grade-import">
      <form className="planning-actions" onSubmit={(event) => void extract(event)}>
        <input ref={fileRef} type="file" accept={imagesOnly ? 'image/png,image/jpeg' : 'application/pdf,image/png,image/jpeg'}
          aria-label={imagesOnly ? 'Chọn ảnh slide' : 'Chọn PDF hoặc ảnh slide'}
          disabled={busy} hidden onChange={(event) => { setFile(event.target.files?.[0]); setPreview(undefined); setError(''); setNote(''); }} />
        <button type="button" className="soft-button" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={16} aria-hidden="true" /> {imagesOnly ? 'Chọn ảnh slide' : 'Chọn PDF hoặc ảnh'}
        </button>
        <span className="slide-file-name">{file?.name}</span>
        <button type="submit" className="primary-button" disabled={!file || busy}>{busy ? 'Đang đọc…' : 'Đọc slide'}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {preview?.length === 0 && <p role="status">Chưa tìm thấy bảng tỷ trọng trong tệp này.</p>}
      {note && <p className="slide-import-note">{note}</p>}
      {!!preview?.length && <>
        <div className="slide-import-rows">
          {preview.map((row, index) => <div key={index} className="slide-import-row">
            <label className="planning-field">Đầu điểm
              <input aria-label={`Tên từ slide ${index + 1}`} value={row.name} maxLength={120} onChange={(event) =>
                setPreview(preview.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
            </label>
            <label className="planning-field">Tỷ trọng (%)
              <input aria-label={`Tỷ trọng từ slide ${index + 1}`} type="number" min="0" max="100" step="any"
                value={row.weight} onChange={(event) => setPreview(preview.map((item, i) =>
                  i === index ? { ...item, weight: event.target.value } : item))} />
            </label>
            {(row.page || row.excerpt) && <small>{[row.page ? `Trang ${row.page}` : '', row.excerpt].filter(Boolean).join(' · ')}</small>}
          </div>)}
        </div>
        <div className="planning-actions">
          <span>Tổng tỷ trọng {format.format(total)}%</span>
          <button type="button" className="primary-button" disabled={!valid}
            onClick={() => onUse(preview.map(({ name, weight }) => ({ name: name.trim(), weight })))}>
            Đưa vào bảng điểm
          </button>
        </div>
        {!valid && <p className="slide-import-note">Điền tên riêng cho từng đầu điểm và chỉnh tổng tỷ trọng thành 100%.</p>}
      </>}
    </div>
  </CalendarDialog>;
}

export function normalizeGradeName(name: string) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
