/**
 * The work done for ONE analysis job. Kept separate from BullMQ (src/worker.ts)
 * so it can be tested by calling a plain function.
 *
 * Job lifecycle:   pending → processing → completed
 *                                       ↘ (error) → retried by BullMQ → … → failed
 */
import Anthropic from '@anthropic-ai/sdk';
import { UnrecoverableError } from 'bullmq';
import { PrismaClient } from '../generated/prisma/client';
import { ClaudeRefusalError, PromptAnalyzer } from '../services/claudeService';

export interface AnalysisWorkerDeps {
  db: PrismaClient;
  analyzer: PromptAnalyzer;
}

export interface AttemptInfo {
  attempt: number; // 1-based
  maxAttempts: number;
}

export async function processAnalysisJob(
  jobId: string,
  deps: AnalysisWorkerDeps,
  { attempt, maxAttempts }: AttemptInfo = { attempt: 1, maxAttempts: 1 },
): Promise<void> {
  const { db, analyzer } = deps;

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new UnrecoverableError(`Job ${jobId} does not exist`);

  // Idempotency: a message can be delivered twice (e.g. the worker crashed
  // after finishing but before acknowledging). Never do the work twice.
  if (job.status === 'completed') return;

  await db.job.update({ where: { id: jobId }, data: { status: 'processing', attempts: attempt } });

  try {
    const prompt = job.promptId ? await db.prompt.findUnique({ where: { id: job.promptId } }) : null;
    if (!prompt) throw new UnrecoverableError('The prompt was deleted before it could be analysed');

    // The slow part: seconds to tens of seconds. This is why it isn't done in the request.
    const result = await analyzer.analyze(prompt.content);

    // Save the analysis and complete the job atomically.
    await db.$transaction([
      db.promptAnalysis.create({
        data: {
          promptId: prompt.id,
          jobId,
          promptVersion: prompt.version,
          clarity: result.analysis.clarity,
          specificity: result.analysis.specificity,
          summary: result.analysis.summary,
          suggestions: result.analysis.suggestions,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
        },
      }),
      db.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          error: null,
          result: { ...result.analysis, model: result.model, costUsd: result.costUsd, latencyMs: result.latencyMs },
        },
      }),
    ]);
  } catch (err) {
    const unrecoverable = !isRetryable(err);
    const isLastAttempt = unrecoverable || attempt >= maxAttempts;
    const message = err instanceof Error ? err.message : String(err);

    await db.job.update({
      where: { id: jobId },
      // Not the last attempt → back to "pending": BullMQ will try again after a backoff.
      data: isLastAttempt ? { status: 'failed', error: message } : { status: 'pending', error: message },
    });

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
