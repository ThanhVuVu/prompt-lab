/**
 * Stage 2 — run with:  npm run test:stage2
 *
 * Same /health and /echo behaviour as Stage 1, now in the layered src/ app,
 * plus unit tests for the service and the env config.
 */
import request from 'supertest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { EchoService } from '../src/services/echoService';

describe('Stage 2: project structure', () => {
  describe('loadEnv()', () => {
    it('applies defaults when variables are missing', () => {
      const env = loadEnv({});
      expect(env.PORT).toBe(3000);
      expect(env.NODE_ENV).toBe('development');
    });

    it('converts PORT from string to number', () => {
      expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
    });

    it('throws a helpful error for an invalid PORT', () => {
      expect(() => loadEnv({ PORT: 'not-a-number' })).toThrow(/PORT/);
    });

    it('parses LOG_REQUESTS into a real boolean', () => {
      expect(loadEnv({ LOG_REQUESTS: 'false' }).LOG_REQUESTS).toBe(false);
      expect(loadEnv({ LOG_REQUESTS: 'true' }).LOG_REQUESTS).toBe(true);
      expect(loadEnv({}).LOG_REQUESTS).toBe(true);
    });
  });

  describe('EchoService (unit test — no HTTP involved)', () => {
    it('builds the echo response using the given time', () => {
      const service = new EchoService();
      const fixedTime = new Date('2026-01-15T10:00:00.000Z');

      expect(service.buildEcho('hi', fixedTime)).toEqual({
        received: 'hi',
        timestamp: '2026-01-15T10:00:00.000Z',
      });
    });
  });

  describe('HTTP (integration test — full request through all layers)', () => {
    const app = createApp();

    it('GET /health → 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('POST /echo → 200 with the echoed message', async () => {
      const res = await request(app).post('/echo').send({ message: 'layers!' });
      expect(res.status).toBe(200);
      expect(res.body.received).toBe('layers!');
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('POST /echo with an invalid message → 400 VALIDATION_ERROR', async () => {
      for (const body of [{}, { message: 123 }, { message: '' }]) {
        const res = await request(app).post('/echo').send(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('malformed JSON → 400 INVALID_JSON (not 500)', async () => {
      const res = await request(app)
        .post('/echo')
        .set('Content-Type', 'application/json')
        .send('{"message": ');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });

    it('GET /version → 200 with name and version from package.json', async () => {
      const res = await request(app).get('/version');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: 'prompt-lab', version: expect.stringMatching(/^\d+\.\d+\.\d+/) });
    });

    it('unknown route → 404', async () => {
      const res = await request(app).get('/nope');
      expect(res.status).toBe(404);
    });
  });
});
