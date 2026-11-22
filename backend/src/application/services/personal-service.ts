import type { PersonalState } from '../models.js';
import type { PersonalRepository } from '../ports/repositories.js';

export class PersonalService {
  constructor(private readonly repository: PersonalRepository) {}

  async getState(userId: string): Promise<PersonalState> {
    const today = new Date().toISOString().slice(0, 10);
    const state = await this.repository.findPersonalState(userId);
    if (!state) {
      return this.repository.savePersonalState(userId, {
        userId, streak: 1, lastLoginDate: today, updatedAt: new Date().toISOString(),
      });
    }
    if (state.lastLoginDate === today) return state;

    const previous = Date.parse(`${state.lastLoginDate}T00:00:00Z`);
    const current = Date.parse(`${today}T00:00:00Z`);
    const streak = current - previous === 86_400_000 ? state.streak + 1 : 1;
    return this.repository.savePersonalState(userId, {
      ...state, streak, lastLoginDate: today, updatedAt: new Date().toISOString(),
    });
  }
}
