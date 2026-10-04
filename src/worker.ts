/**
 * Worker process entry point:  npm run worker   (dev: npm run worker:dev)
 *
 * Runs SEPARATELY from the API server. You can run several workers to process
 * more jobs in parallel, and a slow Claude call never ties up an API process.
 */
import { createServer } from 'node:http';
import { Worker } from 'bullmq';
import { prisma } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { registry } from './config/metrics';
import { ANALYSIS_QUEUE, AnalysisJobData, createRedisConnection } from './queues/analysisQueue';
import { ClaudeService } from './services/claudeService';
import { requestContext } from './utils/requestContext';
import { processAnalysisJob } from './workers/analysisWorker';

const analyzer = new ClaudeService();

const worker = new Worker<AnalysisJobData>(
  ANALYSIS_QUEUE,
  // Run each job inside a context so every log line it writes carries the job id.
  (job) =>
    requestContext.run({ requestId: `job:${job.data.jobId}` }, () =>
      processAnalysisJob(job.data.jobId, { db: prisma, analyzer }, {
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
      }),
    ),
  { connection: createRedisConnection(), concurrency: env.WORKER_CONCURRENCY },
);

worker.on('ready', () => logger.info('worker ready', { queue: ANALYSIS_QUEUE, concurrency: env.WORKER_CONCURRENCY }));
worker.on('completed', (job) => logger.info('job completed', { jobId: job.data.jobId, attempts: job.attemptsMade }));
worker.on('failed', (job, err) =>
  logger.warn('job attempt failed', { jobId: job?.data.jobId, attempt: job?.attemptsMade, error: err.message }),
);

// The worker is its own process, so it serves its own metrics endpoint.
const metricsServer = createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } else {
    res.statusCode = req.url === '/health' ? 200 : 404;
    res.end();
  }
}).listen(env.WORKER_METRICS_PORT, () => logger.info('worker metrics listening', { port: env.WORKER_METRICS_PORT }));

// Graceful shutdown: finish the jobs in progress, then exit. A killed worker
// would leave them "processing" until BullMQ's stalled-job check re-queues them.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info('shutting down worker', { signal });
    metricsServer.close();
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
