import { Request, Response } from 'express';
import { formatZodError } from '../middleware/validation';
import { listPromptsQuerySchema } from '../schemas/promptSchemas';
import { PromptService } from '../services/promptService';
import { CreatePromptDTO, Prompt, UpdatePromptDTO } from '../types';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

/**
 * HTTP layer for /api/prompts.
 *
 * By the time a handler runs:
 *   - req.userId is set (middleware/fakeAuth.ts)
 *   - req.body has been validated (middleware/validation.ts) for POST/PATCH
 *
 * Errors are THROWN as typed errors; middleware/errorHandler.ts formats them.
 */
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  /** GET /api/prompts?page=1&limit=10 → 200 { data, total, page, limit } | 400 */
  list = (req: Request, res: Response): void => {
    const query = listPromptsQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new ValidationError('Invalid query parameters', formatZodError(query.error));
    }

    res.status(200).json(this.promptService.list(query.data));
  };

  /** POST /api/prompts → 201 created prompt (+ Location header) */
  create = (req: Request, res: Response): void => {
    const prompt = this.promptService.create(req.body as CreatePromptDTO, req.userId!);

    // REST convention: tell the client where the new resource lives.
    res.status(201).location(`/api/prompts/${prompt.id}`).json(prompt);
  };

  /** GET /api/prompts/:id → 200 | 404 */
  getById = (req: Request, res: Response): void => {
    res.status(200).json(this.findOrThrow(req.params.id as string));
  };

  /** PATCH /api/prompts/:id → 200 | 400 | 403 | 404 */
  update = (req: Request, res: Response): void => {
    const prompt = this.findOwnedOrThrow(req.params.id as string, req.userId!);
    const updated = this.promptService.update(prompt.id, req.body as UpdatePromptDTO);
    res.status(200).json(updated);
  };

  /** DELETE /api/prompts/:id → 204 (empty body) | 403 | 404 */
  delete = (req: Request, res: Response): void => {
    const prompt = this.findOwnedOrThrow(req.params.id as string, req.userId!);
    this.promptService.delete(prompt.id);
    res.status(204).send();
  };

  // ── helpers ────────────────────────────────────────────────────────────────

  private findOrThrow(id: string): Prompt {
    const prompt = this.promptService.getById(id);
    if (!prompt) throw new NotFoundError(`Prompt ${id} not found`);
    return prompt;
  }

  /**
   * 404 first, THEN 403. If we checked ownership first, an attacker could
   * probe ids: 403 = "exists but isn't yours", 404 = "doesn't exist".
   */
  private findOwnedOrThrow(id: string, userId: string): Prompt {
    const prompt = this.findOrThrow(id);
    if (prompt.createdBy !== userId) throw new ForbiddenError('Only the owner can modify this prompt');
    return prompt;
  }
}
