import type { AppServices } from '../application/services/index.js';
import { config } from '../config.js';
import type { TaskCalendarRepository } from '../infrastructure/repositories/task-calendar-repository.js';
import { createAssistantActions } from './actions.js';
import { createAssistantRouter } from './router.js';
import { AssistantStore } from './store.js';

export function createAssistant(services: AppServices, calendar: TaskCalendarRepository) {
  const actions = createAssistantActions(services, calendar);
  const store = new AssistantStore(config.ASSISTANT_SETTINGS_KEY);
  return createAssistantRouter(services.auth, actions, undefined, store);
}
