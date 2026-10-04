/**
 * Entry point: load config, build the app, start listening.
 *   npm run dev     (development, auto-restart on save)
 *   npm run build && npm start   (production-style)
 */
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Prompt Lab API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown: when the platform (Docker, Fly.io) asks us to stop,
// finish in-flight requests instead of dropping them. Matters in Stage 9.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  });
}
