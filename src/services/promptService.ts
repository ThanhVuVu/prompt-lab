import { randomUUID } from 'node:crypto';
import { CreatePromptDTO, Paginated, PaginationParams, Prompt, UpdatePromptDTO } from '../types';

/**
 * Business logic for prompts, stored IN MEMORY (a Map).
 * Restart the server → all data is gone. Stage 4 swaps the Map for PostgreSQL;
 * because controllers only talk to this class, they won't need to change much.
 *
 * Rules:
 *  - No HTTP here (no req/res/status codes).
 *  - "Not found" is returned as `null` / `false`; the CONTROLLER decides that
 *    means 404.
 */
export class PromptService {
  private prompts = new Map<string, Prompt>();

  create(data: CreatePromptDTO, userId: string): Prompt {
    const now = new Date();
    const prompt: Prompt = {
      id: randomUUID(),
      title: data.title,
      content: data.content,
      tags: [...data.tags],
      isPublic: data.isPublic,
      version: 1,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    this.prompts.set(prompt.id, prompt);
    return clone(prompt);
  }

  getById(id: string): Prompt | null {
    const prompt = this.prompts.get(id);
    return prompt ? clone(prompt) : null;
  }

  /** One page of prompts, oldest first (a Map keeps insertion order). */
  list({ page, limit }: PaginationParams): Paginated<Prompt> {
    const all = [...this.prompts.values()];
    const offset = (page - 1) * limit;
    return {
      data: all.slice(offset, offset + limit).map(clone),
      total: all.length,
      page,
      limit,
    };
  }

  update(id: string, data: UpdatePromptDTO): Prompt | null {
    const existing = this.prompts.get(id);
    if (!existing) return null;

    const contentChanged = data.content !== undefined && data.content !== existing.content;

    // List the updatable fields explicitly instead of `{ ...existing, ...data }`:
    // even if a future bug let an extra field through validation, it could never
    // overwrite id, createdBy, createdAt or version.
    const updated: Prompt = {
      ...existing,
      title: data.title ?? existing.title,
      content: data.content ?? existing.content,
      tags: data.tags ? [...data.tags] : existing.tags,
      isPublic: data.isPublic ?? existing.isPublic,
      version: contentChanged ? existing.version + 1 : existing.version,
      updatedAt: new Date(),
    };
    this.prompts.set(id, updated);
    return clone(updated);
  }

  delete(id: string): boolean {
    return this.prompts.delete(id);
  }
}

/**
 * Return copies, not the stored objects: otherwise a caller doing
 * `prompt.title = 'x'` would silently change what's "in the database".
 * (A real database gives you copies automatically — Stage 4.)
 */
function clone(prompt: Prompt): Prompt {
  return { ...prompt, tags: [...prompt.tags] };
}
