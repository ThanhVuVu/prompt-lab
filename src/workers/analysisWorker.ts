/**
 * PROMPT_ANALYSIS jobs: ask Claude to review one prompt, store the review and its cost.
 * The lifecycle around this (status, retries) is handled by jobRunner.ts.
 */
import { UnrecoverableError } from 'bullmq';
import { logger } from '../config/logger';
import { claudeCostUsd } from '../config/metrics';
import { recordCost } from '../services/costService';
import type { JobHandler } from './jobRunner';

export const runAnalysis: JobHandler = async (job, { db, analyzer }) => {
  const prompt = job.promptId ? await db.prompt.findUnique({ where: { id: job.promptId } }) : null;
  if (!prompt) throw new UnrecoverableError('The prompt was deleted before it could be analysed');

  // The slow part: seconds to tens of seconds. This is why it isn't done in the request.
  logger.info('analysing prompt', { jobId: job.id, promptId: prompt.id });
  const result = await analyzer.analyze(prompt.content);
  logger.info('analysis received', {
    jobId: job.id,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
  });
  claudeCostUsd.inc({ model: result.model }, result.costUsd);

  // Save the analysis and its cost-ledger entry atomically.
  await db.$transaction(async (tx) => {
    await tx.promptAnalysis.create({
      data: {
        promptId: prompt.id,
        jobId: job.id,
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
    });
    await recordCost(tx, {
      userId: job.userId,
      operation: 'PROMPT_ANALYSIS',
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      resourceId: prompt.id,
    });
  });

  return { ...result.analysis, model: result.model, costUsd: result.costUsd, latencyMs: result.latencyMs };
};
