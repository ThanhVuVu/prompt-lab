/**
 * Typed application errors.
 *
 * Instead of every controller writing `res.status(404).json(...)` by hand,
 * code anywhere (controller, service, middleware) can `throw new NotFoundError(...)`.
 * The central error handler (middleware/errorHandler.ts) turns it into a
 * consistent JSON response. One place decides the error format = consistent API.
 */

export interface ErrorDetail {
  /** Which field was wrong, e.g. "title" or "tags.2" */
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — the client sent something invalid. */
export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: ErrorDetail[]) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

/** 401 — we don't know who you are (missing, invalid or expired credentials). */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

/** 409 — the request conflicts with the current state (e.g. email already taken). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

/** 403 — we know who you are, but you are not allowed to do this. */
export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}

/** 404 — the resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

/** 503 — a dependency (database, queue, …) is down. Clients may retry later. */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}

/**
 * 501 — used by the skeleton for code you haven't written yet.
 * When you see this in a response, the message tells you which file to open.
 */
export class NotImplementedError extends AppError {
  constructor(what: string) {
    super(501, 'NOT_IMPLEMENTED', `TODO: ${what}`);
  }
}
