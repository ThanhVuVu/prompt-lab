/**
 * Shared TypeScript types.
 *
 * `interface` describes the SHAPE of an object. Types disappear at runtime —
 * they help you and your editor, but they do NOT validate incoming JSON.
 * That's why Stage 3 adds runtime validation with zod (src/schemas/).
 */

// ── Stage 2: echo ────────────────────────────────────────────────────────────

export interface EchoResponse {
  received: string;
  /** ISO 8601, e.g. "2026-10-04T09:30:00.000Z" */
  timestamp: string;
}

// ── Stage 3: prompts ─────────────────────────────────────────────────────────

export interface Prompt {
  id: string;
  title: string;
  /** The actual prompt text sent to Claude */
  content: string;
  /** Starts at 1, +1 every time `content` changes */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /** User ID of the owner (from the x-user-id header until Stage 5) */
  createdBy: string;
  tags: string[];
  isPublic: boolean;
}

/** One row of a prompt's history (prompt_versions table). */
export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  content: string;
  changedBy: string;
  changeReason: string | null;
  createdAt: Date;
}

/** What a client may send to create a prompt (after validation + defaults). */
export interface CreatePromptDTO {
  title: string;
  content: string;
  tags: string[];
  isPublic: boolean;
}

/** What a client may send to update a prompt: every field optional. */
export type UpdatePromptDTO = Partial<CreatePromptDTO>;

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** Every error response from this API has exactly this shape. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}
