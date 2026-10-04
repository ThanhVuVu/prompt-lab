import { env } from '../config/env';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { BudgetExceededError, NotFoundError } from '../utils/errors';

export type CostOperation = 'PROMPT_ANALYSIS' | 'EXPERIMENT_RUN' | 'EXPERIMENT_JUDGE';

export interface CostEntry {
  userId: string;
  operation: CostOperation;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  resourceId?: string;
}

/** Records one Claude call in the cost ledger. Pass a transaction client to write it atomically with the result. */
export async function recordCost(db: Prisma.TransactionClient, entry: CostEntry): Promise<void> {
  await db.costLog.create({ data: entry });
}

/** First instant of the current month, in UTC (budgets reset on the 1st). */
export function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface UsageReport {
  from: string;
  to: string;
  totalCostUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  byModel: { model: string; costUsd: number; calls: number }[];
  byOperation: { operation: string; costUsd: number; calls: number }[];
  byDay: { day: string; costUsd: number }[];
  budget: { monthlyBudgetUsd: number; spentThisMonthUsd: number; remainingUsd: number };
}

/**
 * Spending: the ledger (cost_logs) is the single source of truth. All the
 * aggregation runs in SQL (GROUP BY / SUM), never by loading rows into JS.
 */
export class CostService {
  constructor(private readonly db: PrismaClient) {}

  async spentThisMonth(userId: string): Promise<number> {
    const { _sum } = await this.db.costLog.aggregate({
      where: { userId, createdAt: { gte: startOfMonthUtc() } },
      _sum: { costUsd: true },
    });
    return Number(_sum.costUsd ?? 0);
  }

  async budgetFor(userId: string): Promise<number> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { monthlyBudgetUsd: true } });
    if (!user) throw new NotFoundError(`User ${userId} not found`);
    return user.monthlyBudgetUsd === null ? env.DEFAULT_MONTHLY_BUDGET_USD : Number(user.monthlyBudgetUsd);
  }

  /**
   * Call BEFORE queueing paid work. It's a soft limit: jobs already in flight
   * may push spend slightly past the budget, because we can't know a call's
   * cost before it finishes.
   */
  async assertWithinBudget(userId: string, estimatedCostUsd = 0): Promise<void> {
    const [budget, spent] = await Promise.all([this.budgetFor(userId), this.spentThisMonth(userId)]);
    if (spent + estimatedCostUsd > budget) {
      throw new BudgetExceededError(
        `Monthly Claude budget of $${budget.toFixed(2)} reached ($${spent.toFixed(4)} spent). Ask an admin to raise it.`,
      );
    }
  }

  async report(userId: string, from: Date, to: Date): Promise<UsageReport> {
    const where = { userId, createdAt: { gte: from, lt: to } };

    const [totals, byModel, byOperation, byDay, budget, spentThisMonth] = await Promise.all([
      this.db.costLog.aggregate({ where, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true }),
      this.db.costLog.groupBy({ by: ['model'], where, _sum: { costUsd: true }, _count: true }),
      this.db.costLog.groupBy({ by: ['operation'], where, _sum: { costUsd: true }, _count: true }),
      // Prisma's groupBy can't group by a computed day, so this one is raw SQL.
      // Tagged templates turn ${…} into bound parameters: no SQL injection.
      this.db.$queryRaw<{ day: Date; cost: Prisma.Decimal }[]>`
        SELECT date_trunc('day', created_at) AS day, SUM(cost_usd) AS cost
        FROM cost_logs
        WHERE user_id = ${userId} AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1 ORDER BY 1`,
      this.budgetFor(userId),
      this.spentThisMonth(userId),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalCostUsd: Number(totals._sum.costUsd ?? 0),
      calls: totals._count,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      byModel: byModel
        .map((r) => ({ model: r.model, costUsd: Number(r._sum.costUsd ?? 0), calls: r._count }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byOperation: byOperation
        .map((r) => ({ operation: r.operation, costUsd: Number(r._sum.costUsd ?? 0), calls: r._count }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byDay: byDay.map((r) => ({ day: r.day.toISOString().slice(0, 10), costUsd: Number(r.cost) })),
      budget: {
        monthlyBudgetUsd: budget,
        spentThisMonthUsd: spentThisMonth,
        remainingUsd: Math.max(0, budget - spentThisMonth),
      },
    };
  }

  /** Admin view: spend per user in a period, biggest spenders first. */
  async spendByUser(from: Date, to: Date) {
    const rows = await this.db.costLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: from, lt: to } },
      _sum: { costUsd: true },
      _count: true,
      orderBy: { _sum: { costUsd: 'desc' } },
    });
    return rows.map((r) => ({ userId: r.userId, costUsd: Number(r._sum.costUsd ?? 0), calls: r._count }));
  }
}
