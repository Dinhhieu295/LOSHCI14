import { closeDatabase } from './index.js';
import { config } from '../config.js';
import { createServices } from '../application/services/index.js';
import { KyselyLifeOsRepository } from '../infrastructure/repositories/kysely-lifeos-repository.js';
import type { ProjectInput, TaskInput } from '../application/models.js';

const email = 'demo@lifeos.local';
const password = 'LifeOS123!';
const repository = new KyselyLifeOsRepository();
const services = createServices(repository);
const today = new Date();
const date = (offset: number) => {
  const value = new Date(today);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
};

const samples: { project: ProjectInput; tasks: TaskInput[] }[] = [
  {
    project: {
      title: 'Phát triển LifeOS',
      description: 'Hoàn thiện trải nghiệm quản lý công việc và kế hoạch cá nhân.',
      startDate: date(0), endDate: date(30), tag: 'Sản phẩm', priority: 'High',
      status: 'Active', progress: 35, daysLeft: 30, isPinned: true, members: ['Bạn'],
    },
    tasks: [
      { title: 'Phác thảo luồng người dùng', status: 'done', isDone: true, priority: 'High', dueDate: date(1) },
      { title: 'Hoàn thiện màn hình dự án', status: 'in-progress', isDone: false, priority: 'High', dueDate: date(5) },
      { title: 'Tạo API quản lý task', status: 'todo', isDone: false, priority: 'Medium', dueDate: date(9) },
      { title: 'Kiểm tra đăng nhập và phân quyền', status: 'todo', isDone: false, priority: 'Medium', dueDate: date(14) },
      { title: 'Viết hướng dẫn sử dụng', status: 'todo', isDone: false, priority: 'Low', dueDate: date(20) },
    ].map((task, index) => ({
      ...task, subtasksDone: 0, subtasksTotal: 0, assignee: 'Bạn', estimate: `${index + 1}h`, actual: '0h',
      startDay: index * 3, durationDays: 2, baselineStart: index * 3, baselineDuration: 2,
      isMilestone: false, dependencies: [],
    })),
  },
  {
    project: {
      title: 'Kế hoạch học kỳ mới',
      description: 'Sắp xếp lịch học, bài tập và mục tiêu điểm số cho học kỳ.',
      startDate: date(0), endDate: date(60), tag: 'Học tập', priority: 'Medium',
      status: 'Active', progress: 20, daysLeft: 60, isPinned: false, members: ['Bạn'],
    },
    tasks: [
      { title: 'Tổng hợp môn học trong kỳ', status: 'done', isDone: true, priority: 'Medium', dueDate: date(2) },
      { title: 'Lập lịch học hàng tuần', status: 'in-progress', isDone: false, priority: 'High', dueDate: date(4) },
      { title: 'Chia nhỏ bài tập lớn', status: 'todo', isDone: false, priority: 'High', dueDate: date(10) },
      { title: 'Ôn tập kiến thức mỗi ngày', status: 'todo', isDone: false, priority: 'Medium', dueDate: date(18) },
      { title: 'Đánh giá tiến độ cuối tháng', status: 'todo', isDone: false, priority: 'Low', dueDate: date(30) },
    ].map((task, index) => ({
      ...task, subtasksDone: 0, subtasksTotal: 0, assignee: 'Bạn', estimate: `${index + 1}h`, actual: '0h',
      startDay: index * 5, durationDays: 3, baselineStart: index * 5, baselineDuration: 3,
      isMilestone: false, dependencies: [],
    })),
  },
];

try {
  if (config.NODE_ENV === 'production') {
    throw new Error('Demo data is disabled in production.');
  }

  const existingUser = await repository.findUserByEmail(email);
  if (!existingUser) await services.auth.register({ email, password, fullName: 'Tài khoản dùng thử' });

  const userId = (await repository.findUserByEmail(email))!.id;
  const projects = await services.projects.list(userId);
  for (const sample of samples) {
    let project = projects.find((item) => item.title === sample.project.title);
    if (!project) project = await services.projects.create(userId, sample.project);
    const existingTasks = await services.projects.listTasks(userId, project.id);
    for (const task of sample.tasks) {
      if (!existingTasks.some((item) => item.title === task.title)) {
        await services.projects.createTask(userId, project.id, task);
      }
    }
  }

  console.log('Đã chuẩn bị 2 dự án và 10 task mẫu.');
  console.log(`Tài khoản: ${email}`);
  console.log(`Mật khẩu: ${password}`);
  console.log('Task có thể xem qua GET /api/projects/:projectId/tasks sau khi đăng nhập.');
} finally {
  await closeDatabase();
}
