import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiErrorBody } from '../types';
import { AppError } from '../utils/errors';

/**
 * Catch-all for requests that matched no route. Registered after all routes.
 */
export function notFoundHandler(req: Request, res: Response<ApiErrorBody>): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}

/**
 * Central error handler. Express recognises it as an error handler because it
 * takes FOUR arguments (err, req, res, next). Anything thrown in a route —
 * or passed to next(err) — ends up here.
 *
 * Express 5 also forwards errors from async handlers automatically
 * (in Express 4 you had to try/catch every async route yourself).
 */
export function errorHandler(err: unknown, _req: Request, res: Response<ApiErrorBody>, _next: NextFunction): void {
  // Our own typed errors: we know exactly what status and message to send.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) },
    });
    return;
  }

  // express.json() throws this when the body is not valid JSON, e.g. '{"title": '.
  if (isBodyParseError(err)) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }

  // Anything else is a bug on OUR side → 500. Log the details for us, but never
  // leak stack traces to clients (they can reveal file paths, library versions…).
  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err);
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}

function isBodyParseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
}
