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

  const start = Date.now();

  // Right now the route hasn't run yet, so the status code is unknown.
  // 'finish' fires once the response has been fully handed to the network.
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });

  next();
}
