import { Router } from 'express';
import { AppServices } from '../app';
import { authRoutes } from './auth';
import { echoRoutes } from './echo';
import { healthRoutes } from './health';
import { jobRoutes } from './jobs';
import { metricsRoutes } from './metrics';
import { promptRoutes } from './prompts';
import { auditRoutes, userRoutes } from './users';
import { versionRoutes } from './version';

/** Mounts every feature router under its URL prefix. */
export function apiRoutes(services: AppServices): Router {
  const router = Router();

  router.use('/health', healthRoutes(services.db, services.jobQueue));
  router.use('/metrics', metricsRoutes());
  router.use('/version', versionRoutes());
  router.use('/echo', echoRoutes(services.echoService));
  router.use('/api/auth', authRoutes(services.authService));
  router.use('/api/users', userRoutes(services.authService));
  router.use('/api/audit-logs', auditRoutes(services.authService, services.db));
  router.use('/api/prompts', promptRoutes(services.promptService, services.authService, services.jobService));
  router.use('/api/jobs', jobRoutes(services.jobService, services.authService));

  return router;
}
