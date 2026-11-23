import { z } from 'zod';
import { calendarTimeSchema } from '../routes/calendar.js';

const period = '(?:sáng|chiều|tối)';
const date = '(?:hôm nay|(?:ngày )?mai|(?:ngày )?mốt|ngày kia|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4})';
const time = '(\\d{1,2})(?:[:h](\\d{2}))? *(?:giờ|h)?';
const range = new RegExp(
  `(?<![\\p{L}\\d:/-])${time} *(${period})? *(?:đến|tới|[–—-]) *${time} *(${period})?(?![\\p{L}\\d:/-])`,
  'gu',
);
const datedPeriod = new RegExp(
  `(?<![\\p{L}\\d])(?:(${period}) +)?(${date})(?: +(?:buổi )?(${period}))?(?![\\p{L}\\d])`,
  'gu',
);

const titleField = z.string().trim().min(1).max(160);
export const scheduledTaskSchema = z.strictObject({ title: titleField.nullable() });
export const scheduledTaskInstructions = `Xác định người dùng có yêu cầu tạo đúng một việc cá nhân diễn ra một lần hay không.
Nếu có, trả title là tên việc được chép nguyên văn từ yêu cầu, chỉ lấy tên và bỏ phần thời gian.
Ví dụ "Tạo việc cá nhân Đi đá bóng từ 16h đến 17h ngày mai" → {"title":"Đi đá bóng"}.
Với yêu cầu xem lịch, đổi lịch, ca làm, lịch lặp, việc dự án, bài tập hoặc nhiều việc, trả {"title":null}.`;

function civilDate(value: string, today: string) {
  if (/^\d{4}-/.test(value)) return value;
  const [day, month, year] = value.split('/');
  if (day && month && year) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const result = new Date(`${today}T00:00:00Z`);
  const offset = value === 'hôm nay' ? 0 : value.endsWith('mai') ? 1 : 2;
  result.setUTCDate(result.getUTCDate() + offset);
  return result.toISOString().slice(0, 10);
}

function localMinute(hour: string, minute: string | undefined, dayPeriod: string | undefined) {
  const h = Number(hour);
  const m = Number(minute ?? 0);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return undefined;
  if (dayPeriod === 'sáng') return h < 12 ? h * 60 + m : undefined;
  if (dayPeriod) {
    if (h === 0 || h === 24) return undefined;
    return (h < 12 ? h + 12 : h) * 60 + m;
  }
  if (h >= 1 && h <= 12 && !hour.startsWith('0')) return undefined;
  return h * 60 + m;
}

export function readPersonalSchedule(message: string, today: string) {
  const text = message.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ');
  const slots = [...text.matchAll(range)];
  if (slots.length !== 1) return undefined;
  const [match, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod] = slots[0]!;
  // Bare numbers joined by a dash also occur in titles and identifiers.
  if (!/(?:giờ|h|:|đến|tới)/u.test(match) && startHour?.length !== 2 && endHour?.length !== 2) return undefined;
  const dates = [...text.matchAll(datedPeriod)];
  if (dates.length !== 1) return { question: 'Bạn muốn xếp việc này vào ngày nào?' } as const;
  const [, before, day, after] = dates[0]!;
  const start = localMinute(startHour!, startMinute, startPeriod ?? before ?? after ?? endPeriod);
  const end = localMinute(endHour!, endMinute, endPeriod ?? before ?? after ?? startPeriod);
  if (start === undefined || end === undefined) {
    return { question: 'Bạn cho mình giờ bắt đầu và kết thúc theo định dạng 24 giờ, ví dụ 20:00–21:00, được không?' } as const;
  }
  const checked = calendarTimeSchema.safeParse({ date: civilDate(day!, today), start, end });
  if (!checked.success) {
    return { question: 'Bạn kiểm tra lại ngày và khung giờ giúp mình. Việc cần kéo dài ít nhất 15 phút và nằm trong cùng một ngày.' } as const;
  }
  return { slot: checked.data } as const;
}
