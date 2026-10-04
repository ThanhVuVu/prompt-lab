/**
 * Stage 1 — run with:  npm run test:stage1
 *
 * supertest sends real HTTP requests to the app in memory (no port needed)
 * and lets you assert on the status, headers and body of the response.
 */
import request from 'supertest';
import { app } from '../stage1/hello-server';

describe('Stage 1: hello-server', () => {
  describe('GET /health', () => {
    it('returns 200 { status: "ok" } as JSON', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /echo', () => {
    it('echoes the message back with an ISO timestamp', async () => {
      const res = await request(app).post('/echo').send({ message: 'hello' });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe('hello');
      expect(typeof res.body.timestamp).toBe('string');
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });

    it('returns 400 when message is missing', async () => {
      const res = await request(app).post('/echo').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(typeof res.body.error.message).toBe('string');
    });

    it('returns 400 when message is not a string', async () => {
      const res = await request(app).post('/echo').send({ message: 42 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when message is an empty string', async () => {
      const res = await request(app).post('/echo').send({ message: '' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when there is no body at all', async () => {
      const res = await request(app).post('/echo');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /time', () => {
    it('defaults to an ISO string', async () => {
      const res = await request(app).get('/time');
      expect(res.status).toBe(200);
      expect(new Date(res.body.now).toISOString()).toBe(res.body.now);
    });

    it('returns unix seconds with ?format=unix', async () => {
      const res = await request(app).get('/time?format=unix');
      expect(res.status).toBe(200);
      expect(Number.isInteger(res.body.now)).toBe(true);
      expect(Math.abs(res.body.now - Date.now() / 1000)).toBeLessThan(5);
    });

    it('returns 400 for an unknown format', async () => {
      const res = await request(app).get('/time?format=xyz');
      expect(res.status).toBe(400);
    });
  });

  describe('unknown routes', () => {
    it('returns 404 JSON', async () => {
      const res = await request(app).get('/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
