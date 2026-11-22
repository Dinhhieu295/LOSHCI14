import { closeDatabase } from './index.js';
import { config } from '../config.js';
import { createServices } from '../application/services/index.js';
import { ApplicationError } from '../application/errors.js';
import { KyselyLifeOsRepository } from '../infrastructure/repositories/kysely-lifeos-repository.js';
import type { ProjectInput, TaskInput } from '../application/models.js';

// Dữ liệu mẫu dành cho sinh viên UET. Tên/mã học phần bên dưới là mock data,
// được chọn theo các nhóm kiến thức CNTT, KHMT và Kỹ thuật máy tính phổ biến.
const email = 'uet-demo@lifeos.local';
const password = 'UETLifeOS123!';
const fullName = 'Nguyễn Minh Anh (UET Demo)';
const repository = new KyselyLifeOsRepository();
const services = createServices(repository);
const today = new Date();
const date = (offset: number) => {
  const value = new Date(today);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
};

const task = (title: string, dueOffset: number, priority: string, status: string, index: number): TaskInput => ({
  title, status, isDone: status === 'done', priority, dueDate: date(dueOffset),
  subtasksDone: status === 'done' ? 2 : 0, subtasksTotal: 2, assignee: 'Minh Anh',
  estimate: `${index + 2}h`, actual: status === 'done' ? `${index + 2}h` : '0h',
  startDay: index * 3, durationDays: 2, baselineStart: index * 3, baselineDuration: 2,
  isMilestone: false, dependencies: [],
});

const personalTasks: TaskInput[] = [
  { ...task('Đi lấy đồ ở bưu cục', 1, 'High', 'todo', 0), estimate: '30m' },
  { ...task('Mua đồ dùng cho tuần tới', 2, 'Medium', 'todo', 0), estimate: '45m' },
  { ...task('Trả sách thư viện', 4, 'Low', 'todo', 0), estimate: '30m' },
  { ...task('Dự sinh nhật bạn', 1, 'High', 'todo', 0), dueDate: null, estimate: '90m',
    fixedSlot: { date: date(1), start: 18 * 60 + 30, end: 20 * 60 } },
  { ...task('Tập cầu lông với bạn', 3, 'Medium', 'todo', 0), dueDate: null, estimate: '60m',
    fixedSlot: { date: date(3), start: 20 * 60, end: 21 * 60 } },
  { ...task('Đi dạy gia sư', 1, 'High', 'todo', 0), category: 'employment', dueDate: null, estimate: '90m',
    fixedSlot: { date: date(1), start: 20 * 60 + 15, end: 21 * 60 + 45 } },
  { ...task('Ca làm thêm tại quán cà phê', 3, 'High', 'todo', 0), category: 'employment', dueDate: null, estimate: '120m',
    fixedSlot: { date: date(3), start: 18 * 60, end: 20 * 60 } },
  { ...task('Soạn bài cho buổi dạy', 1, 'Medium', 'todo', 0), category: 'employment', dueDate: null, estimate: '45m',
    fixedSlot: { date: date(2), start: 21 * 60, end: 21 * 60 + 45 } },
  { ...task('Khởi hành đi du lịch', 7, 'Medium', 'todo', 0), dueDate: null, estimate: '60m',
    fixedSlot: { date: date(7), start: 7 * 60, end: 8 * 60 } },
];

async function seedPersonalTask(userId: string, sample: TaskInput, existingId?: string) {
  const input = { ...sample, subtasksTotal: 0, assignee: '' };
  if (!sample.fixedSlot) {
    await services.projects.createPersonalTask(userId, input);
    return;
  }
  const first = Date.parse(`${sample.fixedSlot.date}T12:00:00Z`);
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(first + offset * 86_400_000).toISOString().slice(0, 10);
    try {
      const fixedSlot = { ...sample.fixedSlot, date };
      if (existingId) {
        await services.projects.updatePersonalTask(userId, existingId, { fixedSlot, dueDate: sample.dueDate });
      } else {
        await services.projects.createPersonalTask(userId, { ...input, fixedSlot });
      }
      return;
    } catch (error) {
      if (!(error instanceof ApplicationError) || error.code !== 'CALENDAR_CONFLICT') throw error;
    }
  }
  console.warn(`Chưa tìm được giờ cho việc mẫu “${sample.title}”.`);
}

