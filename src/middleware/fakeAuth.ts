import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database';

export const DEFAULT_USER_ID = 'demo-user';

/**
 * ⚠️  TEMPORARY — NOT SECURE. Replaced by real JWT auth in Stage 5.
 *
 * Whatever the client puts in the `x-user-id` header is "who they are".
 *
 * Stage 4 change: prompts.created_by is now a FOREIGN KEY to users.id, so the
 * user must exist in the database before they can own a prompt. We upsert
 * ("insert, or do nothing if it already exists") one on every request — a
 * write per request is wasteful, which is one more reason Stage 5 replaces this.
 */
export async function fakeAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header('x-user-id');
  const userId = header && header.trim() !== '' ? header.trim() : DEFAULT_USER_ID;

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@example.local`, name: userId },
  });

  req.userId = userId;
  next();
}
