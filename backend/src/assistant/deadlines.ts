import type { StudyItem, Task } from '../application/models.js';

type DeadlineItem = { title: string; date: string; time: string; source: string };
type DeadlineWindow = { today: string; days: number; timeZone: string };

export function deadlineWindowDays(text: string) {
  if (!/^(?:(?:hay|ban|toi|minh|em|giup)\s+)*(?:co|deadline|han|xem|tra cuu|kiem tra|liet ke|danh sach|cho (?:toi|minh|em) biet)\b/.test(text)) return undefined;
  if (!/\b(?:deadline|han)\b/.test(text)) return undefined;
  if (/\b(?:doi han|doi deadline|doi ngay nop|xoa (?:deadline|bai tap)|da hoan thanh|da xong|cua (?:mon|du an|nhom)|chi xem|chi liet ke|qua han)\b/.test(text)) return undefined;
  const range = /\b([1-9]\d?|bay)\s+ngay\s+(?:toi|ke tiep|tiep theo|sap toi)\b/.exec(text);
  if (!range) return undefined;
  return range[1] === 'bay' ? 7 : Number(range[1]);
}

function endOfWindow({ today, days }: DeadlineWindow) {
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + days - 1);
  return end.toISOString().slice(0, 10);
}

const vietnameseDate = (value: string) => value.split('-').reverse().join('/');
const completed = (status: unknown) => typeof status === 'string' && /^(?:completed|done)$/i.test(status);

export function formatUpcomingDeadlines(window: DeadlineWindow, assignments: StudyItem[],
  projectTasks: (Task & { projectTitle: string })[], personalTasks: Task[]) {
  const end = endOfWindow(window);
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: window.timeZone, dateStyle: 'short', timeStyle: 'short' });
  const items: DeadlineItem[] = [];

  function add(title: string, due: unknown, source: string) {
    if (typeof due !== 'string') return;
    let date = due;
    let time = '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      const timestamp = new Date(due);
      if (Number.isNaN(timestamp.getTime())) return;
      [date = '', time = ''] = formatter.format(timestamp).split(' ');
    }
    if (date >= window.today && date <= end) items.push({ title, date, time, source });
  }

  for (const assignment of assignments) {
    if (typeof assignment.title === 'string' && !completed(assignment.status)) {
      add(assignment.title, assignment.deadline, 'Bài tập');
    }
  }
  for (const task of projectTasks) {
    if (!task.isDone && !completed(task.status)) add(task.title, task.dueDate, `Dự án ${task.projectTitle}`);
  }
  for (const task of personalTasks) {
    if (task.category !== 'employment' && !task.isDone && !completed(task.status)) {
      add(task.title, task.dueDate, 'Việc cá nhân');
    }
  }

  const period = `Từ ngày ${vietnameseDate(window.today)} đến hết ngày ${vietnameseDate(end)}`;
  if (!items.length) return `${period}, bạn không có bài tập, task dự án hoặc việc cá nhân chưa hoàn thành đến hạn.`;
  items.sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time)
    || left.title.localeCompare(right.title, 'vi'));
  let reply = `${period}, bạn có ${items.length} mục chưa hoàn thành đến hạn.\n`;
  for (const [index, item] of items.entries()) {
    const line = `\n- ${vietnameseDate(item.date)}${item.time ? ` lúc ${item.time}` : ''} · ${item.title} (${item.source})`;
    // The next chat request can include this reply and limits each message to 4,000 characters.
    if (reply.length + line.length > 3500) return `${reply}\n\nCòn ${items.length - index} mục cùng khoảng thời gian.`;
    reply += line;
  }
  return reply;
}
