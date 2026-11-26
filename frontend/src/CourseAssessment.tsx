import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, ScanText } from 'lucide-react';
import { api, type Course, type CourseGradeComponent } from './api';
import { CourseGradeTarget, type GradeDraft } from './CourseGradeTarget';
import { calculateCourseScore, courseLetterGrade } from './studyPlanning';
import { normalizeGradeName, SlideGradeImport } from './SlideGradeImport';

const maxComponents = 100;
const maxAbsences = 2147483647;
const formatScore = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function CourseAssessment({ course, onSaved, children }: {
  course: Course;
  onSaved: () => Promise<void>;
  children: ReactNode;
}) {
  const gradePanelId = useId();
  const [showGrades, setShowGrades] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [rows, setRows] = useState<GradeDraft[]>(() => (course.gradeComponents ?? []).map((component) => ({
    name: component.name,
    score10: component.score10 == null ? '' : String(component.score10),
    weight: String(component.weight),
  })));
  const [countInput, setCountInput] = useState(String(rows.length));
  const [savedCount, setSavedCount] = useState(rows.length);
  const [savedAbsences, setSavedAbsences] = useState(course.absences ?? null);
  const [absences, setAbsences] = useState(course.absences == null ? '' : String(course.absences));
  const [savingAbsences, setSavingAbsences] = useState(false);
  const [savingGrades, setSavingGrades] = useState(false);
  const [absenceError, setAbsenceError] = useState('');
  const [gradeError, setGradeError] = useState('');
  const [gradeStatus, setGradeStatus] = useState<'idle' | 'editing' | 'saved'>('idle');
  const externalUpdate = useRef(false);
  useEffect(() => {
    const applied = (event: Event) => {
      if ((event as CustomEvent<{ resources?: string[] }>).detail?.resources?.includes('courses')) externalUpdate.current = true;
    };
    window.addEventListener('lifeos:assistant-applied', applied);
    return () => window.removeEventListener('lifeos:assistant-applied', applied);
  }, []);
  useEffect(() => {
    if (!externalUpdate.current) return;
    externalUpdate.current = false;
    const components = course.gradeComponents ?? [];
    setRows(components.map((item) => ({ name: item.name, score10: item.score10 == null ? '' : String(item.score10), weight: String(item.weight) })));
    setCountInput(String(components.length));
    setSavedCount(components.length);
    setAbsences(course.absences == null ? '' : String(course.absences));
    setSavedAbsences(course.absences ?? null);
    setGradeStatus('idle');
    setGradeError('');
  }, [course.updatedAt, course.gradeComponents, course.absences]);

  const count = Number(countInput);
  const countIsValid = countInput !== '' && Number.isInteger(count) && count >= 0 && count <= maxComponents;
  const activeRows = rows.slice(0, countIsValid ? count : 0);
  const gradeComponents: CourseGradeComponent[] = activeRows.map((row) => ({
    name: row.name.trim(),
    score10: row.score10 === '' ? null : Number(row.score10),
    weight: Number(row.weight),
  }));
  const totalWeight = gradeComponents.reduce((sum, row) => sum + row.weight, 0);
  const score = activeRows.every(({ weight }) => weight !== '') ? calculateCourseScore(gradeComponents) : null;
  const letter = courseLetterGrade(score);
  const path = `/study/courses/${course.id}`;

  function changeCount(value: string) {
    setCountInput(value);
    setGradeError('');
    setGradeStatus('editing');
    const nextCount = Number(value);
    if (Number.isInteger(nextCount) && nextCount > rows.length && nextCount <= maxComponents) {
      setRows((current) => current.concat(Array.from(
        { length: nextCount - current.length },
        () => ({ name: '', score10: '', weight: '' }),
      )));
    }
  }

  function changeGrade(index: number, field: keyof GradeDraft, value: string) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, [field]: value } : row));
    setGradeError('');
    setGradeStatus('editing');
  }

  async function saveAbsences(input: HTMLInputElement) {
    if (!input.validity.valid) {
      setAbsenceError('Nhập số buổi nghỉ là số nguyên từ 0 trở lên.');
      return;
    }
    const value = input.value === '' ? null : input.valueAsNumber;
    if (value === savedAbsences || savingAbsences) return;

    setSavingAbsences(true);
    setAbsenceError('');
    try {
      await api(path, { method: 'PATCH', body: JSON.stringify({ absences: value }) });
      setSavedAbsences(value);
      setAbsences(value == null ? '' : String(value));
      void onSaved().catch(() => undefined);
    } catch (error) {
      setAbsenceError(error instanceof Error ? error.message : 'Không lưu được số buổi nghỉ.');
    } finally {
      setSavingAbsences(false);
    }
  }

  async function saveGrades(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingGrades) return;
    if (!countIsValid) return;
    if (activeRows.some((row) => !row.name.trim())) {
      setGradeError('Nhập tên cho từng đầu điểm.');
      return;
    }
    if (activeRows.length && Math.abs(totalWeight - 100) >= 0.000001) {
      setGradeError('Tổng tỷ trọng các đầu điểm phải bằng 100%.');
      return;
    }

    setSavingGrades(true);
    setGradeError('');
    try {
      await api(path, { method: 'PATCH', body: JSON.stringify({ gradeComponents }) });
      setSavedCount(activeRows.length);
      setRows(activeRows);
      setGradeStatus('saved');
      void onSaved().catch(() => undefined);
    } catch (error) {
      setGradeError(error instanceof Error ? error.message : 'Không lưu được các đầu điểm.');
    } finally {
      setSavingGrades(false);
    }
  }

  return <>
    <dl className="course-overview-metrics" aria-label="Chỉ số môn học">
      <div>
        <dt>Điểm tổng</dt>
        <dd aria-live="polite">
          {score == null
            ? (activeRows.length ? 'Chưa đủ điểm' : 'Chưa có đầu điểm')
            : `${formatScore.format(score)}/10`}
          {letter && <small>{letter}</small>}
          {gradeStatus === 'editing' && <small>Chưa lưu</small>}
        </dd>
        <dd className="course-assessment-control">
          <button type="button" className="course-grade-toggle" aria-expanded={showGrades} aria-controls={gradePanelId}
            onClick={() => setShowGrades((open) => !open)}>
            Đầu điểm{activeRows.length > 0 && ` (${activeRows.length})`} <ChevronDown size={14} aria-hidden="true" />
          </button>
        </dd>
      </div>
      <div>
        <dt>Số buổi nghỉ</dt>
        <dd className="course-assessment-control">
          <label>
            <input type="number" min="0" max={maxAbsences} step="1" aria-label="Số buổi nghỉ" placeholder="Chưa ghi"
              value={absences} disabled={savingAbsences} aria-invalid={Boolean(absenceError)}
              onChange={(event) => { setAbsences(event.target.value); setAbsenceError(''); }}
              onBlur={(event) => void saveAbsences(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }} />
            buổi
          </label>
          {absenceError && <span className="form-error" role="alert">{absenceError}</span>}
        </dd>
      </div>
      {children}
    </dl>
    <div id={gradePanelId} className="course-grade-panel" hidden={!showGrades}>
      <div className="course-assessment-control">
        <div className="course-grade-panel-tools"><label>Số đầu điểm
          <input type="number" min="0" max={maxComponents} step="1" value={countInput} disabled={savingGrades}
            aria-invalid={!countIsValid && countInput !== ''} onChange={(event) => changeCount(event.target.value)} />
        </label>
          <button type="button" className="soft-button" disabled={savingGrades} onClick={() => setShowImport(true)}>
            <ScanText size={15} aria-hidden="true" /> Lấy tỷ trọng từ slide
          </button>
        </div>
        {!countIsValid && countInput !== '' && <span className="form-error" role="alert">Nhập từ 0 đến {maxComponents} đầu điểm.</span>}
      </div>
      {countIsValid && (count > 0 || savedCount > 0) && (
        <form className="course-grade-editor" aria-label="Đầu điểm môn học" onSubmit={(event) => void saveGrades(event)}>
          {count > 0 && <>
            <div className="course-grade-row course-grade-head" aria-hidden="true">
              <span>Tên đầu điểm</span><span>Điểm / 10</span><span>Tỷ trọng (%)</span>
            </div>
            <div className="course-grade-rows">
              {activeRows.map((row, index) => (
                <div className="course-grade-row" key={index}>
                  <input required maxLength={120} aria-label={`Tên đầu điểm ${index + 1}`} value={row.name}
                    disabled={savingGrades} onChange={(event) => changeGrade(index, 'name', event.target.value)} />
                  <input type="number" min="0" max="10" step="any" aria-label={`Điểm ${index + 1}`} value={row.score10}
                    disabled={savingGrades} placeholder="—" onChange={(event) => changeGrade(index, 'score10', event.target.value)} />
                  <input type="number" min="0" max="100" step="any" required aria-label={`Tỷ trọng đầu điểm ${index + 1}`}
                    value={row.weight} disabled={savingGrades} onChange={(event) => changeGrade(index, 'weight', event.target.value)} />
                </div>
              ))}
            </div>
          </>}
          {gradeError && <p className="form-error" role="alert">{gradeError}</p>}
          <div className="course-grade-actions">
            <span>{count > 0 ? `Tổng tỷ trọng ${formatScore.format(totalWeight)}%` : 'Xóa các đầu điểm đã lưu'}</span>
            {gradeStatus === 'saved' && <span role="status">Đã lưu</span>}
            <button className="soft-button" type="submit" disabled={savingGrades}>{savingGrades ? 'Đang lưu…' : 'Lưu điểm'}</button>
          </div>
        </form>
      )}
    </div>
    {activeRows.length > 0 && <CourseGradeTarget rows={activeRows} totalWeight={totalWeight} />}
    {showImport && <SlideGradeImport courseId={course.id} onClose={() => setShowImport(false)} onUse={(imported) => {
      const previousScores = new Map(activeRows.map((row) => [normalizeGradeName(row.name), row.score10]));
      setRows(imported.map((row) => ({ ...row, score10: previousScores.get(normalizeGradeName(row.name)) ?? '' })));
      setCountInput(String(imported.length));
      setGradeStatus('editing');
      setGradeError('');
      setShowImport(false);
    }} />}
  </>;
}
