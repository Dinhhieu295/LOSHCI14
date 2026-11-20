import { Router } from 'express';
import { z } from 'zod';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const availability = z.array(z.object({
  weekday: z.number().int().min(1).max(7),
  start: time,
  end: time,
}).refine((window) => window.start < window.end, 'Giờ kết thúc phải sau giờ bắt đầu.'))
  .max(7)
  .refine((windows) => new Set(windows.map((window) => window.weekday)).size === windows.length,
    'Mỗi ngày chỉ được lưu một khung giờ.');
const availabilitySchema = z.object({ windows: availability });
const feedbackSchema = z.object({ preference: z.enum(['more', 'less']).nullable() });

export function createPlanningRouter(services: AppServices) {
  const router = Router();
  router.use(requireAuth(services.auth));
  router.get('/', asyncHandler(async (req, res) => res.json(await services.planning.get(req.userId!))));
  router.put('/availability', asyncHandler(async (req, res) => {
    const { windows } = availabilitySchema.parse(req.body);
    await services.planning.saveAvailability(req.userId!, windows);
    res.status(204).end();
  }));
  router.put('/feedback/:courseId', asyncHandler(async (req, res) => {
    const courseId = z.uuid().parse(req.params.courseId);
    const { preference } = feedbackSchema.parse(req.body);
    await services.planning.saveFeedback(req.userId!, courseId, preference);
    res.status(204).end();
  }));
  return router;
}
