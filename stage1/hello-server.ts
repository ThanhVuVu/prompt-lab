/**
 * STAGE 1 — HTTP & Web Fundamentals
 * ---------------------------------
 * A deliberately "flat" Express server: everything lives in this one file so
 * you can see the whole request → response cycle at once. In Stage 2 you will
 * split this into routes / controllers / services under src/.
 *
 * Run it:   npm run stage1         (restarts automatically when you save)
 * Test it:  npm run test:stage1
 *
 * Guide:    docs/stage-1-http.md
 */
import express, { NextFunction, Request, Response } from 'express';

export const app = express();

// Without this middleware, req.body is `undefined` for JSON requests.
// It reads the raw request body and, if the Content-Type header is
// `application/json`, parses it into a JS object on req.body.
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 1.1 — Look at the raw request
// ─────────────────────────────────────────────────────────────────────────────
// This middleware runs for EVERY request before your route handler.
// `next()` passes control to the next middleware/route. Forget it → the request hangs.
app.use((req: Request, _res: Response, next: NextFunction) => {
  // Set DEBUG_REQUESTS=1 to print every part of the incoming request.
  if (process.env.DEBUG_REQUESTS) {
    console.log('──', req.method, req.url);
    console.log('headers:', req.headers);
    console.log('query:  ', req.query);
    console.log('body:   ', req.body);
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Worked example — GET /health
// ─────────────────────────────────────────────────────────────────────────────
// Health checks let load balancers / deploy platforms (Stage 9) ask
// "is this server alive?". GET because it only READS and changes nothing.
app.get('/health', (_req: Request, res: Response) => {
  // res.status() sets the status line; res.json() serialises the object,
  // sets `Content-Type: application/json`, and sends the response.
  res.status(200).json({ status: 'ok' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 1.2 — POST /echo
// ─────────────────────────────────────────────────────────────────────────────
// Request:   POST /echo   body: { "message": "hello" }
// Success:   200  { "received": "hello", "timestamp": "<ISO 8601 string>" }
// Failure:   400  { "error": { "code": "VALIDATION_ERROR", "message": "..." } }
//            when `message` is missing, not a string, or an empty string.
//
// Why POST and not GET? GET requests should not carry a body, and POST is the
// conventional method for "here is some data, process it".
app.post('/echo', (req: Request, res: Response) => {
  // req.body is undefined when no JSON body was sent, so use optional chaining.
  const message: unknown = req.body?.message;

  if (typeof message !== 'string' || message.length === 0) {
    // `return` matters: without it the code below would try to send a 2nd response.
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '`message` must be a non-empty string' },
    });
    return;
  }

  res.status(200).json({ received: message, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exercise 1.3 — GET /time?format=iso|unix
// ─────────────────────────────────────────────────────────────────────────────
// Query params are always strings (or arrays of strings if repeated: ?format=a&format=b).
app.get('/time', (req: Request, res: Response) => {
  const format = req.query.format ?? 'iso';
  const now = new Date();

  if (format === 'iso') {
    res.status(200).json({ now: now.toISOString() });
    return;
  }
  if (format === 'unix') {
    res.status(200).json({ now: Math.floor(now.getTime() / 1000) });
    return;
  }
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: '`format` must be "iso" or "unix"' },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 for anything we didn't define (must be registered AFTER all routes)
// ─────────────────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
});

// Only start listening when this file is run directly (`npm run stage1`),
// not when it is imported by the tests (supertest starts its own server).
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Stage 1 server listening on http://localhost:${port}`);
  });
}
