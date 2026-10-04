/**
 * Stage 6 — run with:  npm run test:stage6   (needs Redis for the last test)
 *
 * The Claude API is never called: tests inject a FakeAnalyzer. Real API calls
 * in tests would be slow, flaky, and cost money on every run.
 */
import Anthropic from '@anthropic-ai/sdk';
import { UnrecoverableError, Worker } from 'bullmq';
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { calculateCostUsd } from '../src/config/pricing';
import { ANALYSIS_QUEUE, AnalysisJobData, BullJobQueue, createRedisConnection } from '../src/queues/analysisQueue';
import { ClaudeRefusalError, ClaudeService } from '../src/services/claudeService';
// Stage 10 moved the shared job lifecycle into jobRunner.ts.
import { isRetryable, processJob as processAnalysisJob } from '../src/workers/jobRunner';
import { createUser, TestUser } from './helpers/auth';
import { resetDatabase } from './helpers/db';
import { FakeAnalyzer, fakeResult, InMemoryJobQueue } from './helpers/fakes';

const validPrompt = { title: 'Summarise tickets', content: 'Summarise this support ticket in one sentence: {{ticket}}' };

describe('Stage 6: async jobs', () => {
  let app: Express;
  let queue: InMemoryJobQueue;
  let alice: TestUser;
  let promptId: string;

  beforeEach(async () => {
    await resetDatabase();
    queue = new InMemoryJobQueue();
    app = createApp({ jobQueue: queue });
    alice = await createUser(app, 'alice');
    promptId = (await request(app).post('/api/prompts').set(alice.auth).send(validPrompt)).body.id;
  });

  async function requestAnalysis(): Promise<string> {
    const res = await request(app).post(`/api/prompts/${promptId}/analyze`).set(alice.auth);
    expect(res.status).toBe(202);
    return res.body.jobId;
  }

  describe('POST /api/prompts/:id/analyze', () => {
    it('returns 202 immediately with a job id and a status URL, and queues the job', async () => {
      const res = await request(app).post(`/api/prompts/${promptId}/analyze`).set(alice.auth);

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ status: 'pending', statusUrl: `/api/jobs/${res.body.jobId}` });
      expect(res.headers.location).toBe(res.body.statusUrl);
      expect(queue.enqueued).toEqual([res.body.jobId]);
    });

    it('404 for a prompt the user cannot see', async () => {
      const bob = await createUser(app, 'bob');
      const res = await request(app).post(`/api/prompts/${promptId}/analyze`).set(bob.auth);
      expect(res.status).toBe(404);
      expect(queue.enqueued).toHaveLength(0);
    });

    it('503 when the queue is down, and the job is marked failed (not stuck pending)', async () => {
      queue.failNext = true;
      const res = await request(app).post(`/api/prompts/${promptId}/analyze`).set(alice.auth);

      expect(res.status).toBe(503);
      const jobs = await prisma.job.findMany();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('failed');
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('shows pending, then completed with the result once the worker has run', async () => {
      const jobId = await requestAnalysis();

      const before = await request(app).get(`/api/jobs/${jobId}`).set(alice.auth);
      expect(before.body.status).toBe('pending');

      await processAnalysisJob(jobId, { db: prisma, analyzer: new FakeAnalyzer() });

      const after = await request(app).get(`/api/jobs/${jobId}`).set(alice.auth);
      expect(after.status).toBe(200);
      expect(after.body.status).toBe('completed');
      expect(after.body.result).toMatchObject({ clarity: 7, specificity: 5 });
      expect(after.body.analysis.costUsd).toBe('0.0108'); // DECIMAL arrives as a string, not a float
    });

    it("404 for another user's job", async () => {
      const jobId = await requestAnalysis();
      const bob = await createUser(app, 'bob');
      expect((await request(app).get(`/api/jobs/${jobId}`).set(bob.auth)).status).toBe(404);
    });

    it('404 for a malformed id', async () => {
      expect((await request(app).get('/api/jobs/nope').set(alice.auth)).status).toBe(404);
    });
  });

  describe('processAnalysisJob (the worker logic)', () => {
    it('stores the analysis with the prompt version and cost, visible at /analyses', async () => {
      const jobId = await requestAnalysis();
      const analyzer = new FakeAnalyzer();

      await processAnalysisJob(jobId, { db: prisma, analyzer });

      expect(analyzer.calls).toEqual([validPrompt.content]);
      const res = await request(app).get(`/api/prompts/${promptId}/analyses`).set(alice.auth);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ promptVersion: 1, model: 'claude-opus-5-5', inputTokens: 1200 });
    });

    it('is idempotent: running a completed job again does nothing', async () => {
      const jobId = await requestAnalysis();
      const analyzer = new FakeAnalyzer();

      await processAnalysisJob(jobId, { db: prisma, analyzer });
      await processAnalysisJob(jobId, { db: prisma, analyzer });

      expect(analyzer.calls).toHaveLength(1);
      expect(await prisma.promptAnalysis.count()).toBe(1);
    });

    it('a transient error leaves the job pending for a retry, until the last attempt fails it', async () => {
      const jobId = await requestAnalysis();
      const flaky = new FakeAnalyzer(async () => {
        throw new Error('529 overloaded');
      });

      await expect(processAnalysisJob(jobId, { db: prisma, analyzer: flaky }, { attempt: 1, maxAttempts: 3 })).rejects.toThrow('overloaded');
      expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('pending');

      await expect(processAnalysisJob(jobId, { db: prisma, analyzer: flaky }, { attempt: 3, maxAttempts: 3 })).rejects.toThrow('overloaded');
      const failed = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      expect(failed.status).toBe('failed');
      expect(failed.error).toContain('overloaded');
      expect(failed.attempts).toBe(3);
    });

    it('a refusal fails immediately and tells BullMQ not to retry', async () => {
      const jobId = await requestAnalysis();
      const refusing = new FakeAnalyzer(async () => {
        throw new ClaudeRefusalError('declined');
      });

      await expect(processAnalysisJob(jobId, { db: prisma, analyzer: refusing }, { attempt: 1, maxAttempts: 3 })).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
      expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('failed');
    });

    it('retries only transient API errors', () => {
      const apiError = (status: number) => Anthropic.APIError.generate(status, {}, 'x', new Headers());
      expect(isRetryable(apiError(429))).toBe(true);
      expect(isRetryable(apiError(529))).toBe(true);
      expect(isRetryable(apiError(401))).toBe(false); // bad API key: retrying won't fix it
      expect(isRetryable(apiError(400))).toBe(false);
      expect(isRetryable(new ClaudeRefusalError('no'))).toBe(false);
      expect(isRetryable(new Anthropic.AnthropicError('Could not resolve authentication method'))).toBe(false);
    });

    it('fails without retrying if the prompt was deleted meanwhile', async () => {
      const jobId = await requestAnalysis();
      await request(app).delete(`/api/prompts/${promptId}`).set(alice.auth);

      await expect(processAnalysisJob(jobId, { db: prisma, analyzer: new FakeAnalyzer() })).rejects.toBeInstanceOf(UnrecoverableError);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('failed');
    });
  });

  describe('ClaudeService (with a mocked SDK client)', () => {
    function mockClient(response: object) {
      const parse = jest.fn().mockResolvedValue(response);
      return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
    }

    it('sends the configured model, structured-output format and refusal fallback', async () => {
      const { client, parse } = mockClient({
        stop_reason: 'end_turn',
        model: 'claude-opus-5-5',
        parsed_output: fakeResult.analysis,
        usage: { input_tokens: 1000, output_tokens: 500 },
      });

      const result = await new ClaudeService(client).analyze('Summarise {{text}}');

      const params = parse.mock.calls[0][0];
      expect(params.model).toBe('claude-opus-5-5');
      expect(params.fallbacks).toBe('default');
      expect(params.output_config.format).toBeDefined();
      expect(params.messages[0].content).toContain('Summarise {{text}}');
      expect(result.analysis).toEqual(fakeResult.analysis);
      expect(result.costUsd).toBe(0.014); // 1000 × $4/M + 500 × $20/M
    });

    it('throws ClaudeRefusalError on stop_reason "refusal"', async () => {
      const { client } = mockClient({
        stop_reason: 'refusal',
        stop_details: { category: 'cyber' },
        model: 'claude-opus-5-5',
        parsed_output: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      });
      await expect(new ClaudeService(client).analyze('x')).rejects.toBeInstanceOf(ClaudeRefusalError);
    });
  });

  describe('calculateCostUsd', () => {
    it('prices input and output tokens per model', () => {
      expect(calculateCostUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(24);
      expect(calculateCostUsd('claude-haiku-4-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(1);
    });

    it('prices cache reads at 10% of the input price', () => {
      expect(calculateCostUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000 })).toBe(0.4);
    });

    it('refuses to guess the price of an unknown model', () => {
      expect(() => calculateCostUsd('gpt-imaginary', { inputTokens: 1, outputTokens: 1 })).toThrow(/pricing/);
    });
  });

  describe('end to end through Redis (real BullMQ queue + worker)', () => {
    it('a queued job is picked up by a worker and completed', async () => {
      const realQueue = new BullJobQueue();
      const appWithRedis = createApp({ jobQueue: realQueue });
      const connection = createRedisConnection();
      const worker = new Worker<AnalysisJobData>(
        ANALYSIS_QUEUE,
        (job) => processAnalysisJob(job.data.jobId, { db: prisma, analyzer: new FakeAnalyzer() }),
        { connection },
      );

      try {
        const res = await request(appWithRedis).post(`/api/prompts/${promptId}/analyze`).set(alice.auth);
        expect(res.status).toBe(202);

        // Poll like a client would.
        let status = 'pending';
        for (let i = 0; i < 50 && status !== 'completed'; i++) {
          await new Promise((r) => setTimeout(r, 100));
          status = (await request(appWithRedis).get(res.body.statusUrl).set(alice.auth)).body.status;
        }
        expect(status).toBe('completed');
      } finally {
        await worker.close();
        await realQueue.close();
        await connection.quit();
      }
    });
  });
});
