import { Prisma, PrismaClient } from '../generated/prisma/client';
import { JobQueue } from '../queues/analysisQueue';
import { CreateExperimentInput } from '../schemas/experimentSchemas';
import { AuthUser } from '../types';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '../utils/errors';
import { mean, median, signTestPValue } from '../utils/stats';
import { missingVariables } from '../utils/template';
import { writeAudit } from './auditService';
import { CostService } from './costService';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNIFICANCE = 0.05;

type ResultRow = Prisma.ExperimentResultGetPayload<object>;
type JudgmentRow = Prisma.ExperimentJudgmentGetPayload<object>;

export interface VariantStats {
  outputs: number;
  wins: number;
  medianLatencyMs: number;
  meanOutputTokens: number;
  totalCostUsd: number;
}

export interface ExperimentSummary {
  progress: { inputs: number; outputs: number; judged: number };
  A: VariantStats;
  B: VariantStats;
  ties: number;
  pValue: number;
  /** null until the difference is statistically significant */
  winner: 'A' | 'B' | null;
  verdict: string;
}

export class ExperimentService {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: JobQueue,
    private readonly costs: CostService,
  ) {}

  /**
   * Validates, snapshots both prompts, and queues the run. Returns at once
   * (202): 2 generations + 1 judgment per input can take minutes.
   */
  async create(input: CreateExperimentInput, user: AuthUser) {
    const [promptA, promptB] = await Promise.all([
      this.findVisiblePrompt(input.promptAId, user),
      this.findVisiblePrompt(input.promptBId, user),
    ]);

    // Fail now, not halfway through a paid run: every input must provide
    // every {{variable}} that either prompt uses.
    const details = input.inputs.flatMap((values, i) =>
      [...new Set([...missingVariables(promptA.content, values), ...missingVariables(promptB.content, values)])].map((name) => ({
        path: `inputs.${i}.${name}`,
        message: `Missing value for template variable {{${name}}}`,
      })),
    );
    if (details.length > 0) throw new ValidationError('Inputs do not match the prompt templates', details);

    await this.costs.assertWithinBudget(user.id);

    const { experiment, job } = await this.db.$transaction(async (tx) => {
      const experiment = await tx.experiment.create({
        data: {
          name: input.name,
          promptAId: promptA.id,
          promptBId: promptB.id,
          // Snapshot: editing a prompt later must not change this experiment.
          promptAContent: promptA.content,
          promptBContent: promptB.content,
          inputs: input.inputs,
          createdBy: user.id,
        },
      });
      const job = await tx.job.create({
        data: { type: 'EXPERIMENT_RUN', status: 'pending', experimentId: experiment.id, userId: user.id },
      });
      await writeAudit(tx, {
        userId: user.id,
        action: 'EXPERIMENT_CREATED',
        resourceType: 'experiment',
        resourceId: experiment.id,
        details: { promptAId: promptA.id, promptBId: promptB.id, inputs: input.inputs.length, jobId: job.id },
      });
      return { experiment, job };
    });

    try {
      await this.queue.enqueue(job.id);
    } catch {
      await this.db.$transaction([
        this.db.job.update({ where: { id: job.id }, data: { status: 'failed', error: 'Could not enqueue job' } }),
        this.db.experiment.update({ where: { id: experiment.id }, data: { status: 'failed' } }),
      ]);
      throw new ServiceUnavailableError('The job queue is unavailable, please retry later');
    }
    return { experiment, job };
  }

  /** Owner or admin only; anyone else gets 404. */
  async get(id: string, user: AuthUser) {
    if (!UUID_RE.test(id)) throw new NotFoundError(`Experiment ${id} not found`);
    const experiment = await this.db.experiment.findUnique({
      where: { id },
      include: {
        results: { orderBy: [{ inputIndex: 'asc' }, { promptVersion: 'asc' }] },
        judgments: { orderBy: { inputIndex: 'asc' } },
      },
    });
    if (!experiment || (experiment.createdBy !== user.id && user.role !== 'admin')) {
      throw new NotFoundError(`Experiment ${id} not found`);
    }
    const inputs = experiment.inputs as unknown[];
    return { ...experiment, summary: summarize(experiment.results, experiment.judgments, inputs.length) };
  }

  async list(user: AuthUser, page: number, limit: number) {
    const where = { createdBy: user.id };
    const [total, data] = await this.db.$transaction([
      this.db.experiment.count({ where }),
      this.db.experiment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, name: true, status: true, promptAId: true, promptBId: true, createdAt: true, completedAt: true },
      }),
    ]);
    return { data, total, page, limit };
  }

  private async findVisiblePrompt(id: string, user: AuthUser) {
    const prompt = await this.db.prompt.findUnique({ where: { id } });
    const visible = prompt && (prompt.isPublic || prompt.createdBy === user.id || user.role === 'admin');
    if (!prompt || !visible) throw new NotFoundError(`Prompt ${id} not found`);
    return prompt;
  }
}

/** Turns raw results + judgments into the numbers a human decides with. */
export function summarize(results: ResultRow[], judgments: JudgmentRow[], inputCount: number): ExperimentSummary {
  const stats = (variant: 'A' | 'B'): VariantStats => {
    const rows = results.filter((r) => r.promptVersion === variant);
    return {
      outputs: rows.length,
      wins: judgments.filter((j) => j.winner === variant).length,
      medianLatencyMs: median(rows.map((r) => r.latencyMs)),
      meanOutputTokens: Math.round(mean(rows.map((r) => r.outputTokens))),
      totalCostUsd: Number(rows.reduce((sum, r) => sum + Number(r.costUsd), 0).toFixed(6)),
    };
  };
  const A = stats('A');
  const B = stats('B');
  const ties = judgments.filter((j) => j.winner === 'tie').length;
  const pValue = signTestPValue(A.wins, B.wins);

  const leader = A.wins === B.wins ? null : A.wins > B.wins ? 'A' : 'B';
  const winner = leader && pValue < SIGNIFICANCE ? leader : null;
  const verdict =
    judgments.length === 0
      ? 'No judgments yet.'
      : winner
        ? `Prompt ${winner} wins ${winner === 'A' ? A.wins : B.wins}–${winner === 'A' ? B.wins : A.wins} (p = ${pValue.toFixed(3)} < ${SIGNIFICANCE}).`
        : `No significant difference yet (A ${A.wins} – B ${B.wins}, ${ties} ties, p = ${pValue.toFixed(3)}). Add more inputs to be sure.`;

  return {
    progress: { inputs: inputCount, outputs: results.length, judged: judgments.length },
    A,
    B,
    ties,
    pValue: Number(pValue.toFixed(4)),
    winner,
    verdict,
  };
}
