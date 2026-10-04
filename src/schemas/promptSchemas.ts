/**
 * Runtime validation schemas (zod).
 *
 * TypeScript types (src/types) vanish at runtime. A client can send ANYTHING:
 * { "title": 42 }, { "tags": "not-an-array" }, a 50 MB string…
 * These schemas check the actual data at runtime.
 *
 * zod docs: https://zod.dev
 */
import { z } from 'zod';

/**
 * POST /api/prompts body.
 * Rules (from the learning plan):
 *   title     required, string, 3-100 characters (after trimming spaces)
 *   content   required, string, 10-10000 characters
 *   tags      optional, array of strings, max 5 tags, defaults to []
 *   isPublic  optional, boolean, defaults to false
 */
export const createPromptSchema = z.object({
  // Worked example:
  title: z.string().trim().min(3).max(100),

  // TODO(stage3): content
  // TODO(stage3): tags — also think: should a tag be allowed to be ""? 500 chars long?
  // TODO(stage3): isPublic
});

/**
 * PATCH /api/prompts/:id body.
 * Same rules as create, but every field is optional — the client only sends
 * what changes. An EMPTY body {} should be rejected (400): nothing to update.
 */
// TODO(stage3): Build this from createPromptSchema. Hints:
//   - .partial() makes every field optional
//   - but .partial() keeps the DEFAULTS — so {} would become { tags: [], isPublic: false }
//     and silently wipe the prompt's tags! Find a way to avoid that.
//   - .refine((data) => Object.keys(data).length > 0, { message: '...' })
export const updatePromptSchema = z.object({});

/**
 * GET /api/prompts query string: ?page=2&limit=20
 * Query values are ALWAYS strings ("2"), so we coerce them to numbers.
 *   page   integer >= 1, default 1
 *   limit  integer 1-100, default 10
 * Anything else (page=0, page=abc, limit=1000) → 400.
 */
export const listPromptsQuerySchema = z.object({
  // Worked example:
  page: z.coerce.number().int().min(1).default(1),

  // TODO(stage3): limit
});
