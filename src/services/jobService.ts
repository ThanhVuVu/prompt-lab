import { logger } from '../config/logger';
import { PrismaClient } from '../generated/prisma/client';
import { JobQueue } from '../queues/analysisQueue';
import { AuthUser } from '../types';
import { NotFoundError, ServiceUnavailableError } from '../utils/errors';
import { writeAudit } from './auditService';
import { CostService } from './costService';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export class JobService {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: JobQueue,
    private readonly costs: CostService,
  ) {}

  /**
   * Records an analysis job in Postgres, then puts a pointer to it on the queue.
   * Returns immediately: the slow Claude call happens later, in the worker.
   *
   * Two systems, no shared transaction ("dual write"): if Redis is down after
   * the row is committed, we mark the job failed rather than leave it "pending"
   * forever. (The robust fix is the transactional-outbox pattern; see the docs.)
   */
  async enqueueAnalysis(promptId: string, user: AuthUser) {
    // Stage 10: refuse paid work once this month's budget is used up (402).
    await this.costs.assertWithinBudget(user.id);

    const job = await this.db.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: { type: 'PROMPT_ANALYSIS', status: 'pending', promptId, userId: user.id },
      });
      await writeAudit(tx, {
        userId: user.id,
        action: 'PROMPT_ANALYSIS_REQUESTED',
        resourceType: 'prompt',
        resourceId: promptId,
        details: { jobId: created.id },
      });
      return created;
    });

    try {
      await this.queue.enqueue(job.id);
    } catch (err) {
      await this.db.job.update({
        where: { id: job.id },
        data: { status: 'failed', error: 'Could not enqueue job: queue unavailable' },
      });
      logger.error('enqueue failed', { jobId: job.id, error: err instanceof Error ? err.message : String(err) });
      throw new ServiceUnavailableError('The job queue is unavailable, please retry later');
    }
    return job;
  }

  /** A job is visible only to the user who started it (others get 404). */
  async getJob(id: string, user: AuthUser) {
    if (!isUuid(id)) throw new NotFoundError(`Job ${id} not found`);
    const job = await this.db.job.findFirst({ where: { id, userId: user.id }, include: { analysis: true } });
    if (!job) throw new NotFoundError(`Job ${id} not found`);
    return job;
  }

  async listAnalyses(promptId: string) {
    return this.db.promptAnalysis.findMany({ where: { promptId }, orderBy: { createdAt: 'desc' } });
  }
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
