import { Router } from 'express';
import { HealthController } from '../controllers/healthController';

export function healthRoutes(): Router {
  const router = Router();
  const controller = new HealthController();

  router.get('/', controller.check);

  return router;
}
