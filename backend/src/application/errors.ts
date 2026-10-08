export type ApplicationErrorCode =
  | 'INVALID_CREDENTIALS' | 'UNAUTHENTICATED' | 'SESSION_EXPIRED'
  | 'USER_NOT_FOUND' | 'PROJECT_NOT_FOUND' | 'TASK_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND' | 'RESOURCE_ITEM_NOT_FOUND' | 'INVALID_COURSE' | 'INVALID_TASK_DEPENDENCY'
  | 'INVALID_CURRENT_PASSWORD' | 'INSUFFICIENT_COINS' | 'EMPTY_UPDATE'
  | 'ALREADY_EXISTS';

export class ApplicationError extends Error {
  constructor(public readonly code: ApplicationErrorCode, message: string) {
    super(message);
    this.name = 'ApplicationError';
  }
}
