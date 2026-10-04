/**
 * Environment configuration — the ONLY file that reads process.env.
 *
 * Why centralise this?
 *  - Fail fast: if a required variable is missing/invalid, crash at startup
 *    with a clear message instead of failing mysteriously at 3am.
 *  - Types: the rest of the code imports `env.PORT` as a number, not
 *    `process.env.PORT` as `string | undefined`.
 *
 * Values come from the real environment, or from a `.env` file in development
 * (see .env.example). Secrets NEVER go in code or git.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // process.env values are ALWAYS strings. z.coerce.number() turns "3000" into 3000.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Stage 7: observability
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  // json = one machine-readable object per line (production, log aggregators);
  // pretty = human-readable (local development). Default depends on NODE_ENV.
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  // If set, GET /metrics requires `Authorization: Bearer <METRICS_TOKEN>`.
  METRICS_TOKEN: z.string().min(16).optional(),

  // Env vars are strings: LOG_REQUESTS=false arrives as "false", and `if ("false")`
  // is truthy! z.stringbool() maps "true"/"1"/"yes" → true, "false"/"0"/"no" → false.
  LOG_REQUESTS: z.stringbool().default(true),

  // Required, no default: better to crash at startup than to silently connect
  // to the wrong database.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // Signs every JWT. Anyone who knows it can forge a token for ANY user, so it
  // must be long, random, secret, and different in every environment.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // How long a token stays valid ("15m", "1h", "7d").
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default('1h'),
  // bcrypt cost: each +1 doubles the hashing time. 12 ≈ 250ms in production;
  // tests use 4 to stay fast.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // Stage 6: job queue + Claude API
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).default('redis://localhost:6379'),
  // The Anthropic SDK reads ANTHROPIC_API_KEY from the environment itself, so it
  // isn't parsed here. Model and effort are config, not code, so they can be
  // changed without a deploy.
  CLAUDE_MODEL: z.string().default('claude-opus-5-5'),
  CLAUDE_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(2),
  // The worker serves its own /metrics (it's a separate process) on this port.
  WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9100),

  // Stage 9: production hardening
  // Failed + successful login attempts allowed per IP+email per 15 minutes.
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  // How many reverse proxies sit in front of us (Fly.io's edge = 1). Needed so
  // req.ip is the client's IP, not the proxy's. 0 = trust none (local dev).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  // Stage 10: cost tracking + caching
  // Monthly Claude spend allowed per user unless an admin sets their own budget.
  DEFAULT_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(10),
  // Max test inputs per A/B experiment (each costs 2 generations + 1 judgment).
  EXPERIMENT_MAX_INPUTS: z.coerce.number().int().min(1).max(200).default(20),
  // redis = shared by every instance (production); memory = per process (tests); none = off.
  CACHE_DRIVER: z.enum(['redis', 'memory', 'none']).default('redis'),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
});

/**
 * Extra rules for production: refuse to start with development defaults.
 * A forgotten dev JWT_SECRET in production means anyone can forge tokens.
 */
const productionSchema = envSchema.superRefine((e, ctx) => {
  if (e.NODE_ENV !== 'production') return;
  if (/dev-only|change-me|test-secret/i.test(e.JWT_SECRET)) {
    ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'uses a development value in production' });
  }
  if (/localhost|127\.0\.0\.1/.test(e.DATABASE_URL)) {
    ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'points at localhost in production' });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate a set of environment variables.
 * Takes `source` as a parameter (instead of reading process.env directly) so
 * tests can pass in fake values.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = productionSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}

export const env = loadEnv();
