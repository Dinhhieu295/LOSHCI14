import { Router } from 'express';
import { z } from 'zod';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';

export function createProfileRouter(services: AppServices) {
  const router = Router();
  router.use(requireAuth(services.auth));
  router.get('/', asyncHandler(async (req, res) => res.json(await services.profile.get(req.userId!))));
  router.patch('/', asyncHandler(async (req, res) => {
    const input = z.object({ fullName: z.string().trim().min(1).max(120).optional(), dob: z.iso.date().nullable().optional(), avatarUrl: z.string().url().max(2048).nullable().optional() }).refine((v) => Object.keys(v).length > 0).parse(req.body);
    res.json(await services.profile.update(req.userId!, input));
  }));
  router.put('/password', asyncHandler(async (req, res) => {
    const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }).parse(req.body);
    await services.profile.changePassword(req.userId!, input.currentPassword, input.newPassword, req.sessionId!);
    res.status(204).end();
  }));
  return router;
}
