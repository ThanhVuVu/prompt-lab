import { Router } from 'express';
import { ExperimentController } from '../controllers/experimentController';
import { UsageController } from '../controllers/usageController';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { createExperimentSchema } from '../schemas/experimentSchemas';
import { AuthService } from '../services/authService';
import { CostService } from '../services/costService';
import { ExperimentService } from '../services/experimentService';

export function experimentRoutes(experiments: ExperimentService, authService: AuthService): Router {
  const router = Router();
  const controller = new ExperimentController(experiments);

  router.use(requireAuth(authService));
  router.get('/', controller.list);
  router.post('/', requireRole('user', 'admin'), validateBody(createExperimentSchema), controller.create);
  router.get('/:id', controller.getById);

  return router;
}

export function usageRoutes(costs: CostService, authService: AuthService): Router {
  const router = Router();
  const controller = new UsageController(costs);

  router.use(requireAuth(authService));
  router.get('/me', controller.me);
  router.get('/users', requireRole('admin'), controller.byUser);

  return router;
}
