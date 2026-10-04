import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuthService } from '../services/authService';
import { Role } from '../types';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { currentContext } from '../utils/requestContext';

/**
 * AUTHENTICATION: who are you?
 * Expects `Authorization: Bearer <jwt>`. On success sets req.user; otherwise 401.
 */
export function requireAuth(authService: AuthService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedError('Missing bearer token');
    }

    req.user = await authService.verifyToken(token);
    // From now on every log line for this request carries the user id.
    const ctx = currentContext();
    if (ctx) ctx.userId = req.user.id;
    next();
  };
}

/**
 * AUTHORIZATION: are you allowed to do this?
 * Must run AFTER requireAuth. 403 if the user's role isn't in the list.
 *
 *   router.patch('/:id', requireAuth(auth), requireRole('admin'), controller.update)
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(' or ')}`);
    }
    next();
  };
}
