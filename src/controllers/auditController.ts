import { Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../generated/prisma/client';
import { formatZodError } from '../middleware/validation';
import { ValidationError } from '../utils/errors';

const querySchema = z.object({
  userId: z.string().optional(),
  resourceId: z.string().optional(),
  action: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Read-only view of the audit trail, for admins. There is deliberately no update or delete. */
export class AuditController {
  constructor(private readonly db: PrismaClient) {}

  /** GET /api/audit-logs?userId=&resourceId=&action=&page=&limit= → 200 { data, total, page, limit } */
  list = async (req: Request, res: Response): Promise<void> => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) throw new ValidationError('Invalid query parameters', formatZodError(query.error));
    const { page, limit, ...filters } = query.data;

    const where = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined));
    const [total, data] = await this.db.$transaction([
      this.db.auditLog.count({ where }),
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    res.status(200).json({ data, total, page, limit });
  };
}
