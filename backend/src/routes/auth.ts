import { Router } from 'express';
import { z } from 'zod';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';

export function createAuthRouter(services: AppServices) {
  const router = Router();
  const registerSchema = z.object({ email: z.email().max(320), password: z.string().min(8).max(128), fullName: z.string().trim().min(1).max(120), dob: z.iso.date().optional() });
  const loginSchema = z.object({ email: z.email().max(320), password: z.string().min(1).max(128) });
  const publicUser = (user: Awaited<ReturnType<typeof services.auth.me>>) => ({ id: user.id, email: user.email, fullName: user.fullName, dob: user.dob, avatarUrl: user.avatarUrl });

  router.post('/register', asyncHandler(async (req, res) => {
    const result = await services.auth.register(registerSchema.parse(req.body));
    res.status(201).json({ user: publicUser(result.user), token: result.token, expiresAt: result.expiresAt });
  }));
  router.post('/login', asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await services.auth.login(input.email, input.password);
    res.json({ user: publicUser(result.user), token: result.token, expiresAt: result.expiresAt });
  }));
  router.get('/me', requireAuth(services.auth), asyncHandler(async (req, res) => {
    res.json({ user: publicUser(await services.auth.me(req.userId!)) });
  }));
  router.post('/logout', requireAuth(services.auth), asyncHandler(async (req, res) => {
    await services.auth.logout(req.sessionId!);
    res.status(204).end();
  }));
  return router;
}
