/**
 * The Redis-backed queue (BullMQ) for prompt-analysis jobs.
 *
 * Why BullMQ and not Bull? Same authors; Bull is in maintenance mode and BullMQ
 * is its TypeScript-first successor. The concepts (queue, worker, retries,
 * backoff) are identical.
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

export const ANALYSIS_QUEUE = 'prompt-analysis';

/** The message we put on the queue: just a pointer to the jobs row. */
export interface AnalysisJobData {
  jobId: string;
}

/** What the API needs from a queue. Tests swap in an in-memory fake. */
export interface JobQueue {
  enqueue(jobId: string): Promise<void>;
  close(): Promise<void>;
}

/** BullMQ needs maxRetriesPerRequest: null so blocking commands can wait forever. */
export function createRedisConnection(url: string = env.REDIS_URL): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export class BullJobQueue implements JobQueue {
  private queue?: Queue<AnalysisJobData>;
  private connection?: IORedis;

  // Created lazily: building the app (e.g. in tests that never queue anything)
  // shouldn't open a Redis connection.
  private get bull(): Queue<AnalysisJobData> {
    if (!this.queue) {
      this.connection = createRedisConnection();
      this.queue = new Queue<AnalysisJobData>(ANALYSIS_QUEUE, { connection: this.connection });
    }
    return this.queue;
  }

  async enqueue(jobId: string): Promise<void> {
    await this.bull.add(
      'analyze',
      { jobId },
      {
        // Use OUR id as BullMQ's job id: adding the same job twice is a no-op (idempotent).
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, …
        removeOnComplete: 1000, // keep Redis small; the DB row is the record
        removeOnFail: 5000,
      },
    );
  }

  async close(): Promise<void> {
    await this.queue?.close();
    // BullMQ never closes a connection it was given: that's our job.
    await this.connection?.quit();
  }
}
