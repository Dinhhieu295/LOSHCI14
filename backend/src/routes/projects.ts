import { Router } from 'express';
import { z } from 'zod';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { HttpError } from '../http/errors.js';
import { requireAuth } from '../middleware/require-auth.js';

const projectSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(10000).default(''), startDate: z.iso.date().nullable().default(null), endDate: z.iso.date().nullable().default(null), tag: z.string().max(80).default(''), priority: z.string().max(24).default('Medium'), status: z.string().max(24).default('Active'), progress: z.number().min(0).max(100).default(0), daysLeft: z.number().int().min(0).default(0), isPinned: z.boolean().default(false), members: z.array(z.string().max(120)).max(100).default([]) });
const projectPatch = projectSchema.partial();
const taskSchema = z.object({ title: z.string().trim().min(1).max(200), priority: z.string().max(24).default('Medium'), subtasksDone: z.number().int().min(0).default(0), subtasksTotal: z.number().int().min(0).default(0), dueDate: z.iso.date().nullable().default(null), assignee: z.string().max(120).default(''), status: z.string().max(24).default('todo'), isDone: z.boolean().default(false), estimate: z.string().max(24).default('0h'), actual: z.string().max(24).default('0h'), startDay: z.number().int().default(0), durationDays: z.number().int().min(0).default(1), baselineStart: z.number().int().default(0), baselineDuration: z.number().int().min(0).default(1), isMilestone: z.boolean().default(false), dependencies: z.array(z.string().max(36)).max(100).default([]) });
const taskPatch = taskSchema.partial();
const param = (value: string | string[] | undefined) => { if (typeof value !== 'string' || !value) throw new HttpError(400, 'Invalid route parameter.', 'INVALID_ROUTE_PARAM'); return value; };

export function createProjectsRouter(services: AppServices) {
  const router = Router();
  router.use(requireAuth(services.auth));
  router.get('/', asyncHandler(async (req, res) => res.json(await services.projects.list(req.userId!))));
  router.post('/', asyncHandler(async (req, res) => res.status(201).json(await services.projects.create(req.userId!, projectSchema.parse(req.body)))));
  router.get('/:projectId', asyncHandler(async (req, res) => res.json(await services.projects.get(req.userId!, param(req.params.projectId)))));
  router.patch('/:projectId', asyncHandler(async (req, res) => res.json(await services.projects.update(req.userId!, param(req.params.projectId), projectPatch.parse(req.body)))));
  router.delete('/:projectId', asyncHandler(async (req, res) => { await services.projects.delete(req.userId!, param(req.params.projectId)); res.status(204).end(); }));
  router.get('/:projectId/tasks', asyncHandler(async (req, res) => res.json(await services.projects.listTasks(req.userId!, param(req.params.projectId)))));
  router.post('/:projectId/tasks', asyncHandler(async (req, res) => res.status(201).json(await services.projects.createTask(req.userId!, param(req.params.projectId), taskSchema.parse(req.body)))));
  router.patch('/:projectId/tasks/:taskId', asyncHandler(async (req, res) => res.json(await services.projects.updateTask(req.userId!, param(req.params.projectId), param(req.params.taskId), taskPatch.parse(req.body)))));
  router.delete('/:projectId/tasks/:taskId', asyncHandler(async (req, res) => { await services.projects.deleteTask(req.userId!, param(req.params.projectId), param(req.params.taskId)); res.status(204).end(); }));
  return router;
}
