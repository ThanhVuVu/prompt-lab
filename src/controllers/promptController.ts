import { Request, Response } from 'express';
import { listPromptsQuerySchema } from '../schemas/promptSchemas';
import { PromptService } from '../services/promptService';
import { NotImplementedError } from '../utils/errors';

/**
 * HTTP layer for /api/prompts.
 *
 * By the time a handler runs:
 *   - req.userId is set (middleware/fakeAuth.ts)
 *   - req.body has been validated (middleware/validation.ts) for POST/PATCH
 *
 * Error handling: THROW a typed error (NotFoundError, ForbiddenError,
 * ValidationError from '../utils/errors') and let middleware/errorHandler.ts
 * format the response. Don't write res.status(404)... in every handler.
 */
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  /**
   * GET /api/prompts?page=1&limit=10
   * 200 → { data: Prompt[], total, page, limit }
   * 400 → if page/limit are invalid
   */
  list = (_req: Request, _res: Response): void => {
    // TODO(stage3): Validate req.query with listPromptsQuerySchema.safeParse(...)
    //               On failure throw a ValidationError (use formatZodError from
    //               '../middleware/validation' for the details).
    // TODO(stage3): Call this.promptService.list({ page, limit })
    // TODO(stage3): Respond 200 with the result.
    throw new NotImplementedError('stage3: PromptController.list() in src/controllers/promptController.ts');
  };

  /**
   * POST /api/prompts   body: { title, content, tags?, isPublic? }
   * 201 → the created prompt
   */
  create = (_req: Request, _res: Response): void => {
    // TODO(stage3): req.body is already validated — treat it as CreatePromptDTO.
    // TODO(stage3): Create via this.promptService.create(body, req.userId!)
    // TODO(stage3): Respond 201 (Created) — not 200! — with the new prompt.
    // Extension: also set a `Location: /api/prompts/<id>` header (REST convention).
    throw new NotImplementedError('stage3: PromptController.create() in src/controllers/promptController.ts');
  };

  /**
   * GET /api/prompts/:id
   * 200 → the prompt
   * 404 → if it does not exist
   */
  getById = (_req: Request, _res: Response): void => {
    // TODO(stage3): Read the id from req.params.id
    // TODO(stage3): Fetch it; if null → throw new NotFoundError(`Prompt ${id} not found`)
    // TODO(stage3): Respond 200
    throw new NotImplementedError('stage3: PromptController.getById() in src/controllers/promptController.ts');
  };

  /**
   * PATCH /api/prompts/:id   body: any subset of { title, content, tags, isPublic }
   * 200 → updated prompt
   * 403 → caller is not the owner
   * 404 → prompt does not exist
   */
  update = (_req: Request, _res: Response): void => {
    // TODO(stage3): Fetch the prompt; 404 if missing.
    // TODO(stage3): If prompt.createdBy !== req.userId → throw new ForbiddenError()
    //   Question: why check 404 BEFORE 403? What would the opposite order leak?
    // TODO(stage3): Update via service, respond 200.
    throw new NotImplementedError('stage3: PromptController.update() in src/controllers/promptController.ts');
  };

  /**
   * DELETE /api/prompts/:id
   * 204 → deleted (empty body: use res.status(204).send())
   * 403 → not the owner
   * 404 → does not exist
   */
  delete = (_req: Request, _res: Response): void => {
    // TODO(stage3): Same 404 → 403 → act pattern as update.
    throw new NotImplementedError('stage3: PromptController.delete() in src/controllers/promptController.ts');
  };
}
