/**
 * Stage 7 — run with:  npm run test:stage7
 * Request ids, structured logs, error reporting, metrics and health checks.
 */
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { PromptService } from '../src/services/promptService';
import { createUser, TestUser } from './helpers/auth';
import { resetDatabase } from './helpers/db';
import { InMemoryJobQueue } from './helpers/fakes';
import { captureLogs } from './helpers/logs';

describe('Stage 7: observability', () => {
  let app: Express;
  let queue: InMemoryJobQueue;
  let alice: TestUser;
  let logs: ReturnType<typeof captureLogs>;

  beforeEach(async () => {
    await resetDatabase();
    queue = new InMemoryJobQueue();
    app = createApp({ jobQueue: queue });
    alice = await createUser(app, 'alice');
    logs = captureLogs();
  });

  afterEach(() => logs.restore());

  const requestLines = () => logs.entries.filter((e) => e.message === 'request completed');

  describe('request ids', () => {
    it('every response carries an X-Request-Id', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("reuses a caller's valid id, so one id can be traced across services", async () => {
      const res = await request(app).get('/health').set('X-Request-Id', 'edge-proxy-1234abcd');
      expect(res.headers['x-request-id']).toBe('edge-proxy-1234abcd');
    });

    it('replaces an invalid incoming id (no log injection)', async () => {
      const res = await request(app).get('/health').set('X-Request-Id', 'bad id\twith tabs');
      expect(res.headers['x-request-id']).not.toContain('bad');
    });
  });

  describe('structured request logs', () => {
    it('logs one object per request with method, route pattern, status, duration, requestId and userId', async () => {
      const created = await request(app).post('/api/prompts').set(alice.auth).send({ title: 'Log me', content: 'Some prompt content here' });
      logs.entries.length = 0;

      const res = await request(app).get(`/api/prompts/${created.body.id}`).set(alice.auth);

      const [line] = requestLines();
      expect(line).toMatchObject({
        level: 'info',
        method: 'GET',
        route: '/api/prompts/:id',
        status: 200,
        requestId: res.headers['x-request-id'],
        userId: alice.id,
      });
      expect(typeof line.durationMs).toBe('number');
    });

    it('logs 4xx as warn and never logs passwords or tokens', async () => {
      await request(app).post('/api/auth/login').send({ email: alice.email, password: 'wrong-password-123' });

      const [line] = requestLines();
      expect(line.level).toBe('warn');
      expect(line.status).toBe(401);
      const everything = JSON.stringify(logs.entries);
      expect(everything).not.toContain('wrong-password-123');
      expect(everything).not.toContain(alice.token);
    });
  });

  describe('unexpected errors', () => {
    it('500 hides internals but returns the requestId; the log has the stack', async () => {
      const broken = new PromptService(null as never);
      broken.list = async () => {
        throw new Error('db exploded at /secret/path.ts');
      };
      const brokenApp = createApp({ jobQueue: queue, promptService: broken });

      const res = await request(brokenApp).get('/api/prompts').set(alice.auth);

      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('exploded');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);

      const errorLine = logs.entries.find((e) => e.message === 'unhandled error');
      expect(errorLine).toMatchObject({ level: 'error', requestId: res.headers['x-request-id'], userId: alice.id });
      expect(JSON.stringify(errorLine)).toContain('db exploded');
      expect(JSON.stringify(errorLine)).toContain('stack');
    });
  });

  describe('GET /metrics', () => {
    it('exposes a latency histogram labelled by route PATTERN, not by raw id', async () => {
      const created = await request(app).post('/api/prompts').set(alice.auth).send({ title: 'Metric me', content: 'Some prompt content here' });
      await request(app).get(`/api/prompts/${created.body.id}`).set(alice.auth);

      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.text).toContain('http_request_duration_seconds_bucket');
      expect(res.text).toContain('route="/api/prompts/:id"');
      expect(res.text).not.toContain(created.body.id);
    });
  });

  describe('health checks', () => {
    it('GET /health (liveness) needs no dependencies', async () => {
      queue.healthy = false;
      expect((await request(app).get('/health')).status).toBe(200);
    });

    it('GET /health/ready → 200 when the database and queue respond', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.checks.database.ok).toBe(true);
      expect(res.body.checks.queue.ok).toBe(true);
    });

    it('GET /health/ready → 503 naming the failing dependency', async () => {
      queue.healthy = false;
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.checks.queue).toMatchObject({ ok: false, error: 'Redis is down' });
      expect(res.body.checks.database.ok).toBe(true);
    });
  });
});
