import type { RequestHandler } from 'express';
import type { AuthService } from '../application/services/auth-service.js';

export function requireAuth(auth: AuthService): RequestHandler {
  return async (request, _response, next) => {
  try {
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';

    const session = await auth.authenticate(token);
    request.userId = session.userId;
    request.sessionId = session.sessionId;
    next();
  } catch (error) {
    next(error);
  }
  };
}
