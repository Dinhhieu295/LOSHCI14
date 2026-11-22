import { Router } from 'express';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';
export function createPersonalRouter(services: AppServices) {
  const router = Router(); router.use(requireAuth(services.auth));
  router.get('/state', asyncHandler(async (req, res) => res.json(await services.personal.getState(req.userId!))));
  return router;
}
