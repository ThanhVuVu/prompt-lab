import { Router } from 'express';
import { PromptController } from '../controllers/promptController';
import { validateBody } from '../middleware/validation';
import { createPromptSchema, updatePromptSchema } from '../schemas/promptSchemas';
import { PromptService } from '../services/promptService';

/**
 * REST conventions: the URL names a RESOURCE (a noun); the HTTP method is the verb.
 *
 *   GET    /api/prompts       list      (safe, idempotent)
 *   POST   /api/prompts       create    (NOT idempotent: 2 calls = 2 prompts)
 *   GET    /api/prompts/:id   read one  (safe, idempotent)
 *   PATCH  /api/prompts/:id   partial update
 *   DELETE /api/prompts/:id   delete    (idempotent: the 2nd call changes nothing more)
 */
export function promptRoutes(promptService: PromptService): Router {
  const router = Router();
  const controller = new PromptController(promptService);

  router.get('/', controller.list);
  router.post('/', validateBody(createPromptSchema), controller.create);
  router.get('/:id', controller.getById);
  router.get('/:id/versions', controller.listVersions);
  router.patch('/:id', validateBody(updatePromptSchema), controller.update);
  router.delete('/:id', controller.delete);

  return router;
}
