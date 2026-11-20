import { Router } from 'express';
import { z } from 'zod';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { requireAuth } from '../middleware/require-auth.js';
import { calendarTimeSchema } from './calendar.js';
import { pickPresentKeys, taskSchema } from './projects.js';

const personalTaskSchema = taskSchema.pick({ title: true, priority: true, dueDate: true, estimate: true, status: true, isDone: true }).extend({
  status: z.enum(['todo', 'in-progress', 'done']).default('todo'),
  priority: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  category: z.enum(['employment', 'personal']).default('personal'),
  fixedSlot: calendarTimeSchema.nullable().optional(),
});
const personalTaskPatch = personalTaskSchema.partial();

function parsePersonalTask(body: unknown) {
  const { category, fixedSlot, ...input } = personalTaskSchema.parse(body);
  return { ...taskSchema.parse(input), category, fixedSlot };
}

export function createTasksRouter(services: AppServices) {
  const router = Router();
  router.use(requireAuth(services.auth));
  router.get('/', asyncHandler(async (req, res) => res.json(await services.projects.listPersonalTasks(req.userId!))));
  router.post('/', asyncHandler(async (req, res) => {
    res.status(201).json(await services.projects.createPersonalTask(req.userId!, parsePersonalTask(req.body)));
  }));
  router.patch('/:id', asyncHandler(async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    res.json(await services.projects.updatePersonalTask(req.userId!, id, pickPresentKeys(personalTaskPatch.parse(req.body), req.body)));
  }));
  router.delete('/:id', asyncHandler(async (req, res) => {
    await services.projects.deletePersonalTask(req.userId!, z.uuid().parse(req.params.id));
    res.status(204).end();
  }));
  return router;
}
