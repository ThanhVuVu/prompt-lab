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

// Field rules are defined once and reused by the create AND update schemas,
// so the two can never drift apart.
const title = z.string().trim().min(3).max(100);
const content = z.string().min(10).max(10000);
// A tag is a short, non-empty label. Without these limits a client could send
// "" or a 1 MB string as a tag.
const tags = z.array(z.string().trim().min(1).max(30)).max(5);
const isPublic = z.boolean();

/**
 * POST /api/prompts body.
 *   title     required, string, 3-100 characters (after trimming spaces)
 *   content   required, string, 10-10000 characters
 *   tags      optional, array of strings, max 5 tags, defaults to []
 *   isPublic  optional, boolean, defaults to false
 *
 * Unknown keys (id, version, createdBy…) are STRIPPED by z.object() — this is
 * what protects us from "mass assignment".
 */
export const createPromptSchema = z.object({
  title,
  content,
  tags: tags.default([]),
  isPublic: isPublic.default(false),
});

/**
 * PATCH /api/prompts/:id body: every field optional, NO defaults
 * (a default here would silently overwrite existing values), and at least
 * one field must be present.
 */
export const updatePromptSchema = z
  .object({ title, content, tags, isPublic })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

/**
 * GET /api/prompts query string: ?page=2&limit=20
 * Query values are ALWAYS strings ("2"), so we coerce them to numbers.
 */
export const listPromptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