const projects: { project: ProjectInput; tasks: TaskInput[] }[] = [
  {
    project: {
      title: 'UET AI Study Planner',
      description: 'Xây dựng web app gợi ý lộ trình học và theo dõi tiến độ môn học bằng dữ liệu mẫu.',
      startDate: date(-10), endDate: date(35), tag: 'AI / Web', priority: 'High',
      status: 'Active', progress: 45, daysLeft: 35, isPinned: true, members: ['Minh Anh', 'Nhóm 4'],
    },
    tasks: [
      task('Phân tích yêu cầu và persona sinh viên UET', -2, 'High', 'done', 0),
      task('Thiết kế schema môn học và lịch học', 3, 'High', 'in-progress', 1),
      task('Xây dựng API gợi ý lộ trình học', 12, 'High', 'todo', 2),
      task('Huấn luyện baseline recommender', 20, 'Medium', 'todo', 3),
      task('Demo và viết báo cáo đồ án', 32, 'Medium', 'todo', 4),
    ],
  },
  {
    project: {
      title: 'IoT giám sát phòng học',
      description: 'Prototype hệ thống cảm biến nhiệt độ, độ ẩm và hiện diện cho phòng lab.',
      startDate: date(-5), endDate: date(50), tag: 'IoT / Embedded', priority: 'High',
      status: 'Active', progress: 25, daysLeft: 50, isPinned: false, members: ['Minh Anh', 'Nhóm 2'],
    },
    tasks: [
      task('Chọn board và giao thức MQTT', -1, 'High', 'done', 0),
      task('Lập trình firmware đọc cảm biến', 8, 'High', 'in-progress', 1),
      task('Thiết kế dashboard theo dõi realtime', 22, 'Medium', 'todo', 2),
      task('Kiểm thử tải và mất kết nối', 35, 'Medium', 'todo', 3),
    ],
  },
  {
    project: {
      title: 'Thư viện số UET',
      description: 'Thiết kế hệ thống tìm kiếm tài liệu, mượn trả và phân quyền người dùng.',
      startDate: date(-20), endDate: date(25), tag: 'Software Engineering', priority: 'Medium',
      status: 'Active', progress: 60, daysLeft: 25, isPinned: false, members: ['Minh Anh', 'Nhóm 6'],
    },
    tasks: [
      task('Vẽ ERD và chuẩn hóa cơ sở dữ liệu', -8, 'High', 'done', 0),
      task('Xây dựng chức năng tìm kiếm tài liệu', 2, 'High', 'in-progress', 1),
      task('Thêm phân quyền thủ thư và sinh viên', 10, 'Medium', 'todo', 2),
      task('Viết test API và tài liệu triển khai', 19, 'Low', 'todo', 3),
    ],
  },
];

