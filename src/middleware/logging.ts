import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

/**
 * Logs one line per request, AFTER the response has been sent, e.g.
 *
 *   GET /api/prompts 200 3ms
 *   POST /api/prompts 400 1ms
 *
 * Stage 7 replaces console.log with a structured JSON logger and request IDs.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (!env.LOG_REQUESTS) {
    next();
    return;
  }

  // TODO(stage2): Record the start time (Date.now()).
  // TODO(stage2): Listen for the response's 'finish' event:
  //                 res.on('finish', () => { ... })
  //               and inside it console.log method, originalUrl, statusCode and
  //               the duration in ms.
  // Question to think about: why can't we just log the status code right here,
  // before calling next()?

  next();
}
