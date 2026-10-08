import type { AccountUser, PublicUser } from '../models.js';
import type { AccountRepository } from '../ports/repositories.js';
import { ApplicationError } from '../errors.js';
import { hashPassword, verifyPassword } from '../../security/password.js';

export class ProfileService {
  constructor(private readonly repository: AccountRepository) {}

  async get(userId: string): Promise<PublicUser> {
    const user = await this.requireUser(userId);
    return this.toPublicUser(user);
  }

  async update(userId: string, patch: { fullName?: string; dob?: string | null; avatarUrl?: string | null }): Promise<PublicUser> {
    if (!Object.keys(patch).length) throw new ApplicationError('EMPTY_UPDATE', 'Cần ít nhất một trường để cập nhật.');
    await this.requireUser(userId);
    await this.repository.updateProfile(userId, patch, new Date().toISOString());
    return this.get(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, sessionId: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ApplicationError('INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không chính xác.');
    }
    await this.repository.updatePassword(userId, await hashPassword(newPassword), new Date().toISOString());
    await this.repository.deleteOtherSessions(userId, sessionId);
  }

  private async requireUser(userId: string): Promise<AccountUser> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new ApplicationError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return user;
  }

  private toPublicUser(user: AccountUser): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
