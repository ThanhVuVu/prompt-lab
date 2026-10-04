/**
 * Builds the Express application (but does NOT start listening — see index.ts).
 *
 * Keeping "build the app" separate from "listen on a port" means tests can
 * create a fresh app in memory and send requests to it with supertest,
 * without opening a real port.
 */
import express, { Express } from 'express';
import { prisma } from './config/database';
import { PrismaClient } from './generated/prisma/client';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logging';
import { apiRoutes } from './routes';
import { AuthService } from './services/authService';
import { EchoService } from './services/echoService';
import { PromptService } from './services/promptService';
import './types/express';

/** Everything the routes need. Tests can pass in their own instances (dependency injection). */
export interface AppServices {
  db: PrismaClient;
  echoService: EchoService;
  authService: AuthService;
  promptService: PromptService;
}

export function buildServices(db: PrismaClient = prisma): AppServices {
  return {
    db,
    echoService: new EchoService(),
    authService: new AuthService(db),
    promptService: new PromptService(db),
  };
}

export function createApp(overrides: Partial<AppServices> = {}): Express {
  const services: AppServices = { ...buildServices(overrides.db), ...overrides };

  const app = express();

  // ORDER MATTERS: middleware runs top to bottom for every request.
  app.use(express.json({ limit: '100kb' })); // 1. parse JSON bodies (and cap their size)
  app.use(requestLogger); //                     2. log every request
  app.use(apiRoutes(services)); //               3. the actual endpoints (each route authenticates itself)
  app.use(notFoundHandler); //                   4. nothing matched → 404
  app.use(errorHandler); //                      5. something threw → error response

  return app;
}

export default createApp;
