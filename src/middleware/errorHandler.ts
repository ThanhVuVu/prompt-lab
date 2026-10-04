import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
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
export function errorHandler(err: unknown, req: Request, res: Response<ApiErrorBody>, _next: NextFunction): void {
  // Our own typed errors: we know exactly what status and message to send.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) },
    });
    return;
  }

  // express.json() throws these before any route runs.
  const bodyError = bodyParserError(err);
  if (bodyError) {
    res.status(bodyError.status).json({ error: { code: bodyError.code, message: bodyError.message } });
    return;
  }

  // Anything else is a bug on OUR side → 500. Log the full details (stack
  // included) for us, but never leak them to clients: stack traces reveal file
  // paths and library versions. The client gets the requestId instead, which
  // finds this exact log line.
  logger.error('unhandled error', {
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    method: req.method,
    path: req.originalUrl,
  });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      ...(req.id && { requestId: req.id }),
    },
  });
}

const BODY_PARSER_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  // '{"title": ' — not valid JSON
  'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
  // larger than express.json({ limit }) — found by a Stage 8 regression test (it used to be a 500)
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported content encoding' },
};

function bodyParserError(err: unknown) {
  const type = typeof err === 'object' && err !== null ? (err as { type?: string }).type : undefined;
  return type ? BODY_PARSER_ERRORS[type] : undefined;
}
