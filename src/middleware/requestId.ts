import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from '../utils/requestContext';

// Accept a caller's id only if it looks sane: it ends up in our logs, so an
// attacker must not be able to inject newlines or megabytes of text.
const VALID_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Gives every request an id and returns it in the X-Request-Id response header.
 *
 * If a load balancer or another service already assigned one, we REUSE it, so
 * one id can be followed across every service the request touches (tracing).
 * When a user reports an error, ask for this id: it finds every log line for
 * their request.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();

  req.id = id;
  res.setHeader('X-Request-Id', id);

  // Everything that runs for this request, through every await, sees this context.
  requestContext.run({ requestId: id }, () => next());
}
