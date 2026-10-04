import { Request, Response, Router } from 'express';
import { env } from '../config/env';
import { registry } from '../config/metrics';
import { UnauthorizedError } from '../utils/errors';

/** GET /metrics in Prometheus text format. Optionally protected by METRICS_TOKEN. */
export function metricsRoutes(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    if (env.METRICS_TOKEN && req.header('authorization') !== `Bearer ${env.METRICS_TOKEN}`) {
      throw new UnauthorizedError('Invalid metrics token');
    }
    res.set('Content-Type', registry.contentType).send(await registry.metrics());
  });

  return router;
}
