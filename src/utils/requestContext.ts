/**
 * Per-request context that follows a request through every `await`.
 *
 * AsyncLocalStorage is Node's "thread-local storage" for async code: anything
 * that runs as part of handling a request (controller, service, Prisma call…)
 * can read the current requestId without it being passed as a parameter.
 * The logger uses it to stamp every line with requestId and userId.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return requestContext.getStore();
}
