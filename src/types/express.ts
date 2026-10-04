/**
 * Teach TypeScript that our middleware adds properties to Express's Request.
 * This is called "declaration merging". Without it, `req.userId` is a type error.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by middleware/fakeAuth.ts (Stage 3) → middleware/auth.ts (Stage 5) */
      userId?: string;
    }
  }
}

export {};
