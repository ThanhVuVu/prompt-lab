import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ErrorDetail, ValidationError } from '../utils/errors';

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
  return (req: Request, _res: Response, next: NextFunction) => {
    // safeParse never throws: it returns { success: true, data } or { success: false, error }.
    // Note: in Express 5, req.body is `undefined` when no body was sent — the
    // schema rejects that too, because undefined is not an object.
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new ValidationError('Invalid request body', formatZodError(result.error)));
      return;
    }

    // Replace the raw body with the parsed one: defaults applied, unknown fields
    // stripped, strings trimmed. From here on, controllers can trust req.body.
    req.body = result.data;
    next();
  };
}
