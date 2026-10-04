import { Router } from 'express';
import { HealthController } from '../controllers/healthController';
import { PrismaClient } from '../generated/prisma/client';
import { JobQueue } from '../queues/analysisQueue';

export function healthRoutes(db: PrismaClient, queue: JobQueue): Router {
  const router = Router();
  const controller = new HealthController(db, queue);

  router.get('/', controller.live);
  router.get('/ready', controller.ready);

  return router;
}
