import { Router } from 'express';
import { z } from 'zod';
import type { AuthService } from '../application/services/auth-service.js';
import { asyncHandler } from '../http/async-handler.js';
import type { TaskCalendarRepository } from '../infrastructure/repositories/task-calendar-repository.js';
import { requireAuth } from '../middleware/require-auth.js';

const interval = {
  date: z.iso.date(),
  start: z.number().int().min(0).max(1425),
  end: z.number().int().min(15).max(1440),
};
const validLength = ({ start, end }: { start: number; end: number }) => end - start >= 15;
export const calendarTimeSchema = z.object(interval).refine(validLength);
const blockSchema = z.object({ ...interval, taskId: z.uuid() }).refine(validLength);
export const calendarBlocksSchema = z.object({ blocks: z.array(blockSchema).min(1).max(100) });

export function createCalendarRouter(auth: AuthService, repository: TaskCalendarRepository) {
  const router = Router();
  router.use(requireAuth(auth));
  router.get('/task-blocks', asyncHandler(async (req, res) => res.json(await repository.list(req.userId!))));
  router.post('/task-blocks', asyncHandler(async (req, res) => {
    const { blocks } = calendarBlocksSchema.parse(req.body);
    res.status(201).json(await repository.create(req.userId!, blocks));
  }));
  router.patch('/task-blocks/:id', asyncHandler(async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.json(await repository.move(req.userId!, id, calendarTimeSchema.parse(req.body)));
  }));
  router.delete('/task-blocks/:id', asyncHandler(async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await repository.remove(req.userId!, id);
    res.status(204).end();
  }));
  return router;
}
