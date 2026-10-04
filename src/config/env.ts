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

  // TODO(stage2): This is a bug waiting to happen. LOG_REQUESTS=false in .env
  // arrives as the STRING "false" — and `if ("false")` is truthy!
  // Change this so loadEnv() returns a real boolean:
  //   "true"  → true,  "false" → false,  missing → true
  // Hint: look up z.stringbool() in the zod docs.
  LOG_REQUESTS: z.string().default('true'),

  // Stage 4+: add DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY here as you need them.
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate a set of environment variables.
 * Takes `source` as a parameter (instead of reading process.env directly) so
 * tests can pass in fake values.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}

export const env = loadEnv();