const courseMocks = [
  { name: 'Lập trình cơ bản', code: 'UET-CS101', instructor: 'TS. Lê Minh', credits: 3, progress: 72, attendance: 95, aimStudyHours: 42, color: '#4f8cff',
    gradeComponents: [{ name: 'Giữa kỳ', score10: 7, weight: 40 }, { name: 'Cuối kỳ', score10: 9, weight: 60 }] },
  { name: 'Cấu trúc dữ liệu và giải thuật', code: 'UET-CS201', instructor: 'PGS. Nguyễn Hà', credits: 4, progress: 58, attendance: 92, aimStudyHours: 60, color: '#8b5cf6' },
  { name: 'Cơ sở dữ liệu', code: 'UET-IS202', instructor: 'ThS. Trần Anh', credits: 3, progress: 64, attendance: 100, aimStudyHours: 40, color: '#22c55e',
    gradeComponents: [{ name: 'Giữa kỳ', score10: 7.5, weight: 40 }, { name: 'Cuối kỳ', score10: 8, weight: 60 }] },
  { name: 'Mạng máy tính', code: 'UET-CE301', instructor: 'TS. Phạm Quân', credits: 3, progress: 40, attendance: 88, aimStudyHours: 45, color: '#f59e0b' },
  { name: 'Trí tuệ nhân tạo', code: 'UET-AI401', instructor: 'PGS. Đỗ Lan', credits: 3, progress: 35, attendance: 96, aimStudyHours: 50, color: '#ec4899' },
  { name: 'Kiến trúc máy tính', code: 'UET-CE204', instructor: 'TS. Vũ Hoàng', credits: 3, progress: 80, attendance: 94, aimStudyHours: 36, color: '#06b6d4',
    gradeComponents: [{ name: 'Giữa kỳ', score10: 8, weight: 40 }, { name: 'Cuối kỳ', score10: 9, weight: 60 }] },
];

