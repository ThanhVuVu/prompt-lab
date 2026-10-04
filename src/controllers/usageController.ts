import { Request, Response } from 'express';
import { z } from 'zod';
import { formatZodError } from '../middleware/validation';
import { CostService, startOfMonthUtc } from '../services/costService';
import { ValidationError } from '../utils/errors';

// ?from=2026-10-01&to=2026-11-01 (to is exclusive). Default: this month so far.
const periodSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .transform(({ from, to }) => ({ from: from ?? startOfMonthUtc(), to: to ?? new Date(Date.now() + 1000) }))
  .refine(({ from, to }) => from < to, { message: '`from` must be before `to`' });

function parsePeriod(req: Request) {
  const period = periodSchema.safeParse(req.query);
  if (!period.success) throw new ValidationError('Invalid period', formatZodError(period.error));
  return period.data;
}

export class UsageController {
  constructor(private readonly costs: CostService) {}

  /** GET /api/usage/me → my spending report + remaining budget */
  me = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = parsePeriod(req);
    res.status(200).json(await this.costs.report(req.user!.id, from, to));
  };

  /** GET /api/usage/users (admin) → spend per user, biggest first */
  byUser = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = parsePeriod(req);
    res.status(200).json({ from, to, users: await this.costs.spendByUser(from, to) });
  };
}
