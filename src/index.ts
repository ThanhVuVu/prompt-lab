/**
 * Entry point for the API process: load config, build the app, start listening.
 *   npm run dev     (development, auto-restart on save)
 *   npm run build && npm start   (production-style)
 *
 * Background jobs run in a separate process: src/worker.ts (npm run worker).
 */
import { buildServices, createApp } from './app';
import { env } from './config/env';

const services = buildServices();
const app = createApp(services);

const server = app.listen(env.PORT, () => {
  console.log(`Prompt Lab API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown: when the platform (Docker, Fly.io) asks us to stop,
// stop accepting connections, finish in-flight requests, then close the
// queue and database connections.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await services.jobQueue.close();
      await services.db.$disconnect();
      process.exit(0);
    });
  });
}
