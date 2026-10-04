import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { httpRequestDuration } from '../config/metrics';

/**
 * One structured log line + one metric observation per request, written when
 * the response has finished (only then are status and duration known).
 *
 * Deliberately NOT logged: request bodies and the Authorization header. They
 * contain passwords and tokens, and logs are read by many people and kept for a long time.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = routeLabel(req);

    httpRequestDuration.observe({ method: req.method, route, status: String(res.statusCode) }, durationMs / 1000);

    if (!env.LOG_REQUESTS) return;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, 'request completed', {
      method: req.method,
      path: req.originalUrl,
      route,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      userId: req.user?.id,
      userAgent: req.header('user-agent'),
    });
  });

  next();
}

/**
 * The route PATTERN for metrics/logs, e.g. "/api/prompts/:id".
 * req.route is only set once a route handler matched; requests rejected
 * earlier (401 from router-level auth, 404s) get a fixed label instead.
 */
function routeLabel(req: Request): string {
  if (!req.route) return '(no route)';
  const pattern = `${req.baseUrl}${req.route.path}`;
  return pattern.length > 1 ? pattern.replace(/\/$/, '') : pattern;
}
