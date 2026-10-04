/**
 * Teach TypeScript that our middleware adds properties to Express's Request.
 * This is called "declaration merging". Without it, `req.user` is a type error.
 */
import { AuthUser } from './index';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by middleware/auth.ts → requireAuth, after verifying the JWT */
      user?: AuthUser;
    }
  }
}

export {};
