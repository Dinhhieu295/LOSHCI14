import { useState } from 'react';
import { calculateGradeTarget } from '../../backend/src/application/assistant-math';

export type GradeDraft = { name: string; score10: string; weight: string };

const formatScore = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

function isScore(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 10;
}

function estimateFinalScore(rows: GradeDraft[], totalWeight: number, target: number) {
  if (!isScore(target)) return 'Nhập điểm mục tiêu từ 0 đến 10.';
  const finals = rows.filter(({ name }) => /\b(cuoi[\s-]+k[yi]|thi[\s-]+hoc[\s-]+k[yi]|ket[\s-]+thuc[\s-]+hoc[\s-]+phan|ck|final)\b/i.test(
    name.normalize('NFD').replace(/\p{M}/gu, ''),
  ));
  if (finals.length === 0) return 'Đặt tên đầu điểm là “Cuối kỳ” để tính.';
  if (finals.length > 1) return 'Chỉ đặt tên “Cuối kỳ” cho một đầu điểm.';

  const [final] = finals;
  if (Math.abs(totalWeight - 100) >= 0.000001 ||
    rows.some(({ weight }) => weight === '' || !Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 100)) {
    return 'Nhập tỷ trọng cho từng đầu điểm sao cho tổng bằng 100%.';
  }
  const finalWeight = Number(final.weight);
  if (finalWeight === 0) return 'Nhập tỷ trọng cuối kỳ lớn hơn 0%.';

  const otherGrades = rows.filter((row) => row !== final && Number(row.weight) > 0);
  if (otherGrades.some(({ score10 }) => score10 === '' || !isScore(Number(score10)))) {
    return 'Nhập điểm cho các đầu điểm còn lại để ước lượng.';
  }

  const { minimum, achievable, alreadyAchieved } = calculateGradeTarget(rows.map((row) => ({
    name: row.name, score10: row.score10 === '' ? null : Number(row.score10), weight: Number(row.weight),
  })), target, final.name);
  if (!achievable) return 'Mục tiêu vượt mức có thể đạt, kể cả khi cuối kỳ được 10/10.';
  if (alreadyAchieved) return 'Mục tiêu đạt được ngay cả khi cuối kỳ được 0/10.';
  return `Điểm cuối kỳ cần ít nhất ${formatScore.format(minimum)}/10.`;
}

export function CourseGradeTarget({ rows, totalWeight }: { rows: GradeDraft[]; totalWeight: number }) {
  const [target, setTarget] = useState('');
  const targetValue = Number(target);

  return (
    <section className="course-grade-target" aria-label="Ước lượng điểm cuối kỳ">
      <label>Điểm mục tiêu
        <input type="number" min="0" max="10" step="any" inputMode="decimal" placeholder="0–10" value={target}
          aria-invalid={target !== '' && !isScore(targetValue)} onChange={(event) => setTarget(event.target.value)} />
      </label>
      {target !== '' && <p role="status">{estimateFinalScore(rows, totalWeight, targetValue)}</p>}
    </section>
  );
}
