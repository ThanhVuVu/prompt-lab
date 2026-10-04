import { Router } from 'express';
import { AppServices } from '../app';
import { echoRoutes } from './echo';
import { healthRoutes } from './health';
import { promptRoutes } from './prompts';
import { versionRoutes } from './version';

/** Mounts every feature router under its URL prefix. */
export function apiRoutes(services: AppServices): Router {
  const router = Router();

  router.use('/health', healthRoutes());
  router.use('/version', versionRoutes());
  router.use('/echo', echoRoutes(services.echoService));
  router.use('/api/prompts', promptRoutes(services.promptService));

  // Stage 5: router.use('/api/auth', authRoutes(...));
  // Stage 6: router.use('/api/jobs', jobRoutes(...));

  return router;
}
