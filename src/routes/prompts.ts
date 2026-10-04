import { Router } from 'express';
import { PromptController } from '../controllers/promptController';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { createPromptSchema, updatePromptSchema } from '../schemas/promptSchemas';
import { AuthService } from '../services/authService';
import { PromptService } from '../services/promptService';

/**
 * REST conventions: the URL names a RESOURCE (a noun); the HTTP method is the verb.
 *
 * Middleware order per route: authenticate → authorize (role) → validate → handle.
 * Authenticating first means anonymous clients learn nothing, not even validation rules.
 */
export function promptRoutes(promptService: PromptService, authService: AuthService): Router {
  const router = Router();
  const controller = new PromptController(promptService);
  const canWrite = requireRole('user', 'admin');

  router.use(requireAuth(authService));

  router.get('/', controller.list);
  router.post('/', canWrite, validateBody(createPromptSchema), controller.create);
  router.get('/:id', controller.getById);
  router.get('/:id/versions', controller.listVersions);
  router.patch('/:id', canWrite, validateBody(updatePromptSchema), controller.update);
  router.delete('/:id', canWrite, controller.delete);

  return router;
}
