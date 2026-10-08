import { randomUUID } from 'node:crypto';
import type { StudyItem, StudyResourceName, StudySummary } from '../models.js';
import type { StudyRepository } from '../ports/repositories.js';
import { ApplicationError } from '../errors.js';

const gradeScale: Record<string, number> = {
  'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7,
  'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, F: 0,
};

export class StudyService {
  constructor(private readonly repository: StudyRepository) {}

  list(userId: string, resource: StudyResourceName): Promise<StudyItem[]> {
    return this.repository.listStudyItems(userId, resource);
  }

  async create(userId: string, resource: StudyResourceName, input: Record<string, unknown>): Promise<StudyItem> {
    await this.ensureCourseOwnership(userId, input);
    return this.repository.createStudyItem(userId, resource, input, randomUUID(), new Date().toISOString());
  }

  async update(userId: string, resource: StudyResourceName, id: string, patch: Record<string, unknown>): Promise<StudyItem> {
    if (!Object.keys(patch).length) throw new ApplicationError('EMPTY_UPDATE', 'Cần ít nhất một trường để cập nhật.');
    await this.ensureCourseOwnership(userId, patch);
    const updated = await this.repository.updateStudyItem(userId, resource, id, patch, new Date().toISOString());
    if (!updated) throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy dữ liệu.');
    return updated;
  }

  async delete(userId: string, resource: StudyResourceName, id: string): Promise<void> {
    if (!(await this.repository.deleteStudyItem(userId, resource, id))) {
      throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy dữ liệu.');
    }
  }

  async summary(userId: string, semester?: string): Promise<StudySummary> {
    const [allCourses, assignments] = await Promise.all([
      this.repository.listStudyItems(userId, 'courses'),
      this.repository.listStudyItems(userId, 'assignments'),
    ]);
    const courses = semester ? allCourses.filter((course) => course.semester === semester) : allCourses;
    const graded = courses.filter((course) => typeof course.grade === 'string' && gradeScale[course.grade] !== undefined);
    const credits = graded.reduce((sum, course) => sum + Number(course.credits ?? 0), 0);
    const qualityPoints = graded.reduce((sum, course) => sum + Number(course.credits ?? 0) * gradeScale[String(course.grade)]!, 0);
    return {
      semester: semester ?? null,
      gpa: credits ? Number((qualityPoints / credits).toFixed(2)) : 0,
      activeCourses: courses.filter((course) => course.status === 'Active').length,
      totalStudyHours: courses.reduce((sum, course) => sum + Number(course.studyHours ?? 0), 0),
      targetStudyHours: courses.reduce((sum, course) => sum + Number(course.aimStudyHours ?? 0), 0),
      pendingAssignments: assignments.filter((item) => item.status !== 'Completed').length,
      assignments: assignments.length,
    };
  }

  private async ensureCourseOwnership(userId: string, input: Record<string, unknown>): Promise<void> {
    const courseId = input.courseId;
    if (typeof courseId !== 'string') return;
    if (!(await this.repository.ownsCourse(userId, courseId))) {
      throw new ApplicationError('INVALID_COURSE', 'Môn học không thuộc tài khoản này.');
    }
  }
}
