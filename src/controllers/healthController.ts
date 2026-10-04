import { Request, Response } from 'express';
import { env } from '../config/env';

/**
 * CONTROLLER layer = translate HTTP ⇄ service calls.
 * Reads from req, calls a service, picks a status code, writes res.
 * Keep controllers THIN: no business rules here.
 *
 * (Worked example — compare it with GET /health in stage1/hello-server.ts.)
 */
export class HealthController {
  check = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'ok',
      env: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
    });
  };
}
