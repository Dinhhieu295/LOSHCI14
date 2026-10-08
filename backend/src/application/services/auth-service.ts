import { randomUUID } from 'node:crypto';
import type { AccountUser, PersonalState, PublicUser, SessionRecord } from '../models.js';
import type { AccountRepository } from '../ports/repositories.js';
import { ApplicationError } from '../errors.js';
import { config } from '../../config.js';
import { hashPassword, verifyPassword } from '../../security/password.js';
import { createSessionToken, hashSessionToken } from '../../security/token.js';

export class AuthService {
  constructor(private readonly repository: AccountRepository) {}

  async register(input: { email: string; password: string; fullName: string; dob?: string }) {
    const email = input.email.trim().toLowerCase();
    if (await this.repository.findUserByEmail(email)) {
      throw new ApplicationError('ALREADY_EXISTS', 'Email này đã được đăng ký.');
    }

    const now = new Date().toISOString();
    const user: AccountUser = {
      id: randomUUID(), email, passwordHash: await hashPassword(input.password),
      fullName: input.fullName.trim(), dob: input.dob ?? null, avatarUrl: null,
      createdAt: now, updatedAt: now,
    };
    const initialState: PersonalState = {
      userId: user.id, coins: 350, growthXP: 0, streak: 1, lastLoginDate: now.slice(0, 10),
      selectedSeed: 'tomato', shopItems: [], history: [], updatedAt: now,
    };
    const session = this.newSession(user.id, now);

    await this.repository.createAccount(user, initialState, session.record);
    return { user: this.toPublicUser(user), token: session.token, expiresAt: session.record.expiresAt };
  }

  async login(emailInput: string, password: string) {
    const user = await this.repository.findUserByEmail(emailInput.trim().toLowerCase());
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApplicationError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác.');
    }
    const session = this.newSession(user.id, new Date().toISOString());
    await this.repository.createSession(session.record);
    return { user: this.toPublicUser(user), token: session.token, expiresAt: session.record.expiresAt };
  }

  async authenticate(token: string): Promise<{ userId: string; sessionId: string }> {
    if (!token) throw new ApplicationError('UNAUTHENTICATED', 'Đăng nhập để tiếp tục.');
    const session = await this.repository.findSessionByTokenHash(hashSessionToken(token));
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      if (session) await this.repository.deleteSession(session.id);
      throw new ApplicationError('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
    }
    return { userId: session.userId, sessionId: session.id };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new ApplicationError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return this.toPublicUser(user);
  }

  async logout(sessionId: string): Promise<void> {
    await this.repository.deleteSession(sessionId);
  }

  private newSession(userId: string, now: string) {
    const token = createSessionToken();
    const record: SessionRecord = {
      id: randomUUID(), userId, tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.parse(now) + config.SESSION_TTL_DAYS * 86_400_000).toISOString(),
      createdAt: now,
    };
    return { token, record };
  }

  private toPublicUser(user: AccountUser): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
