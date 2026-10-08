import { Router } from 'express';
import { z } from 'zod';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';
export function createPersonalRouter(services: AppServices) {
  const router = Router(); router.use(requireAuth(services.auth));
  router.get('/state', asyncHandler(async (req, res) => res.json(await services.personal.getState(req.userId!))));
  router.put('/state', asyncHandler(async (req, res) => {
    const input = z.object({ coins: z.number().int().min(0).max(2_000_000_000).optional(), growthXP: z.number().int().min(0).max(2_000_000_000).optional(), streak: z.number().int().min(0).max(2_000_000_000).optional(), selectedSeed: z.string().max(40).optional(), shopItems: z.array(z.unknown()).max(500).optional(), history: z.array(z.unknown()).max(5000).optional() }).refine((value) => Object.keys(value).length > 0).parse(req.body);
    await services.personal.updateState(req.userId!, input); res.status(204).end();
  }));
  router.post('/coins/spend', asyncHandler(async (req, res) => { const { amount } = z.object({ amount: z.number().int().positive().max(1_000_000) }).parse(req.body); res.json({ coins: await services.personal.spendCoins(req.userId!, amount) }); }));
  return router;
}
