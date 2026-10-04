/**
 * Worker process entry point:  npm run worker   (dev: npm run worker:dev)
 *
 * Runs SEPARATELY from the API server. You can run several workers to process
 * more jobs in parallel, and a slow Claude call never ties up an API process.
 */
import { Worker } from 'bullmq';
import { prisma } from './config/database';
import { env } from './config/env';
import { ANALYSIS_QUEUE, AnalysisJobData, createRedisConnection } from './queues/analysisQueue';
import { ClaudeService } from './services/claudeService';
import { processAnalysisJob } from './workers/analysisWorker';

const analyzer = new ClaudeService();

const worker = new Worker<AnalysisJobData>(
  ANALYSIS_QUEUE,
  async (job) =>
    processAnalysisJob(job.data.jobId, { db: prisma, analyzer }, {
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
    }),
  { connection: createRedisConnection(), concurrency: env.WORKER_CONCURRENCY },
);

worker.on('ready', () => console.log(`Worker listening on queue "${ANALYSIS_QUEUE}" (concurrency ${env.WORKER_CONCURRENCY})`));
worker.on('completed', (job) => console.log(`✔ job ${job.data.jobId} completed`));
worker.on('failed', (job, err) => console.error(`✖ job ${job?.data.jobId} attempt ${job?.attemptsMade} failed: ${err.message}`));

// Graceful shutdown: finish the jobs in progress, then exit. A killed worker
// would leave them "processing" until BullMQ's stalled-job check re-queues them.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`${signal} received, closing worker...`);
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
