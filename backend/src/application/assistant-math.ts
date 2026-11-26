// Pure rules shared with the UI. No model arithmetic is used for these results.
export type GradeComponent = { name: string; score10: number | null; weight: number };
export const normalizeText = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const gradeScale = [
  { minimum: 9, grade: 'A+', points: 4 }, { minimum: 8.5, grade: 'A', points: 4 },
  { minimum: 8, grade: 'B+', points: 3.5 }, { minimum: 7, grade: 'B', points: 3 },
  { minimum: 6.5, grade: 'C+', points: 2.5 }, { minimum: 5.5, grade: 'C', points: 2 },
  { minimum: 5, grade: 'D+', points: 1.5 }, { minimum: 4, grade: 'D', points: 1 }, { minimum: 0, grade: 'F', points: 0 },
];
const validScore = (value: number) => Number.isFinite(value) && value >= 0 && value <= 10;
const band = (score: number | null) => score !== null && validScore(score) ? gradeScale.find((entry) => score >= entry.minimum) : undefined;
export function calculateCourseScore(components: GradeComponent[]) {
  if (!components.length || Math.abs(components.reduce((sum, item) => sum + item.weight, 0) - 100) > 0.000001 ||
    components.some((item) => !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100 ||
      item.weight > 0 && (item.score10 === null || !validScore(item.score10)))) return null;
  return Math.round(components.reduce((sum, item) => sum + (item.score10 ?? 0) * item.weight, 0) + 1e-8) / 100;
}
export const courseLetterGrade = (score: number | null) => band(score)?.grade ?? null;
export function calculateGpa(courses: { score10: number | null; credits: number }[]) {
  let credits = 0;
  let weighted = 0;
  for (const course of courses) {
    const points = band(course.score10)?.points;
    if (points === undefined || course.credits <= 0) continue;
    credits += course.credits;
    weighted += course.credits * points;
  }
  return { value: credits ? weighted / credits : null, credits };
}
export function calculateGradeTarget(components: GradeComponent[], target: number, componentName?: string) {
  if (!validScore(target)) throw new Error('Điểm mục tiêu phải từ 0 đến 10.');
  if (!components.length || components.some((item) => !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100) ||
    Math.abs(components.reduce((sum, item) => sum + item.weight, 0) - 100) > 0.000001) throw new Error('Tổng tỷ trọng các đầu điểm phải bằng 100%.');
  const candidates = components.filter((item) => componentName ? normalizeText(item.name) === normalizeText(componentName)
    : /\b(cuoi[\s-]+k[yi]|thi[\s-]+hoc[\s-]+k[yi]|ket[\s-]+thuc[\s-]+hoc[\s-]+phan|ck|final)\b/.test(normalizeText(item.name)));
  if (candidates.length !== 1) throw new Error('Cần xác định duy nhất một đầu điểm cần tính, ví dụ “Cuối kỳ”.');
  const selected = candidates[0]!;
  if (!selected.weight) throw new Error('Tỷ trọng đầu điểm cần tính phải lớn hơn 0%.');
  const others = components.filter((item) => item !== selected && item.weight > 0);
  if (others.some((item) => item.score10 === null || !validScore(item.score10))) throw new Error('Cần có điểm cho các đầu điểm còn lại.');
  const earned = others.reduce((sum, item) => sum + item.score10! * item.weight, 0);
  const minimum = Math.ceil((target * 100 - earned) / selected.weight * 100 - 1e-9) / 100;
  return { component: selected.name, target, minimum: Math.max(0, minimum), achievable: minimum <= 10, alreadyAchieved: minimum <= 0 };
}
export function subtractBusy(start: number, end: number, busy: [number, number][]): [number, number][] {
  const slots: [number, number][] = [];
  let cursor = start;
  for (const [from, to] of [...busy].sort(([a], [b]) => a - b)) {
    if (cursor < Math.min(from, end)) slots.push([cursor, Math.min(from, end)]);
    cursor = Math.max(cursor, to);
    if (cursor >= end) break;
  }
  if (cursor < end) slots.push([cursor, end]);
  return slots;
}

export function parseTimeRange(value: string): [number, number] | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:-|–|—|đến|to)\s*([01]?\d|2[0-3]):([0-5]\d))?$/i.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = match[3] === undefined ? Math.min(1440, start + 60) : Number(match[3]) * 60 + Number(match[4]);
  return start < end ? [start, end] : null;
}
