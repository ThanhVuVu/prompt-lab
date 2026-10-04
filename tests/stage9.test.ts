/**
 * Stage 9 — run with:  npm run test:stage9
 * Production hardening: config checks, security headers, brute-force protection.
 */
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createUser, TestUser } from './helpers/auth';
import { resetDatabase } from './helpers/db';
import { InMemoryJobQueue } from './helpers/fakes';

describe('Stage 9: production readiness', () => {
  describe('production config checks', () => {
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app:secret@db.internal:5432/prompt_lab',
      JWT_SECRET: 'k3Jx9-a-real-random-production-secret-value-0001',
    };

    it('accepts a real production configuration', () => {
      expect(loadEnv(prod).NODE_ENV).toBe('production');
    });

    it('refuses to start with the development JWT secret', () => {
      expect(() => loadEnv({ ...prod, JWT_SECRET: 'dev-only-secret-change-me-dev-only-secret-change-me' })).toThrow(/JWT_SECRET/);
    });

    it('refuses a localhost database in production', () => {
      expect(() => loadEnv({ ...prod, DATABASE_URL: 'postgresql://u:p@localhost:5432/db' })).toThrow(/DATABASE_URL/);
    });

    it('allows development defaults outside production', () => {
      expect(() => loadEnv({ ...prod, NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' })).not.toThrow();
    });
  });

  describe('HTTP hardening', () => {
    let app: Express;
    let alice: TestUser;

    beforeEach(async () => {
      await resetDatabase();
      app = createApp({ jobQueue: new InMemoryJobQueue() });
      alice = await createUser(app, 'alice');
    });

    it('sends security headers and hides X-Powered-By', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toContain('max-age=');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('rate-limits repeated logins for one email: 429 after LOGIN_RATE_LIMIT attempts', async () => {
      const attempt = () => request(app).post('/api/auth/login').send({ email: alice.email, password: 'guessing-123' });

      for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);

      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(blocked.headers['ratelimit-policy']).toBeDefined();

      // …even with the RIGHT password: the attacker can't keep guessing.
      const correct = await request(app).post('/api/auth/login').send({ email: alice.email, password: alice.password });
      expect(correct.status).toBe(429);
    });

    it("one blocked email doesn't lock out other users", async () => {
      for (let i = 0; i < 11; i++) {
        await request(app).post('/api/auth/login').send({ email: alice.email, password: 'guessing-123' });
      }
      const bob = await createUser(app, 'bob');
      const res = await request(app).post('/api/auth/login').send({ email: bob.email, password: bob.password });
      expect(res.status).toBe(200);
    });

    // Regression: the rate limiter keyed on the raw IP, which IPv6 clients can
    // rotate within their /64. express-rate-limit reports that at startup.
    it('builds the rate limiter without configuration warnings', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      createApp({ jobQueue: new InMemoryJobQueue() });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('ignores X-Forwarded-For when no proxy is trusted (clients cannot spoof their IP)', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app).post('/api/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: alice.email, password: 'guessing-123' });
      }
      const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.0.0.99').send({ email: alice.email, password: 'x' });
      expect(res.status).toBe(429);
    });
  });
});
