/**
 * Runs ONE background job, whatever its type. The lifecycle (status updates,
 * idempotency, retry classification) lives here once; each job type only
 * supplies the actual work (analysisWorker.ts, experimentWorker.ts).
 *
 *   pending → processing → completed
 *                       ↘ (error) → pending (BullMQ retries after a backoff) → … → failed
 */
import Anthropic from '@anthropic-ai/sdk';
import { UnrecoverableError } from 'bullmq';
import { logger } from '../config/logger';
import { jobsProcessed } from '../config/metrics';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { ClaudeRefusalError, ExperimentLLM, PromptAnalyzer } from '../services/claudeService';
import { runAnalysis } from './analysisWorker';
import { runExperiment } from './experimentWorker';

export interface WorkerDeps {
  db: PrismaClient;
  analyzer: PromptAnalyzer;
  llm?: ExperimentLLM;
  /** Injectable randomness (judge ordering), so tests are deterministic. */
  random?: () => number;
}

export interface AttemptInfo {
  attempt: number; // 1-based
  maxAttempts: number;
}

export type JobRow = Prisma.JobGetPayload<object>;

/** What a job type returns on success: stored in jobs.result. */
export type JobHandler = (job: JobRow, deps: WorkerDeps) => Promise<Prisma.InputJsonValue>;

const HANDLERS: Record<string, JobHandler> = {
  PROMPT_ANALYSIS: runAnalysis,
  EXPERIMENT_RUN: runExperiment,
};

export async function processJob(
  jobId: string,
  deps: WorkerDeps,
  { attempt, maxAttempts }: AttemptInfo = { attempt: 1, maxAttempts: 1 },
): Promise<void> {
  const { db } = deps;

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new UnrecoverableError(`Job ${jobId} does not exist`);

  // Idempotency: a message can be delivered twice (e.g. the worker crashed
  // after finishing but before acknowledging). Never do the work twice.
  if (job.status === 'completed') return;

  const handler = HANDLERS[job.type];
  if (!handler) throw new UnrecoverableError(`Unknown job type ${job.type}`);

  await db.job.update({ where: { id: jobId }, data: { status: 'processing', attempts: attempt } });

  try {
    const result = await handler(job, deps);
    await db.job.update({
      where: { id: jobId },
      data: { status: 'completed', completedAt: new Date(), error: null, result },
    });
    jobsProcessed.inc({ type: job.type, outcome: 'completed' });
  } catch (err) {
    const unrecoverable = !isRetryable(err);
    const isLastAttempt = unrecoverable || attempt >= maxAttempts;
    const message = err instanceof Error ? err.message : String(err);

    jobsProcessed.inc({ type: job.type, outcome: isLastAttempt ? 'failed' : 'retrying' });
    logger.log(isLastAttempt ? 'error' : 'warn', 'job attempt failed', {
      jobId,
      type: job.type,
      attempt,
      maxAttempts,
      error: message,
      willRetry: !isLastAttempt,
    });

    await db.job.update({
      where: { id: jobId },
      // Not the last attempt → back to "pending": BullMQ will try again after a backoff.
      data: isLastAttempt ? { status: 'failed', error: message } : { status: 'pending', error: message },
    });
    if (isLastAttempt && job.experimentId) {
      await db.experiment.update({ where: { id: job.experimentId }, data: { status: 'failed' } });
    }

    if (unrecoverable && !(err instanceof UnrecoverableError)) throw new UnrecoverableError(message);
    throw err;
  }
}

/**
 * Retry only what can succeed next time: rate limits (429), overload and
 * server errors (5xx), timeouts and network failures. A bad API key, an
 * invalid request or a refusal will fail the same way every time.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof UnrecoverableError || err instanceof ClaudeRefusalError) return false;
  if (err instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (err instanceof Anthropic.APIError) {
    // status is undefined for client-side errors such as a missing API key
    return err.status === 429 || err.status === 408 || err.status === 409 || (err.status ?? 0) >= 500;
  }
  // Other SDK errors happen before any request is sent, e.g. a missing API key.
  if (err instanceof Anthropic.AnthropicError) return false;
  return true; // unknown errors (e.g. a DB blip): give it another try
}
