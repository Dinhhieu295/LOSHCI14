import { useState, type FormEvent } from 'react';
import type { AvailabilityWindow } from './api';
import { dateLabel, timeLabel, weekdays, type FreeDay } from './studyPlanning';

export default function CalendarAvailability({ days, windows, saving, onSave }: {
  days: FreeDay[];
  windows: AvailabilityWindow[];
  saving: boolean;
  onSave: (windows: AvailabilityWindow[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AvailabilityWindow[]>([]);
  const [error, setError] = useState('');
  const updateWindow = (weekday: number, field: 'start' | 'end', value: string) => {
    setDraft((previous) => previous.map((window) => window.weekday === weekday ? { ...window, [field]: value } : window));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = draft.find((window) => !window.start || !window.end || window.start >= window.end);
    if (invalid) {
      setError(`${weekdays[invalid.weekday - 1]}: giờ kết thúc phải sau giờ bắt đầu.`);
      return;
    }
    setError('');
    if (await onSave(draft)) setEditing(false);
  };

  return (
    <section className="planning-panel calendar-availability">
      <div className="planning-section-head">
        <div>
          <h2>{editing ? 'Khung giờ có thể học' : 'Giờ trống 7 ngày tới'}</h2>
          <p>{editing ? 'Chọn ngày và khung giờ bạn thường có thể dành cho việc học hoặc làm dự án.' : 'Khung giờ còn lại sau khi trừ lịch học, sự kiện cá nhân và phiên làm việc.'}</p>
        </div>
        {!editing && <button className="soft-button" onClick={() => { setDraft(windows); setError(''); setEditing(true); }}>Chỉnh khung giờ</button>}
      </div>
      {editing ? (
        <form onSubmit={(event) => void save(event)}>
          <div className="planning-days">
            {weekdays.map((label, index) => {
              const weekday = index + 1;
              const window = draft.find((item) => item.weekday === weekday);
              return (
                <fieldset className="planning-day" key={label} disabled={saving}>
                  <legend>{label}</legend>
                  <label className="planning-check">
                    <input type="checkbox" aria-label={`Có thể học ${label}`} checked={Boolean(window)} onChange={(event) => {
                      const enabled = event.target.checked;
                      setDraft((previous) => enabled
                        ? [...previous, { weekday, start: '07:00', end: '22:00' }]
                        : previous.filter((item) => item.weekday !== weekday));
                    }} /> Có thể học
                  </label>
                  {window && <div className="planning-day-times">
                    <label className="planning-field">Từ <input aria-label={`Bắt đầu ${label}`} type="time" required value={window.start} onChange={(event) => updateWindow(weekday, 'start', event.target.value)} /></label>
                    <label className="planning-field">Đến <input aria-label={`Kết thúc ${label}`} type="time" required value={window.end} onChange={(event) => updateWindow(weekday, 'end', event.target.value)} /></label>
                  </div>}
                </fieldset>
              );
            })}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="planning-actions">
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu khung giờ'}</button>
            <button type="button" className="soft-button" disabled={saving} onClick={() => setEditing(false)}>Hủy</button>
          </div>
        </form>
      ) : (
        <>
          <ul className="planning-list">
            {days.map((day) => (
              <li className="planning-row" key={day.date}>
                <strong>{dateLabel(day.date)}</strong>
                <div className="planning-chips">
                  {day.slots.length > 0
                    ? day.slots.map(([start, end]) => <span key={start}>{timeLabel(start)}–{timeLabel(end)}</span>)
                    : <p>{day.available ? 'Hết giờ trống' : 'Không đặt lịch học'}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
