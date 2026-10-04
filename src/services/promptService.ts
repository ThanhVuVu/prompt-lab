import { CreatePromptDTO, Paginated, PaginationParams, Prompt, UpdatePromptDTO } from '../types';
import { NotImplementedError } from '../utils/errors';

/**
 * Business logic for prompts, stored IN MEMORY (a Map).
 * Restart the server → all data is gone. Stage 4 swaps the Map for PostgreSQL;
 * because controllers only talk to this class, they won't need to change much.
 *
 * Rules:
 *  - No HTTP here (no req/res/status codes).
 *  - "Not found" is returned as `null` / `false`; the CONTROLLER decides that
 *    means 404. (Another valid design: throw NotFoundError here. Think about the trade-off.)
 */
export class PromptService {
  private prompts = new Map<string, Prompt>();

  /**
   * Create a prompt owned by `userId`.
   * - id: randomUUID()
   * - version: 1
   * - createdAt and updatedAt: the same new Date()
   */
  create(data: CreatePromptDTO, userId: string): Prompt {
    // TODO(stage3): Build the Prompt object, store it in this.prompts, return it.
    //               Hint: import { randomUUID } from 'node:crypto';
    throw new NotImplementedError('stage3: PromptService.create() in src/services/promptService.ts');
  }

  /** Returns the prompt, or null if there is no prompt with that id. */
  getById(id: string): Prompt | null {
    // TODO(stage3)
    throw new NotImplementedError('stage3: PromptService.getById() in src/services/promptService.ts');
  }

  /**
   * One page of prompts, oldest first (Map keeps insertion order).
   * page=1, limit=10 → items 0..9;  page=2 → items 10..19.
   * `total` is the count of ALL prompts, so a client can compute the number of pages.
   */
  list({ page, limit }: PaginationParams): Paginated<Prompt> {
    // TODO(stage3): Convert the Map's values to an array, slice out the right page.
    // Hint: const offset = (page - 1) * limit;
    throw new NotImplementedError('stage3: PromptService.list() in src/services/promptService.ts');
  }

  /**
   * Apply a partial update. Returns the updated prompt, or null if not found.
   * - Only change fields that are present in `data`.
   * - Bump `version` by 1 ONLY if `content` actually changed.
   * - Always refresh `updatedAt`.
   * - Never let the client change id, createdBy, createdAt or version directly.
   */
  update(id: string, data: UpdatePromptDTO): Prompt | null {
    // TODO(stage3)
    throw new NotImplementedError('stage3: PromptService.update() in src/services/promptService.ts');
  }

  /** Returns true if something was deleted, false if the id didn't exist. */
  delete(id: string): boolean {
    // TODO(stage3)
    throw new NotImplementedError('stage3: PromptService.delete() in src/services/promptService.ts');
  }
}
