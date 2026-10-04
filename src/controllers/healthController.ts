import { Request, Response } from 'express';
import { env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';
import { JobQueue } from '../queues/analysisQueue';

const CHECK_TIMEOUT_MS = 2000;

/**
 * Two different questions, two endpoints:
 *
 *   GET /health        LIVENESS:  is the process alive? Cheap, no dependencies.
 *                      If it fails, the platform RESTARTS the container.
 *   GET /health/ready  READINESS: can we serve traffic (DB + Redis reachable)?
 *                      If it fails, the load balancer stops SENDING traffic
 *                      here but doesn't restart us: restarting wouldn't fix a
 *                      database outage.
 */
export class HealthController {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: JobQueue,
  ) {}

  live = (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok', env: env.NODE_ENV, uptimeSeconds: Math.round(process.uptime()) });
  };

  ready = async (_req: Request, res: Response): Promise<void> => {
    const [database, queue] = await Promise.all([
      check(() => this.db.$queryRaw`SELECT 1`),
      check(() => this.queue.ping()),
    ]);
    const ok = database.ok && queue.ok;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'unavailable', checks: { database, queue } });
  };
}

/** Runs one dependency check with a timeout: a hanging DB must not hang the health check. */
async function check(fn: () => Promise<unknown>): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
      }),
    ]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