try {
  if (config.NODE_ENV === 'production') throw new Error('Demo data is disabled in production.');

  let existingUser = await repository.findUserByEmail(email);
  if (!existingUser) {
    await services.auth.register({ email, password, fullName });
    existingUser = await repository.findUserByEmail(email);
  }
  const userId = existingUser!.id;

  const existingProjects = await services.projects.list(userId);
  for (const sample of projects) {
    let project = existingProjects.find((item) => item.title === sample.project.title);
    if (!project) project = await services.projects.create(userId, sample.project);
    const existingTasks = await services.projects.listTasks(userId, project.id);
    for (const item of sample.tasks) {
      if (!existingTasks.some((current) => current.title === item.title)) {
        await services.projects.createTask(userId, project.id, item);
      }
    }
  }

  const semester = 'HK1 2026-2027';
  const existingCourses = await services.study.list(userId, 'courses');
  const coursesByCode = new Map<string, string>();
  for (const item of courseMocks) {
    let course = existingCourses.find((current) => current.code === item.code);
    if (!course) course = await services.study.create(userId, 'courses', { ...item, semester, status: 'Active' });
    coursesByCode.set(item.code, String(course.id));
  }

  const seeded = async (resource: 'assignments' | 'exams' | 'notes' | 'schedule' | 'course-sessions' | 'study-logs', items: Record<string, unknown>[]) => {
    const existing = await services.study.list(userId, resource);
    for (const item of items) {
      const title = typeof item.title === 'string' ? item.title : `${item.date}-${item.courseId ?? ''}`;
      const alreadySeeded = existing.some((current) => current.title === title
        || (resource === 'study-logs' && current.date === item.date && current.courseId === item.courseId)
        || (resource === 'course-sessions' && current.courseId === item.courseId
          && current.weekday === item.weekday && current.startTime === item.startTime));
      if (!alreadySeeded) {
        await services.study.create(userId, resource, item);
      }
    }
  };

  await seeded('assignments', [
    { title: 'Bài tập lớn: Benchmark thuật toán sắp xếp', courseId: coursesByCode.get('UET-CS201'), priority: 'High', deadline: date(6), status: 'In Progress', estimatedTime: '8h' },
    { title: 'Thiết kế ERD cho Thư viện số UET', courseId: coursesByCode.get('UET-IS202'), priority: 'High', deadline: date(10), status: 'Not Started', estimatedTime: '5h' },
    { title: 'Lab MQTT và cảm biến nhiệt độ', courseId: coursesByCode.get('UET-CE301'), priority: 'Medium', deadline: date(15), status: 'Not Started', estimatedTime: '6h' },
    { title: 'Mini project: Bộ phân loại ảnh', courseId: coursesByCode.get('UET-AI401'), priority: 'High', deadline: date(24), status: 'Not Started', estimatedTime: '12h' },
  ]);
  await seeded('exams', [
    { title: 'Giữa kỳ Cấu trúc dữ liệu và giải thuật', courseId: coursesByCode.get('UET-CS201'), date: date(18), type: 'Midterm', weight: 30, prepProgress: 35 },
    { title: 'Quiz Mạng máy tính', courseId: coursesByCode.get('UET-CE301'), date: date(12), type: 'Quiz', weight: 10, prepProgress: 20 },
    { title: 'Cuối kỳ Trí tuệ nhân tạo', courseId: coursesByCode.get('UET-AI401'), date: date(42), type: 'Final', weight: 50, prepProgress: 10 },
  ]);
  await seeded('notes', [
    { title: 'Ôn tập Big-O và cây nhị phân', courseId: coursesByCode.get('UET-CS201'), content: 'Tóm tắt độ phức tạp, BST, heap và các dạng bài thường gặp.', date: date(-1), tags: ['DSA', 'Ôn thi'] },
    { title: 'Mô hình OSI và TCP/IP', courseId: coursesByCode.get('UET-CE301'), content: 'Ghi chú về tầng mạng, TCP handshake, DNS và HTTP.', date: date(-3), tags: ['Networking', 'Lab'] },
    { title: 'Pipeline dữ liệu cho project AI', courseId: coursesByCode.get('UET-AI401'), content: 'Các bước thu thập, làm sạch, chia tập và đánh giá mô hình.', date: date(-5), tags: ['AI', 'Project'] },
  ]);
  await seeded('schedule', [
    { title: 'Lập trình cơ bản', time: '08:00 - 10:00', color: '#4f8cff', date: date(1) },
    { title: 'Cấu trúc dữ liệu và giải thuật', time: '13:30 - 15:30', color: '#8b5cf6', date: date(2) },
    { title: 'Lab Mạng máy tính', time: '15:45 - 17:45', color: '#f59e0b', date: date(3) },
  ]);
  await seeded('course-sessions', [
    { courseId: coursesByCode.get('UET-CS201'), weekday: 2, startTime: '13:30', endTime: '15:30', periodStart: 7, periodEnd: 9, location: 'UET - Nhà E3', room: 'E3-302', color: '#8b5cf6' },
    { courseId: coursesByCode.get('UET-IS202'), weekday: 4, startTime: '08:00', endTime: '10:00', periodStart: 1, periodEnd: 3, location: 'UET - Nhà E3', room: 'E3-201', color: '#22c55e' },
    { courseId: coursesByCode.get('UET-AI401'), weekday: 6, startTime: '09:00', endTime: '11:00', periodStart: 3, periodEnd: 5, location: 'UET - Lab AI', room: 'E3-501', color: '#ec4899' },
  ]);
  await seeded('study-logs', [
    { courseId: coursesByCode.get('UET-CS201'), date: date(-1), durationMinutes: 90, note: 'Luyện bài heap và priority queue.' },
    { courseId: coursesByCode.get('UET-AI401'), date: date(-2), durationMinutes: 120, note: 'Đọc về confusion matrix và F1-score.' },
    { courseId: coursesByCode.get('UET-IS202'), date: date(-4), durationMinutes: 75, note: 'Thiết kế ERD cho project Thư viện số.' },
  ]);

  const existingPersonalTasks = await services.projects.listPersonalTasks(userId);
  for (const sample of personalTasks) {
    const current = existingPersonalTasks.find((task) => task.title === sample.title);
    if (!current) {
      await seedPersonalTask(userId, sample);
    } else if (sample.fixedSlot && current.category === 'employment' && !current.fixedSlot) {
      await seedPersonalTask(userId, sample, current.id);
    }
  }

  console.log('Đã chuẩn bị tài khoản UET demo, các dự án, môn học và công việc mẫu.');
  console.log(`Tài khoản: ${email}`);
  console.log(`Mật khẩu: ${password}`);
} finally {
  await closeDatabase();
}
