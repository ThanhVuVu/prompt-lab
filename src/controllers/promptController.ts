import { Request, Response } from 'express';
import { formatZodError } from '../middleware/validation';
import { listPromptsQuerySchema } from '../schemas/promptSchemas';
import { PromptService } from '../services/promptService';
import { CreatePromptDTO, Prompt, UpdatePromptDTO } from '../types';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

/**
 * HTTP layer for /api/prompts.
 *
 * Stage 4: handlers are now `async` because the service talks to the database.
 * Express 5 catches a rejected promise and forwards it to errorHandler, so a
 * thrown NotFoundError inside an async handler still becomes a 404.
 */
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  /** GET /api/prompts?page=1&limit=10 → 200 { data, total, page, limit } | 400 */
  list = async (req: Request, res: Response): Promise<void> => {
    const query = listPromptsQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new ValidationError('Invalid query parameters', formatZodError(query.error));
    }

    res.status(200).json(await this.promptService.list(query.data));
  };

  /** POST /api/prompts → 201 created prompt (+ Location header) */
  create = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.promptService.create(req.body as CreatePromptDTO, req.userId!);
    res.status(201).location(`/api/prompts/${prompt.id}`).json(prompt);
  };

  /** GET /api/prompts/:id → 200 | 404 */
  getById = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.findOrThrow(req.params.id as string));
  };

  /** GET /api/prompts/:id/versions → 200 [versions, newest first] | 404 */
  listVersions = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.findOrThrow(req.params.id as string);
    res.status(200).json(await this.promptService.listVersions(prompt.id));
  };

  /** PATCH /api/prompts/:id → 200 | 400 | 403 | 404 */
  update = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.findOwnedOrThrow(req.params.id as string, req.userId!);
    const { changeReason, ...changes } = req.body as UpdatePromptDTO & { changeReason?: string };
    const updated = await this.promptService.update(prompt.id, changes, req.userId!, changeReason);
    if (!updated) throw new NotFoundError(`Prompt ${prompt.id} not found`); // deleted meanwhile
    res.status(200).json(updated);
  };

  /** DELETE /api/prompts/:id → 204 (empty body) | 403 | 404 */
  delete = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.findOwnedOrThrow(req.params.id as string, req.userId!);
    await this.promptService.delete(prompt.id);
    res.status(204).send();
  };

  // ── helpers ────────────────────────────────────────────────────────────────

  private async findOrThrow(id: string): Promise<Prompt> {
    const prompt = await this.promptService.getById(id);
    if (!prompt) throw new NotFoundError(`Prompt ${id} not found`);
    return prompt;
  }

  /** 404 first, THEN 403 — so outsiders can't probe which ids exist. */
  private async findOwnedOrThrow(id: string, userId: string): Promise<Prompt> {
    const prompt = await this.findOrThrow(id);
    if (prompt.createdBy !== userId) throw new ForbiddenError('Only the owner can modify this prompt');
    return prompt;
  }
}
