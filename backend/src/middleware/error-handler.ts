import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';
import { ApplicationError } from '../application/errors.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ.',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof ApplicationError) {
    const status = error.code === 'INVALID_CREDENTIALS' || error.code === 'UNAUTHENTICATED' || error.code === 'SESSION_EXPIRED' ? 401
      : error.code === 'USER_NOT_FOUND' || error.code.endsWith('_NOT_FOUND') ? 404
      : error.code === 'ALREADY_EXISTS' ? 409
      : 400;
    response.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.NODE_ENV === 'production' ? 'Đã xảy ra lỗi máy chủ.' : String(error?.message ?? error),
    },
  });
};
