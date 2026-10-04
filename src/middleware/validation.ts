import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ErrorDetail, NotImplementedError } from '../utils/errors';

/**
 * Converts zod's error into our API's `details` format:
 *   [{ path: 'title', message: 'Too small: expected string to have >=3 characters' }]
 * (Provided for you.)
 */
export function formatZodError(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
}

/**
 * Middleware FACTORY: you call it with a schema, it RETURNS a middleware.
 *
 *   router.post('/', validateBody(createPromptSchema), controller.create);
 *
 * Validation happens before the controller runs, so controllers can trust
 * req.body completely. "Never trust client input" — validate at the edge.
 */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction) => {
    // TODO(stage3): Run schema.safeParse(req.body).
    // TODO(stage3): If it failed → call next(new ValidationError('Invalid request body', formatZodError(result.error)))
    //               (import ValidationError from '../utils/errors').
    // TODO(stage3): If it succeeded → REPLACE req.body with result.data, then call next().
    //               Why replace it? result.data has defaults applied (tags: [],
    //               isPublic: false) and unknown fields stripped.
    // Gotcha: in Express 5, req.body is `undefined` when the client sends no body.
    next(new NotImplementedError('stage3: validateBody() in src/middleware/validation.ts'));
  };
}
