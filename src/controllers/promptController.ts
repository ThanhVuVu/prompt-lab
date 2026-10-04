import { Request, Response } from 'express';
import { formatZodError } from '../middleware/validation';
import { listPromptsQuerySchema } from '../schemas/promptSchemas';
import { PromptService } from '../services/promptService';
import { AuthUser, CreatePromptDTO, Prompt, UpdatePromptDTO } from '../types';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

/**
 * HTTP layer for /api/prompts. Every route here runs after requireAuth,
 * so req.user is always set.
 *
 * Authorization rules:
 *   read    owner, anyone if isPublic, or admin       (others get 404, see below)
 *   create  role 'user' or 'admin' (viewers are read-only; enforced in routes)
 *   update  owner only
 *   delete  owner or admin
 */
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  /** GET /api/prompts?page=1&limit=10 → 200 { data, total, page, limit } | 400 */
  list = async (req: Request, res: Response): Promise<void> => {
    const query = listPromptsQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new ValidationError('Invalid query parameters', formatZodError(query.error));
    }

    res.status(200).json(await this.promptService.list(query.data, req.user!));
  };

  /** POST /api/prompts → 201 created prompt (+ Location header) */
  create = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.promptService.create(req.body as CreatePromptDTO, req.user!);
    res.status(201).location(`/api/prompts/${prompt.id}`).json(prompt);
  };

  /** GET /api/prompts/:id → 200 | 404 */
  getById = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.findVisibleOrThrow(req.params.id as string, req.user!));
  };

  /** GET /api/prompts/:id/versions → 200 [versions, newest first] | 404 */
  listVersions = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.findVisibleOrThrow(req.params.id as string, req.user!);
    res.status(200).json(await this.promptService.listVersions(prompt.id));
  };

  /** PATCH /api/prompts/:id → 200 | 400 | 403 | 404 */
  update = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.findVisibleOrThrow(req.params.id as string, req.user!);
    if (prompt.createdBy !== req.user!.id) {
      throw new ForbiddenError('Only the owner can modify this prompt');
    }

    const { changeReason, ...changes } = req.body as UpdatePromptDTO & { changeReason?: string };
    const updated = await this.promptService.update(prompt.id, changes, req.user!, changeReason);
    if (!updated) throw new NotFoundError(`Prompt ${prompt.id} not found`); // deleted meanwhile
    res.status(200).json(updated);
  };

  /** DELETE /api/prompts/:id → 204 | 403 | 404 */
  delete = async (req: Request, res: Response): Promise<void> => {
    const prompt = await this.findVisibleOrThrow(req.params.id as string, req.user!);
    if (prompt.createdBy !== req.user!.id && req.user!.role !== 'admin') {
      throw new ForbiddenError('Only the owner or an admin can delete this prompt');
    }

    await this.promptService.delete(prompt.id, req.user!);
    res.status(204).send();
  };

  /**
   * Someone else's PRIVATE prompt is reported as 404, not 403: a 403 would
   * confirm that a private prompt with this id exists.
   */
  private async findVisibleOrThrow(id: string, user: AuthUser): Promise<Prompt> {
    const prompt = await this.promptService.getById(id);
    const visible = prompt && (prompt.isPublic || prompt.createdBy === user.id || user.role === 'admin');
    if (!prompt || !visible) throw new NotFoundError(`Prompt ${id} not found`);
    return prompt;
  }
}
