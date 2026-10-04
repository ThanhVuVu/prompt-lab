/**
 * Builds the Express application (but does NOT start listening — see index.ts).
 *
 * Keeping "build the app" separate from "listen on a port" means tests can
 * create a fresh app in memory and send requests to it with supertest,
 * without opening a real port.
 */
import express, { Express } from 'express';
import { prisma } from './config/database';
import { env } from './config/env';
import { PrismaClient } from './generated/prisma/client';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logging';
import { requestId } from './middleware/requestId';
import { securityHeaders } from './middleware/security';
import { apiRoutes } from './routes';
import { BullJobQueue, JobQueue } from './queues/analysisQueue';
import { AuthService } from './services/authService';
import { EchoService } from './services/echoService';
import { JobService } from './services/jobService';
import { PromptService } from './services/promptService';
import './types/express';

/** Everything the routes need. Tests can pass in their own instances (dependency injection). */
export interface AppServices {
  db: PrismaClient;
  echoService: EchoService;
  authService: AuthService;
  promptService: PromptService;
  jobQueue: JobQueue;
  jobService: JobService;
}

export function buildServices(db: PrismaClient = prisma, jobQueue: JobQueue = new BullJobQueue()): AppServices {
  return {
    db,
    echoService: new EchoService(),
    authService: new AuthService(db),
    promptService: new PromptService(db),
    jobQueue,
    jobService: new JobService(db, jobQueue),
  };
}

export function createApp(overrides: Partial<AppServices> = {}): Express {
  const services: AppServices = { ...buildServices(overrides.db, overrides.jobQueue), ...overrides };

  const app = express();

  // Behind a proxy (Fly.io's edge), the TCP peer is the proxy. Trusting N hops
  // makes req.ip the real client IP (from X-Forwarded-For), which the login
  // rate limiter and the logs rely on. Never trust more hops than you have,
  // or clients can spoof their IP with a fake X-Forwarded-For header.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // ORDER MATTERS: middleware runs top to bottom for every request.
  app.use(requestId); //                         1. tag the request (first, so everything can log it)
  app.use(requestLogger); //                     2. log + time every request
  app.use(securityHeaders); //                   3. security headers on every response
  app.use(express.json({ limit: '100kb' })); // 4. parse JSON bodies (and cap their size)
  app.use(apiRoutes(services)); //               5. the actual endpoints (each route authenticates itself)
  app.use(notFoundHandler); //                   6. nothing matched → 404
  app.use(errorHandler); //                      7. something threw → error response

  return app;
}

export default createApp;
