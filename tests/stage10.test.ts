/**
 * Stage 10 — run with:  npm run test:stage10
 * A/B experiments with an LLM judge, cost tracking with budgets, and caching.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { RedisCache } from '../src/services/cache';
import { ClaudeRefusalError, ClaudeService } from '../src/services/claudeService';
import { summarize } from '../src/services/experimentService';
import { median, signTestPValue } from '../src/utils/stats';
import { missingVariables, placeholders, renderTemplate } from '../src/utils/template';
import { processJob } from '../src/workers/jobRunner';
import { createUser, TestUser } from './helpers/auth';
import { resetDatabase } from './helpers/db';
import { createPromptAs } from './helpers/factories';
import { FakeAnalyzer, FakeLLM, InMemoryJobQueue } from './helpers/fakes';

// ─────────────────────────────────────────────────────────── unit tests ──
describe('Stage 10: templates and statistics (unit)', () => {
  it('finds, checks and fills {{placeholders}}', () => {
    const t = 'Translate {{text}} into {{ language }}. Again: {{text}}';
    expect(placeholders(t)).toEqual(['text', 'language']);
    expect(missingVariables(t, { text: 'hi' })).toEqual(['language']);
    expect(renderTemplate(t, { text: 'hi', language: 'French' })).toBe('Translate hi into French. Again: hi');
    expect(() => renderTemplate(t, { text: 'hi' })).toThrow(/language/);
  });

  it('inserts values literally, even ones that look like regex replacement patterns', () => {
    expect(renderTemplate('Say {{x}}', { x: 'costs $1 and $& more' })).toBe('Say costs $1 and $& more');
  });

  it('sign test: lopsided results are significant, close ones are not', () => {
    expect(signTestPValue(5, 5)).toBe(1);
    expect(signTestPValue(7, 3)).toBeCloseTo(0.344, 3);
    expect(signTestPValue(5, 0)).toBeCloseTo(0.0625, 4); // 5–0 is still NOT < 0.05
    expect(signTestPValue(6, 0)).toBeCloseTo(0.03125, 5);
    expect(signTestPValue(0, 0)).toBe(1);
  });

  it('median ignores a single slow outlier', () => {
    expect(median([100, 110, 120, 9000])).toBe(115);
  });
});

// ────────────────────────────────────────────────────── integration tests ──
describe('Stage 10: A/B experiments', () => {
  let app: Express;
  let queue: InMemoryJobQueue;
  let alice: TestUser;
  let promptA: { id: string };
  let promptB: { id: string };

  const inputs = (n: number) => Array.from({ length: n }, (_, i) => ({ ticket: `Ticket #${i}: my order is late` }));

  beforeEach(async () => {
    await resetDatabase();
    queue = new InMemoryJobQueue();
    app = createApp({ jobQueue: queue });
    alice = await createUser(app, 'alice');
    promptA = await createPromptAs(app, alice, { content: 'Summarise this support ticket in detail: {{ticket}}' });
    promptB = await createPromptAs(app, alice, { content: 'CONCISE: one-sentence summary of this ticket: {{ticket}}' });
  });

  async function createExperiment(n = 6, user = alice) {
    return request(app)
      .post('/api/experiments')
      .set(user.auth)
      .send({ name: 'Detailed vs concise', promptAId: promptA.id, promptBId: promptB.id, inputs: inputs(n) });
  }

  async function runQueuedJob(llm: FakeLLM, random = () => 0.3) {
    const jobId = queue.enqueued.at(-1)!;
    await processJob(jobId, { db: prisma, analyzer: new FakeAnalyzer(), llm, random });
    return jobId;
  }

  it('POST /api/experiments → 202 with a status URL; the job is queued', async () => {
    const res = await createExperiment();

    expect(res.status).toBe(202);
    expect(res.body.statusUrl).toBe(`/api/experiments/${res.body.experimentId}`);
    expect(queue.enqueued).toEqual([res.body.jobId]);
  });

  it('400 when an input lacks a variable the prompts use, naming the field', async () => {
    const res = await request(app)
      .post('/api/experiments')
      .set(alice.auth)
      .send({ name: 'Broken', promptAId: promptA.id, promptBId: promptB.id, inputs: [{ ticket: 'ok' }, { wrong: 'x' }] });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('inputs.1.ticket');
    expect(queue.enqueued).toHaveLength(0);
  });

  it('400 for the same prompt twice or too many inputs', async () => {
    const same = await request(app)
      .post('/api/experiments')
      .set(alice.auth)
      .send({ name: 'x', promptAId: promptA.id, promptBId: promptA.id, inputs: inputs(1) });
    expect(same.status).toBe(400);
    expect((await createExperiment(21)).status).toBe(400);
  });

  it("404 when one of the prompts is someone else's private prompt", async () => {
    const bob = await createUser(app, 'bob');
    const res = await createExperiment(2, bob);
    expect(res.status).toBe(404);
  });

  it('runs every input through A and B, judges each, and finds B significantly better (6–0)', async () => {
    const created = await createExperiment(6);
    const llm = new FakeLLM('CONCISE');

    await runQueuedJob(llm);

    expect(llm.generateCalls).toHaveLength(12); // 6 inputs × 2 variants
    expect(llm.judgeCalls).toHaveLength(6);
    const res = await request(app).get(created.body.statusUrl).set(alice.auth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.results).toHaveLength(12);
    expect(res.body.results[0].input).toBe('Summarise this support ticket in detail: Ticket #0: my order is late');
    expect(res.body.summary).toMatchObject({ winner: 'B', ties: 0, A: { wins: 0 }, B: { wins: 6 } });
    expect(res.body.summary.pValue).toBeLessThan(0.05);
  });

  it('5–0 is NOT declared a winner: too few inputs to rule out luck', async () => {
    const created = await createExperiment(5);
    await runQueuedJob(new FakeLLM('CONCISE'));

    const { summary } = (await request(app).get(created.body.statusUrl).set(alice.auth)).body;
    expect(summary.B.wins).toBe(5);
    expect(summary.winner).toBeNull();
    expect(summary.verdict).toMatch(/No significant difference/);
  });

  it('maps the judge\'s "first/second" back to A/B whichever order it saw them in', async () => {
    const created = await createExperiment(6);
    let flip = 0;
    await runQueuedJob(new FakeLLM('CONCISE'), () => (flip++ % 2 === 0 ? 0.1 : 0.9)); // alternate orders

    const res = await request(app).get(created.body.statusUrl).set(alice.auth);
    expect(res.body.judgments.map((j: { aShownFirst: boolean }) => j.aShownFirst)).toEqual([true, false, true, false, true, false]);
    expect(res.body.judgments.every((j: { winner: string }) => j.winner === 'B')).toBe(true);
  });

  it('resumes after a failure without paying for finished calls twice', async () => {
    await createExperiment(3);
    const llm = new FakeLLM();
    llm.failGenerateOnCall = 4; // the 4th generation fails once

    const jobId = queue.enqueued[0];
    await expect(processJob(jobId, { db: prisma, analyzer: new FakeAnalyzer(), llm }, { attempt: 1, maxAttempts: 3 })).rejects.toThrow();
    await processJob(jobId, { db: prisma, analyzer: new FakeAnalyzer(), llm }, { attempt: 2, maxAttempts: 3 });

    // 3 succeeded + 1 failed on attempt 1, then only the 3 remaining on attempt 2.
    expect(llm.generateCalls).toHaveLength(7);
    expect(await prisma.experimentResult.count()).toBe(6);
    expect(await prisma.costLog.count({ where: { operation: 'EXPERIMENT_RUN' } })).toBe(6);
  });

  it('uses the prompt SNAPSHOT: editing a prompt after creating the experiment changes nothing', async () => {
    const created = await createExperiment(2);
    await request(app).patch(`/api/prompts/${promptA.id}`).set(alice.auth).send({ content: 'Totally different now: {{ticket}}' });

    const llm = new FakeLLM();
    await runQueuedJob(llm);

    expect(llm.generateCalls[0]).toContain('Summarise this support ticket in detail');
    expect((await request(app).get(created.body.statusUrl).set(alice.auth)).body.promptAContent).toContain('in detail');
  });

  it("other users can't see an experiment (404)", async () => {
    const created = await createExperiment(2);
    const bob = await createUser(app, 'bob');
    expect((await request(app).get(created.body.statusUrl).set(bob.auth)).status).toBe(404);
  });

  it('summarize() reports medians, totals and ties', () => {
    const row = (inputIndex: number, promptVersion: string, latencyMs: number) =>
      ({ inputIndex, promptVersion, latencyMs, outputTokens: 10, costUsd: '0.001' }) as never;
    const s = summarize([row(0, 'A', 100), row(0, 'B', 300), row(1, 'A', 200), row(1, 'B', 500)], [{ winner: 'tie' } as never], 2);
    expect(s.A.medianLatencyMs).toBe(150);
    expect(s.B.totalCostUsd).toBe(0.002);
    expect(s.ties).toBe(1);
  });
});

// ─────────────────────────────────────────────────────── cost tracking ──
describe('Stage 10: cost tracking and budgets', () => {
  let app: Express;
  let queue: InMemoryJobQueue;
  let alice: TestUser;
  let admin: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    queue = new InMemoryJobQueue();
    app = createApp({ jobQueue: queue });
    alice = await createUser(app, 'alice');
    admin = await createUser(app, 'ada', 'admin');
  });

  it('every Claude call lands in the cost ledger, and /api/usage/me adds it up', async () => {
    const prompt = await createPromptAs(app, alice);
    await request(app).post(`/api/prompts/${prompt.id}/analyze`).set(alice.auth);
    await processJob(queue.enqueued[0], { db: prisma, analyzer: new FakeAnalyzer() }); // costs 0.0108

    const res = await request(app).get('/api/usage/me').set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.totalCostUsd).toBeCloseTo(0.0108, 6);
    expect(res.body.calls).toBe(1);
    expect(res.body.byOperation).toEqual([{ operation: 'PROMPT_ANALYSIS', costUsd: 0.0108, calls: 1 }]);
    expect(res.body.byDay).toHaveLength(1);
    expect(res.body.budget).toMatchObject({ monthlyBudgetUsd: 10, spentThisMonthUsd: 0.0108 });
  });

  it('402 BUDGET_EXCEEDED once this month\'s budget is used up; an admin can raise it', async () => {
    const prompt = await createPromptAs(app, alice);
    await request(app).patch(`/api/users/${alice.id}`).set(admin.auth).send({ monthlyBudgetUsd: 0.01 });
    await prisma.costLog.create({
      data: { userId: alice.id, operation: 'PROMPT_ANALYSIS', model: 'claude-opus-5-5', inputTokens: 1, outputTokens: 1, costUsd: 0.02 },
    });

    const blocked = await request(app).post(`/api/prompts/${prompt.id}/analyze`).set(alice.auth);
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe('BUDGET_EXCEEDED');
    expect(queue.enqueued).toHaveLength(0);

    await request(app).patch(`/api/users/${alice.id}`).set(admin.auth).send({ monthlyBudgetUsd: 5 });
    expect((await request(app).post(`/api/prompts/${prompt.id}/analyze`).set(alice.auth)).status).toBe(202);
  });

  it('last month\'s spending does not count against this month', async () => {
    await request(app).patch(`/api/users/${alice.id}`).set(admin.auth).send({ monthlyBudgetUsd: 0.01 });
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await prisma.costLog.create({
      data: { userId: alice.id, operation: 'PROMPT_ANALYSIS', model: 'claude-opus-5-5', inputTokens: 1, outputTokens: 1, costUsd: 99, createdAt: lastMonth },
    });

    const prompt = await createPromptAs(app, alice);
    expect((await request(app).post(`/api/prompts/${prompt.id}/analyze`).set(alice.auth)).status).toBe(202);
  });

  it('GET /api/usage/users is admin-only and ranks spenders', async () => {
    await prisma.costLog.create({
      data: { userId: alice.id, operation: 'EXPERIMENT_RUN', model: 'claude-opus-5-5', inputTokens: 1, outputTokens: 1, costUsd: 0.5 },
    });
    expect((await request(app).get('/api/usage/users').set(alice.auth)).status).toBe(403);

    const res = await request(app).get('/api/usage/users').set(admin.auth);
    expect(res.body.users).toEqual([{ userId: alice.id, costUsd: 0.5, calls: 1 }]);
  });

  it('400 for an invalid period', async () => {
    expect((await request(app).get('/api/usage/me?from=2026-10-10&to=2026-10-01').set(alice.auth)).status).toBe(400);
  });
});

// ───────────────────────────────────────────────────────────── caching ──
describe('Stage 10: caching', () => {
  let app: Express;
  let alice: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp({ jobQueue: new InMemoryJobQueue() }); // CACHE_DRIVER=memory in tests
    alice = await createUser(app, 'alice');
  });

  it('serves repeat reads from the cache, and an API write invalidates it', async () => {
    const prompt = await createPromptAs(app, alice, { title: 'Original title' });
    await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth); // miss → cached

    // Change the row BEHIND the service's back: the cache doesn't know…
    await prisma.prompt.update({ where: { id: prompt.id }, data: { title: 'Changed directly in SQL' } });
    const cached = await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth);
    expect(cached.body.title).toBe('Original title'); // …so this read is a (stale) cache hit

    // A write through the API invalidates the key.
    await request(app).patch(`/api/prompts/${prompt.id}`).set(alice.auth).send({ isPublic: true });
    const fresh = await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth);
    expect(fresh.body.title).toBe('Changed directly in SQL');
    expect(fresh.body.isPublic).toBe(true);
  });

  it('a cached prompt still goes through the permission check', async () => {
    const prompt = await createPromptAs(app, alice); // private
    await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth); // now cached
    const bob = await createUser(app, 'bob');
    expect((await request(app).get(`/api/prompts/${prompt.id}`).set(bob.auth)).status).toBe(404);
  });

  it('deleting a prompt evicts it (no "ghost" reads)', async () => {
    const prompt = await createPromptAs(app, alice);
    await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth);
    await request(app).delete(`/api/prompts/${prompt.id}`).set(alice.auth);
    expect((await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth)).status).toBe(404);
  });

  it('cache hits and misses are counted in /metrics', async () => {
    const prompt = await createPromptAs(app, alice);
    await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth);
    await request(app).get(`/api/prompts/${prompt.id}`).set(alice.auth);
    const metrics = (await request(app).get('/metrics')).text;
    expect(metrics).toMatch(/cache_requests_total\{result="hit"\} [1-9]/);
    expect(metrics).toMatch(/cache_requests_total\{result="miss"\} [1-9]/);
  });

  it('RedisCache stores JSON with a TTL (real Redis)', async () => {
    const cache = new RedisCache();
    try {
      await cache.set('test:key', { n: 1 }, 1);
      expect(await cache.get('test:key')).toEqual({ n: 1 });
      await cache.del('test:key');
      expect(await cache.get('test:key')).toBeUndefined();
    } finally {
      await cache.close();
    }
  });
});

// ─────────────────────────────────────── ClaudeService (mocked SDK client) ──
describe('Stage 10: ClaudeService.generate / judge', () => {
  const usage = { input_tokens: 1000, output_tokens: 500 };

  it('generate() joins the text blocks and prices the call', async () => {
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      model: 'claude-opus-5-5',
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
      usage,
    });
    const client = { beta: { messages: { create } } } as unknown as Anthropic;

    const result = await new ClaudeService(client).generate('Say hello');

    expect(result.output).toBe('Hello world');
    expect(result.costUsd).toBe(0.014);
    expect(create.mock.calls[0][0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' });
  });

  it('generate() turns a refusal into ClaudeRefusalError', async () => {
    const create = jest.fn().mockResolvedValue({ stop_reason: 'refusal', stop_details: null, model: 'claude-opus-5-5', content: [], usage });
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    await expect(new ClaudeService(client).generate('x')).rejects.toBeInstanceOf(ClaudeRefusalError);
  });

  it('judge() sends both responses as data and returns the structured verdict', async () => {
    const parse = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      model: 'claude-opus-5-5',
      parsed_output: { reasoning: 'second is tighter', winner: 'second' },
      usage,
    });
    const client = { beta: { messages: { parse } } } as unknown as Anthropic;

    const verdict = await new ClaudeService(client).judge({
      variables: { ticket: 'late order' },
      first: { prompt: 'P1', output: 'long answer' },
      second: { prompt: 'P2', output: 'short answer' },
    });

    expect(verdict.winner).toBe('second');
    const content: string = parse.mock.calls[0][0].messages[0].content;
    expect(content).toContain('<response_1>\nlong answer\n</response_1>');
    expect(content).toContain('<response_2>\nshort answer\n</response_2>');
  });
});
