import express from 'express';
import cors from 'cors';
import { createAssistant } from './assistant/index.js';
import { config } from './config.js';
import { db } from './database/index.js';
import { KyselyLifeOsRepository } from './infrastructure/repositories/kysely-lifeos-repository.js';
import { TaskCalendarRepository } from './infrastructure/repositories/task-calendar-repository.js';
import { errorHandler } from './middleware/error-handler.js';
import { createServices } from './application/services/index.js';
import { createAuthRouter } from './routes/auth.js';
import { createCalendarRouter } from './routes/calendar.js';
import { createPersonalRouter } from './routes/personal.js';
import { createPlanningRouter } from './routes/planning.js';
import { createProfileRouter } from './routes/profile.js';
import { createProjectsRouter } from './routes/projects.js';
import { createStudyRouter } from './routes/study.js';
import { createTasksRouter } from './routes/tasks.js';

const services = createServices(new KyselyLifeOsRepository());
const calendar = new TaskCalendarRepository();
export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()), methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use('/api/assistant', createAssistant(services, calendar));
app.use(express.json({ limit: '1mb' }));
app.get('/health', async (_request, response, next) => {
  try {
    await db.selectNoFrom((eb) => eb.val(1).as('ok')).executeTakeFirst();
    const revision = process.env.RENDER_GIT_COMMIT;
    if (revision) response.set('X-LifeOS-Revision', revision);
    response.json({ status: 'ok', database: 'postgres' });
  } catch (error) {
    next(error);
  }
});
app.use('/api/auth', createAuthRouter(services));
app.use('/api/profile', createProfileRouter(services));
app.use('/api/projects', createProjectsRouter(services));
app.use('/api/tasks', createTasksRouter(services));
app.use('/api/study', createStudyRouter(services));
app.use('/api/personal', createPersonalRouter(services));
app.use('/api/planning', createPlanningRouter(services));
app.use('/api/calendar', createCalendarRouter(services.auth, calendar));
app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }));
app.use(errorHandler);
