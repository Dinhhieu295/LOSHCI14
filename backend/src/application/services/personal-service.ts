import type { PersonalState, PersonalStatePatch } from '../models.js';
import type { PersonalRepository } from '../ports/repositories.js';
import { ApplicationError } from '../errors.js';

export class PersonalService {
  constructor(private readonly repository: PersonalRepository) {}

  async getState(userId: string): Promise<PersonalState> {
    const today = new Date().toISOString().slice(0, 10);
    const state = await this.repository.findPersonalState(userId);
    if (!state) {
      return this.repository.savePersonalState(userId, {
        userId, coins: 350, growthXP: 0, streak: 1, lastLoginDate: today,
        selectedSeed: 'tomato', shopItems: [], history: [], updatedAt: new Date().toISOString(),
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

  async updateState(userId: string, patch: PersonalStatePatch): Promise<void> {
    if (!Object.keys(patch).length) throw new ApplicationError('EMPTY_UPDATE', 'Cần ít nhất một trường để cập nhật.');
    const current = await this.getState(userId);
    await this.repository.savePersonalState(userId, { ...current, ...patch, updatedAt: new Date().toISOString() });
  }

  async spendCoins(userId: string, amount: number): Promise<number> {
    const balance = await this.repository.debitCoins(userId, amount, new Date().toISOString());
    if (balance === undefined) throw new ApplicationError('INSUFFICIENT_COINS', 'Không đủ coin.');
    return balance;
  }
}
