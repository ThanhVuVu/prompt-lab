import { NextFunction, Request, Response } from 'express';

export const DEFAULT_USER_ID = 'demo-user';

/**
 * ⚠️  TEMPORARY — NOT SECURE. Replaced by real JWT auth in Stage 5.
 *
 * Until we have users and logins, we pretend: whatever the client puts in the
 * `x-user-id` header is "who they are". Any client can claim to be anyone —
 * which is exactly the problem Stage 5 solves.
 *
 * It lets you practise ownership checks (403) in Stage 3:
 *   curl -H "x-user-id: alice" ...
 */
export function fakeAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('x-user-id');
  req.userId = header && header.trim() !== '' ? header.trim() : DEFAULT_USER_ID;
  next();
}
