/**
 * EXPERIMENT_RUN jobs: for every input, run prompt A and prompt B, then ask a
 * judge model which output is better. The lifecycle (status, retries) is
 * handled by jobRunner.ts.
 *
 * RESUMABLE: each finished cell (input × variant) and each judgment is saved
 * as soon as it's done, and skipped on the next attempt. If call #37 of 60
 * fails, the retry starts at #37 instead of paying for 36 calls again.
 */
import { UnrecoverableError } from 'bullmq';
import { claudeCostUsd } from '../config/metrics';
import { recordCost } from '../services/costService';
import { summarize } from '../services/experimentService';
import { renderTemplate } from '../utils/template';
import type { JobHandler } from './jobRunner';

type Variant = 'A' | 'B';

export const runExperiment: JobHandler = async (job, { db, llm, random = Math.random }) => {
  if (!llm) throw new UnrecoverableError('No LLM configured for experiments');
  const experiment = job.experimentId ? await db.experiment.findUnique({ where: { id: job.experimentId } }) : null;
  if (!experiment) throw new UnrecoverableError('The experiment was deleted');

  await db.experiment.update({ where: { id: experiment.id }, data: { status: 'running' } });

  const inputs = experiment.inputs as Record<string, string>[];
  const templates: Record<Variant, string> = { A: experiment.promptAContent, B: experiment.promptBContent };

  // ── 1. generate every missing output ───────────────────────────────────────
  const existing = await db.experimentResult.findMany({ where: { experimentId: experiment.id } });
  const outputs = new Map(existing.map((r) => [`${r.inputIndex}:${r.promptVersion}`, r.output]));

  for (const [i, values] of inputs.entries()) {
    for (const variant of ['A', 'B'] as const) {
      if (outputs.has(`${i}:${variant}`)) continue;

      const rendered = renderTemplate(templates[variant], values);
      const gen = await llm.generate(rendered);
      claudeCostUsd.inc({ model: gen.model }, gen.costUsd);

      await db.$transaction(async (tx) => {
        await tx.experimentResult.create({
          data: {
            experimentId: experiment.id,
            inputIndex: i,
            promptVersion: variant,
            input: rendered,
            output: gen.output,
            model: gen.model,
            inputTokens: gen.inputTokens,
            outputTokens: gen.outputTokens,
            costUsd: gen.costUsd,
            latencyMs: gen.latencyMs,
          },
        });
        await recordCost(tx, {
          userId: experiment.createdBy,
          operation: 'EXPERIMENT_RUN',
          model: gen.model,
          inputTokens: gen.inputTokens,
          outputTokens: gen.outputTokens,
          costUsd: gen.costUsd,
          resourceId: experiment.id,
        });
      });
      outputs.set(`${i}:${variant}`, gen.output);
    }
  }

  // ── 2. judge every input that has no verdict yet ───────────────────────────
  const judged = new Set(
    (await db.experimentJudgment.findMany({ where: { experimentId: experiment.id }, select: { inputIndex: true } })).map((j) => j.inputIndex),
  );

  for (const [i, values] of inputs.entries()) {
    if (judged.has(i)) continue;

    // LLM judges tend to prefer whichever answer they read first ("position
    // bias"). Randomising the order per input cancels that out on average.
    const aShownFirst = random() < 0.5;
    const order: [Variant, Variant] = aShownFirst ? ['A', 'B'] : ['B', 'A'];
    const side = (v: Variant) => ({ prompt: templates[v], output: outputs.get(`${i}:${v}`)! });

    const verdict = await llm.judge({ variables: values, first: side(order[0]), second: side(order[1]) });
    const winner = verdict.winner === 'tie' ? 'tie' : verdict.winner === 'first' ? order[0] : order[1];
    claudeCostUsd.inc({ model: verdict.model }, verdict.costUsd);

    await db.$transaction(async (tx) => {
      await tx.experimentJudgment.create({
        data: { experimentId: experiment.id, inputIndex: i, winner, reasoning: verdict.reasoning, aShownFirst },
      });
      await recordCost(tx, {
        userId: experiment.createdBy,
        operation: 'EXPERIMENT_JUDGE',
        model: verdict.model,
        inputTokens: verdict.inputTokens,
        outputTokens: verdict.outputTokens,
        costUsd: verdict.costUsd,
        resourceId: experiment.id,
      });
    });
  }

  // ── 3. done ────────────────────────────────────────────────────────────────
  const [results, judgments] = await Promise.all([
    db.experimentResult.findMany({ where: { experimentId: experiment.id } }),
    db.experimentJudgment.findMany({ where: { experimentId: experiment.id } }),
  ]);
  await db.experiment.update({ where: { id: experiment.id }, data: { status: 'completed', completedAt: new Date() } });

  const summary = summarize(results, judgments, inputs.length);
  return { experimentId: experiment.id, winner: summary.winner, pValue: summary.pValue, verdict: summary.verdict };
};
