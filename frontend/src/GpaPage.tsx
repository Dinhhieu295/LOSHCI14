import { useState, type FormEvent } from 'react';
import { BarChart3, FlaskConical, Trash2 } from 'lucide-react';
import type { Course } from './api';
import { calculateGpa, gradePoints, gradeScale } from './studyPlanning';
import './planning.css';

const display = (value: number | null) => value === null
  ? '—'
  : value.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GpaPage({ courses, onOpenCourses }: { courses: Course[]; onOpenCourses: () => void }) {
  const [view, setView] = useState<'results' | 'scenario'>('results');
  const [semester, setSemester] = useState('');
  const [courseId, setCourseId] = useState('');
  const [score, setScore] = useState('');
  const [scenarios, setScenarios] = useState<Record<string, number>>({});
  const semesters = [...new Set(courses.map((course) => course.semester).filter(Boolean))];
  const selectedSemester = semesters.includes(semester) ? semester : '';
  const scoped = courses.filter((course) => !selectedSemester || course.semester === selectedSemester);
  const current = calculateGpa(scoped);
  const projected = calculateGpa(scoped, scenarios);
  const selected = scoped.find((course) => course.id === courseId && course.credits > 0);
  const changed = scoped.filter((course) => scenarios[course.id] !== undefined);
  const delta = current.value !== null && projected.value !== null
    ? Number((projected.value - current.value).toFixed(2))
    : null;

  const saveScenario = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !score.trim() || !Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 10) return;
    setScenarios((previous) => ({ ...previous, [selected.id]: Number(score) }));
    setScore('');
    setCourseId('');
  };

  return (
    <div className="planning-page">
      <header className="planning-heading">
        <h2 className="planning-title">Phân tích GPA</h2>
        <p>Xem điểm trung bình theo tín chỉ và thử các mức điểm dự kiến.</p>
      </header>
      <nav className="planning-nav" aria-label="Mục phân tích GPA">
        <button type="button" aria-pressed={view === 'results'} onClick={() => setView('results')}>
          <BarChart3 size={16} /> Kết quả
        </button>
        <button type="button" aria-pressed={view === 'scenario'} onClick={() => setView('scenario')}>
          <FlaskConical size={16} /> Thử kịch bản
        </button>
      </nav>
      {courses.length === 0 ? (
        <section className="panel planning-panel">
          <h2>Chưa có môn học</h2>
          <p>Thêm môn học, tín chỉ và điểm để LifeOS tính GPA.</p>
          <button className="primary-button" onClick={onOpenCourses}>Mở Môn học</button>
        </section>
      ) : (
        <>
          <div className="planning-field planning-semester">
            <label htmlFor="gpa-semester">Học kỳ</label>
            <select id="gpa-semester" value={selectedSemester} onChange={(event) => {
              setSemester(event.target.value);
              setCourseId('');
              setScore('');
            }}>
              <option value="">Tất cả học kỳ</option>
              {semesters.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div className="planning-metrics">
            <section className="panel planning-panel planning-metric">
              <h2>GPA hiện tại</h2>
              <strong>{display(current.value)} <small>/ 4</small></strong>
              <p>{current.credits} tín chỉ có điểm</p>
            </section>
            {view === 'scenario' && (
              <section className="panel planning-panel planning-metric" aria-live="polite">
                <h2>GPA dự kiến</h2>
                <strong>{display(projected.value)} <small>/ 4</small></strong>
                <p>{projected.credits} tín chỉ tính GPA{delta !== null && changed.length > 0 && ` · ${delta > 0 ? '+' : ''}${display(delta)} so với hiện tại`}</p>
              </section>
            )}
          </div>
          {view === 'results' ? (
            <section className="panel planning-panel">
              <div className="planning-section-head">
                <h2>Điểm từng môn</h2>
                <button type="button" className="soft-button" onClick={onOpenCourses}>Sửa điểm ở Môn học</button>
              </div>
              <ul className="planning-list">
                {scoped.map((course) => (
                  <li className="planning-row" key={course.id}>
                    <div>
                      <strong>{course.name}</strong>
                      <p>{[course.code, course.semester, `${course.credits} tín chỉ`].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="planning-pill">
                      {gradePoints(course.score10, course.grade) === null ? 'Chưa có điểm' : `${display(gradePoints(course.score10, course.grade))} / 4`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="panel planning-panel">
              <h2>Điểm giả định</h2>
              <p>Chọn một hoặc nhiều môn để đổi điểm trong kịch bản. Điểm đã lưu của môn học vẫn giữ nguyên.</p>
              <form className="planning-form" onSubmit={saveScenario}>
                <div className="planning-field">
                  <label htmlFor="scenario-course">Môn học</label>
                  <select id="scenario-course" required value={selected?.id ?? ''} onChange={(event) => {
                    setCourseId(event.target.value);
                    const previous = scenarios[event.target.value];
                    setScore(previous === undefined ? '' : String(previous));
                  }}>
                    <option value="">Chọn môn có tín chỉ</option>
                    {scoped.filter((course) => course.credits > 0).map((course) => (
                      <option key={course.id} value={course.id}>{course.name}{course.code ? ` (${course.code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <label className="planning-field">
                  Điểm dự kiến (0–10)
                  <input type="number" min="0" max="10" step="0.01" required value={score} onChange={(event) => setScore(event.target.value)} />
                </label>
                <button className="primary-button" disabled={!selected}>Áp dụng điểm</button>
              </form>
              {changed.length > 0 && (
                <ul className="planning-list">
                  {changed.map((course) => (
                    <li className="planning-row" key={course.id}>
                      <div><strong>{course.name}</strong><p>{scenarios[course.id]} / 10</p></div>
                      <button type="button" className="icon-button" aria-label={`Bỏ điểm giả định của ${course.name}`}
                        onClick={() => setScenarios(({ [course.id]: _removed, ...remaining }) => remaining)}>
                        <Trash2 size={17} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <details className="panel planning-panel planning-scale">
            <summary>Công thức và bảng quy đổi tham khảo</summary>
            <p>GPA là tổng (điểm hệ 4 × tín chỉ) chia cho tổng tín chỉ có điểm. LifeOS dùng điểm hệ 10 trước và dùng điểm chữ khi chưa có điểm hệ 10. Kết quả dùng để tham khảo.</p>
            <ul className="planning-chips">
              {gradeScale.map((band) => <li key={band.grade}>{band.minimum} trở lên: {band.grade} ({band.points})</li>)}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
