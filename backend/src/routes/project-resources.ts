import { raw, Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/async-handler.js';
import { HttpError } from '../http/errors.js';
import type { ProjectResourcesRepository } from '../infrastructure/repositories/project-resources-repository.js';

const id = z.uuid();
const fileName = z.string().trim().min(1).max(255).refine((name) =>
  !/[\\/\u0000-\u001f\u007f]/.test(name) && name !== '.' && name !== '..', 'Tên tệp không hợp lệ.');

export function createProjectResourcesRouter(resources: ProjectResourcesRepository, scope: 'project' | 'course' = 'project') {
  const router = Router({ mergeParams: true });
  const area = scope === 'project' ? 'projectId' : 'courseId';
  const items = scope === 'project' ? 'tasks' : 'assignments';
  router.get('/files', asyncHandler(async (req, res) => {
    res.json(await resources.listFiles(req.userId!, id.parse(req.params[area])));
  }));
  router.post('/files', raw({ type: 'application/octet-stream', limit: '10mb', inflate: false }), asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Hãy chọn một tệp có nội dung.');
    const file = await resources.addFile(req.userId!, id.parse(req.params[area]), null, fileName.parse(req.query.name), req.body);
    res.status(201).json(file);
  }));
  router.post(`/${items}/:taskId/files`, raw({ type: 'application/octet-stream', limit: '10mb', inflate: false }), asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Hãy chọn một tệp có nội dung.');
    const file = await resources.addFile(req.userId!, id.parse(req.params[area]), id.parse(req.params.taskId),
      fileName.parse(req.query.name), req.body);
    res.status(201).json(file);
  }));
  router.get('/files/:fileId', asyncHandler(async (req, res) => {
    const file = await resources.getFile(req.userId!, id.parse(req.params[area]), id.parse(req.params.fileId));
    res.attachment(file.name).type('application/octet-stream').set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(file.contents);
  }));
  router.delete('/files/:fileId', asyncHandler(async (req, res) => {
    await resources.deleteFile(req.userId!, id.parse(req.params[area]), id.parse(req.params.fileId));
    res.status(204).end();
  }));
  router.get('/timer', asyncHandler(async (req, res) => {
    res.json(await resources.timer(req.userId!, id.parse(req.params[area]), id.optional().parse(req.query.taskId)));
  }));
  router.post('/timer/start', asyncHandler(async (req, res) => {
    const { taskId, switchFrom } = z.strictObject({ taskId: id.nullable().optional(), switchFrom: id.optional() }).parse(req.body ?? {});
    if (scope === 'course' && !taskId) throw new HttpError(400, 'Hãy chọn bài tập để bấm giờ.', 'ASSIGNMENT_REQUIRED');
    res.json(await resources.startTimer(req.userId!, id.parse(req.params[area]), taskId ?? null, switchFrom));
  }));
  router.post('/timer/:sessionId/stop', asyncHandler(async (req, res) => {
    res.json(await resources.stopTimer(req.userId!, id.parse(req.params[area]), id.parse(req.params.sessionId)));
  }));
  return router;
}
