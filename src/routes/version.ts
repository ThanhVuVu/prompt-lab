import { Router } from 'express';
import { VersionController } from '../controllers/versionController';

export function versionRoutes(): Router {
  const router = Router();
  const controller = new VersionController();

  router.get('/', controller.get);

  return router;
}
