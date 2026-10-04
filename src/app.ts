/**
 * Builds the Express application (but does NOT start listening — see index.ts).
 *
 * Keeping "build the app" separate from "listen on a port" means tests can
 * create a fresh app in memory and send requests to it with supertest,
 * without opening a real port.
 */
import express, { Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { fakeAuth } from './middleware/fakeAuth';
import { requestLogger } from './middleware/logging';
import { apiRoutes } from './routes';
import { EchoService } from './services/echoService';
import { PromptService } from './services/promptService';
import './types/express';

/** Everything the routes need. Tests pass in fresh instances (dependency injection). */
export interface AppServices {
  echoService: EchoService;
  promptService: PromptService;
}

export function createApp(overrides: Partial<AppServices> = {}): Express {
  const services: AppServices = {
    echoService: new EchoService(),
    promptService: new PromptService(),
    ...overrides,
  };

  const app = express();

  // ORDER MATTERS: middleware runs top to bottom for every request.
  app.use(express.json({ limit: '100kb' })); // 1. parse JSON bodies (and cap their size)
  app.use(requestLogger); //                     2. log every request
  app.use(fakeAuth); //                          3. who is calling? (Stage 5: real auth)
  app.use(apiRoutes(services)); //               4. the actual endpoints
  app.use(notFoundHandler); //                   5. nothing matched → 404
  app.use(errorHandler); //                      6. something threw → error response

  return app;
}

export default createApp;
