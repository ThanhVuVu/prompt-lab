import { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../config/env';

/**
 * Standard security headers (helmet): HSTS, X-Content-Type-Options: nosniff,
 * X-Frame-Options, a strict Content-Security-Policy… and removes the
 * X-Powered-By: Express header that advertises what we run.
 */
export const securityHeaders: RequestHandler = helmet();

/**
 * Brute-force protection for POST /api/auth/login: at most LOGIN_RATE_LIMIT
 * attempts per IP + email per 15 minutes, then 429 Too Many Requests.
 *
 * Keyed by IP *and* email so one attacker can't lock everyone out, and one
 * shared office IP doesn't block a whole company. The counters live in this
 * process's memory: with several API instances each has its own count. Use a
 * Redis store (rate-limit-redis) to share them.
 */
export function loginRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.LOGIN_RATE_LIMIT,
    standardHeaders: 'draft-8', // RateLimit / RateLimit-Policy response headers
    legacyHeaders: false,
    // ipKeyGenerator groups an IPv6 address by its /64 network: one IPv6 user
    // controls billions of addresses and could otherwise rotate past the limit.
    keyGenerator: (req: Request) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').toLowerCase()}`,
    // Same error shape as the rest of the API.
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, please try again later' },
      });
    },
  });
}
