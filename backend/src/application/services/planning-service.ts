import type { AvailabilityWindow, StudyPreference } from '../models.js';
import type { PlanningRepository } from '../ports/repositories.js';
import { ApplicationError } from '../errors.js';

export class PlanningService {
  constructor(private readonly repository: PlanningRepository) {}

  async get(userId: string) {
    const [availability, feedback] = await Promise.all([
      this.repository.findAvailability(userId),
      this.repository.listStudyFeedback(userId),
    ]);
    return { availability, feedback };
  }

  saveAvailability(userId: string, windows: AvailabilityWindow[]) {
    return this.repository.saveAvailability(userId, windows);
  }

  async saveFeedback(userId: string, courseId: string, preference: StudyPreference | null) {
    if (!(await this.repository.saveStudyFeedback(userId, courseId, preference))) {
      throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy môn học.');
    }
  }
}
