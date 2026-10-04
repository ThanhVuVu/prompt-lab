/**
 * Structured logging with winston.
 *
 * Every line is an OBJECT, not a sentence:
 *   {"level":"info","message":"request completed","method":"GET","path":"/api/prompts",
 *    "status":200,"durationMs":12,"requestId":"…","userId":"…","timestamp":"…"}
 * so a log platform can filter (status >= 500), group (by path) and trace (by requestId).
 *
 * Logs go to stdout. In containers the platform collects stdout (12-factor
 * app); writing log files inside a container just fills its disk.
 */
import winston from 'winston';
import { currentContext } from '../utils/requestContext';
import { env } from './env';

/** Adds requestId/userId from the current request (if any) to every log line. */
const addRequestContext = winston.format((info) => {
  const ctx = currentContext();
  if (ctx) {
    info.requestId ??= ctx.requestId;
    if (ctx.userId) info.userId ??= ctx.userId;
  }
  return info;
});

const format = env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty');

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  // Tests stay quiet unless something is wrong; they can still attach their own transport.
  silent: env.NODE_ENV === 'test',
  format: winston.format.combine(
    addRequestContext(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }), // logger.error(err) keeps the stack
    format === 'json'
      ? winston.format.json()
      : winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level.toUpperCase().padEnd(5)} ${message}${extra}`;
        }),
  ),
  transports: [new winston.transports.Console()],
});
