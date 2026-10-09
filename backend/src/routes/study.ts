import { Router } from 'express';
import { z } from 'zod';
import type { StudyResourceName } from '../application/models.js';
import type { AppServices } from '../application/services/index.js';
import { asyncHandler } from '../http/async-handler.js';
import { HttpError } from '../http/errors.js';
import { requireAuth } from '../middleware/require-auth.js';

const schemas = {
  courses: z.object({ name: z.string().trim().min(1).max(160), code: z.string().max(40).default(''), instructor: z.string().max(120).default(''), credits: z.number().min(0).max(100).default(0), semester: z.string().max(40).default(''), progress: z.number().min(0).max(100).default(0), score10: z.number().min(0).max(10).nullable().default(null), grade: z.string().max(8).default('N/A'), attendance: z.number().min(0).max(100).default(0), studyHours: z.number().min(0).default(0), aimStudyHours: z.number().min(0).default(0), color: z.string().max(40).default(''), status: z.enum(['Active', 'Archived']).default('Active') }),
  assignments: z.object({ title: z.string().trim().min(1).max(200), courseId: z.string().max(36).nullable().optional(), priority: z.enum(['High', 'Medium', 'Low']).default('Medium'), deadline: z.iso.datetime().or(z.iso.date()), status: z.enum(['Not Started', 'In Progress', 'Completed', 'Overdue']).default('Not Started'), prevStatus: z.enum(['Not Started', 'In Progress', 'Overdue']).nullable().optional(), estimatedTime: z.string().max(24).default('0h') }),
  exams: z.object({ title: z.string().trim().min(1).max(200), courseId: z.string().max(36).nullable().optional(), date: z.iso.datetime().or(z.iso.date()), type: z.enum(['Quiz', 'Midterm', 'Final', 'Certification']), weight: z.number().min(0).max(100).default(0), prepProgress: z.number().min(0).max(100).default(0) }),
  notes: z.object({ title: z.string().trim().min(1).max(200), courseId: z.string().max(36).nullable().optional(), content: z.string().max(50000).default(''), date: z.iso.datetime().or(z.iso.date()), tags: z.array(z.string().max(40)).max(30).default([]) }),
  schedule: z.object({ title: z.string().trim().min(1).max(200), time: z.string().max(32), color: z.string().max(40).default(''), date: z.iso.date() }),
  'course-sessions': z.object({ courseId: z.string().max(36), weekday: z.number().int().min(1).max(7), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), periodStart: z.number().int().min(1).max(30), periodEnd: z.number().int().min(1).max(30), location: z.string().max(120).default(''), room: z.string().max(80).default(''), color: z.string().max(40).default('') }),
  'study-logs': z.object({ courseId: z.string().max(36).nullable().default(null), date: z.iso.date(), durationMinutes: z.number().int().min(1).max(1440), note: z.string().max(500).default('') }),
};
const resources = Object.keys(schemas) as StudyResourceName[];
function resource(value: string | string[] | undefined): StudyResourceName { if (typeof value !== 'string' || !resources.includes(value as StudyResourceName)) throw new HttpError(404, 'Unknown study resource.', 'RESOURCE_NOT_FOUND'); return value as StudyResourceName; }
function param(value: string | string[] | undefined) { if (typeof value !== 'string' || !value) throw new HttpError(400, 'Invalid route parameter.', 'INVALID_ROUTE_PARAM'); return value; }
function validateSessionTimes(resourceName: StudyResourceName, body: Record<string, unknown>) {
  if (resourceName !== 'course-sessions') return;
  if (typeof body.startTime === 'string' && typeof body.endTime === 'string' && body.endTime <= body.startTime) {
    throw new HttpError(400, 'Giờ kết thúc phải sau giờ bắt đầu.', 'INVALID_SESSION_TIME');
  }
  if (typeof body.periodStart === 'number' && typeof body.periodEnd === 'number' && body.periodEnd < body.periodStart) {
    throw new HttpError(400, 'Tiết kết thúc phải bằng hoặc sau tiết bắt đầu.', 'INVALID_SESSION_PERIOD');
  }
}
export function createStudyRouter(services: AppServices) {
  const router = Router(); router.use(requireAuth(services.auth));
  router.get('/summary', asyncHandler(async (req, res) => res.json(await services.study.summary(req.userId!, typeof req.query.semester === 'string' ? req.query.semester : undefined))));
  router.get('/:resource', asyncHandler(async (req, res) => res.json(await services.study.list(req.userId!, resource(req.params.resource)))));
  router.post('/:resource', asyncHandler(async (req, res) => { const name = resource(req.params.resource); const body = schemas[name].parse(req.body); validateSessionTimes(name, body as Record<string, unknown>); res.status(201).json(await services.study.create(req.userId!, name, body)); }));
  router.patch('/:resource/:id', asyncHandler(async (req, res) => { const name = resource(req.params.resource); const body = schemas[name].partial().parse(req.body); validateSessionTimes(name, body as Record<string, unknown>); res.json(await services.study.update(req.userId!, name, param(req.params.id), body)); }));
  router.delete('/:resource/:id', asyncHandler(async (req, res) => { await services.study.delete(req.userId!, resource(req.params.resource), param(req.params.id)); res.status(204).end(); }));
  return router;
}

