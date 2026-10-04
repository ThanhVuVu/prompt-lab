/**
 * Stage 3 — run with:  npm run test:stage3
 *
 * These tests are your SPECIFICATION. Read them before coding: they tell you
 * exactly which status codes and response shapes the API must return.
 */
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDatabase } from './helpers/db';

const validPrompt = {
  title: 'Summarise a paper',
  content: 'Summarise the following research paper in 5 bullet points: {{paper}}',
  tags: ['summarisation', 'research'],
};

describe('Stage 3: /api/prompts', () => {
  let app: Express;

  // Stage 4: data now lives in PostgreSQL, so "fresh state" means wiping the
  // test database before every test — otherwise tests affect each other.
  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  /** Helper: create a prompt as `userId` and return the response body. */
  async function createPrompt(body: object = validPrompt, userId = 'alice') {
    const res = await request(app).post('/api/prompts').set('x-user-id', userId).send(body);
    expect(res.status).toBe(201);
    return res.body;
  }

  // ───────────────────────────────────────────────────────────────── create ──
  describe('POST /api/prompts', () => {
    it('creates a prompt → 201 with server-generated fields', async () => {
      const res = await request(app).post('/api/prompts').set('x-user-id', 'alice').send(validPrompt);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: validPrompt.title,
        content: validPrompt.content,
        tags: validPrompt.tags,
        isPublic: false,
        version: 1,
        createdBy: 'alice',
      });
      expect(typeof res.body.id).toBe('string');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
      expect(res.headers.location).toBe(`/api/prompts/${res.body.id}`);
    });

    it('applies defaults: tags = [], isPublic = false', async () => {
      const body = await createPrompt({ title: 'Minimal', content: 'Just ten characters!' });
      expect(body.tags).toEqual([]);
      expect(body.isPublic).toBe(false);
    });

    it('ignores fields the client must not set (id, version, createdBy)', async () => {
      const body = await createPrompt({ ...validPrompt, id: 'hacked', version: 99, createdBy: 'mallory' });
      expect(body.id).not.toBe('hacked');
      expect(body.version).toBe(1);
      expect(body.createdBy).toBe('alice');
    });

    it.each([
      ['title is missing', { content: validPrompt.content }, 'title'],
      ['title is too short', { ...validPrompt, title: 'ab' }, 'title'],
      ['title is only spaces', { ...validPrompt, title: '     ' }, 'title'],
      ['title is too long', { ...validPrompt, title: 'x'.repeat(101) }, 'title'],
      ['title is not a string', { ...validPrompt, title: 123 }, 'title'],
      ['content is missing', { title: validPrompt.title }, 'content'],
      ['content is too short', { ...validPrompt, content: 'too short' }, 'content'],
      ['content is too long', { ...validPrompt, content: 'x'.repeat(10001) }, 'content'],
      ['tags has more than 5 items', { ...validPrompt, tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'tags'],
      ['tags is not an array', { ...validPrompt, tags: 'ai' }, 'tags'],
      ['isPublic is not a boolean', { ...validPrompt, isPublic: 'yes' }, 'isPublic'],
    ])('400 when %s', async (_case, body, field) => {
      const res = await request(app).post('/api/prompts').send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      // The client should be told WHICH field is wrong.
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths.some((p: string) => p.startsWith(field))).toBe(true);
    });

    it('400 when the body is empty', async () => {
      const res = await request(app).post('/api/prompts');
      expect(res.status).toBe(400);
    });

    it('400 INVALID_JSON when the body is malformed JSON', async () => {
      const res = await request(app)
        .post('/api/prompts')
        .set('Content-Type', 'application/json')
        .send('{"title": "oops"');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });
  });

  // ─────────────────────────────────────────────────────────────── read one ──
  describe('GET /api/prompts/:id', () => {
    it('returns the prompt → 200', async () => {
      const created = await createPrompt();

      const res = await request(app).get(`/api/prompts/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(created);
    });

    it('404 when the prompt does not exist', async () => {
      const res = await request(app).get('/api/prompts/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─────────────────────────────────────────────────────────────────── list ──
  describe('GET /api/prompts', () => {
    it('returns an empty page when there are no prompts', async () => {
      const res = await request(app).get('/api/prompts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 10 });
    });

    it('paginates with page and limit', async () => {
      for (let i = 1; i <= 3; i++) {
        await createPrompt({ ...validPrompt, title: `Prompt number ${i}` });
      }

      const page1 = await request(app).get('/api/prompts?page=1&limit=2');
      expect(page1.status).toBe(200);
      expect(page1.body.total).toBe(3);
      expect(page1.body.page).toBe(1);
      expect(page1.body.limit).toBe(2);
      expect(page1.body.data.map((p: { title: string }) => p.title)).toEqual(['Prompt number 1', 'Prompt number 2']);

      const page2 = await request(app).get('/api/prompts?page=2&limit=2');
      expect(page2.body.data.map((p: { title: string }) => p.title)).toEqual(['Prompt number 3']);

      const page3 = await request(app).get('/api/prompts?page=3&limit=2');
      expect(page3.body.data).toEqual([]);
      expect(page3.body.total).toBe(3);
    });

    it.each([['page=0'], ['page=-1'], ['page=abc'], ['page=1.5'], ['limit=0'], ['limit=101'], ['limit=ten']])(
      '400 for invalid query %s',
      async (query) => {
        const res = await request(app).get(`/api/prompts?${query}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      },
    );
  });

  // ───────────────────────────────────────────────────────────────── update ──
  describe('PATCH /api/prompts/:id', () => {
    it('owner can update the title → 200, version unchanged', async () => {
      const created = await createPrompt();

      const res = await request(app)
        .patch(`/api/prompts/${created.id}`)
        .set('x-user-id', 'alice')
        .send({ title: 'A better title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('A better title');
      expect(res.body.content).toBe(created.content);
      expect(res.body.tags).toEqual(created.tags); // untouched fields keep their values
      expect(res.body.version).toBe(1);
    });

    it('changing content bumps the version', async () => {
      const created = await createPrompt();

      const res = await request(app)
        .patch(`/api/prompts/${created.id}`)
        .set('x-user-id', 'alice')
        .send({ content: 'A completely rewritten prompt body.' });

      expect(res.status).toBe(200);
      expect(res.body.version).toBe(2);
    });

    it('the update is persisted (visible on a later GET)', async () => {
      const created = await createPrompt();
      await request(app).patch(`/api/prompts/${created.id}`).set('x-user-id', 'alice').send({ isPublic: true });

      const res = await request(app).get(`/api/prompts/${created.id}`);
      expect(res.body.isPublic).toBe(true);
    });

    it('403 when the caller is not the owner', async () => {
      const created = await createPrompt(validPrompt, 'alice');

      const res = await request(app)
        .patch(`/api/prompts/${created.id}`)
        .set('x-user-id', 'bob')
        .send({ title: 'Hacked by bob' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const after = await request(app).get(`/api/prompts/${created.id}`);
      expect(after.body.title).toBe(validPrompt.title);
    });

    it('404 when the prompt does not exist', async () => {
      const res = await request(app).patch('/api/prompts/nope').send({ title: 'Whatever' });
      expect(res.status).toBe(404);
    });

    it('400 for an empty update body {}', async () => {
      const created = await createPrompt();
      const res = await request(app).patch(`/api/prompts/${created.id}`).set('x-user-id', 'alice').send({});
      expect(res.status).toBe(400);
    });

    it('400 when an updated field breaks a rule', async () => {
      const created = await createPrompt();
      const res = await request(app).patch(`/api/prompts/${created.id}`).set('x-user-id', 'alice').send({ title: 'x' });
      expect(res.status).toBe(400);
    });
  });

  // ───────────────────────────────────────────────────────────────── delete ──
  describe('DELETE /api/prompts/:id', () => {
    it('owner can delete → 204 with an empty body, then GET → 404', async () => {
      const created = await createPrompt();

      const res = await request(app).delete(`/api/prompts/${created.id}`).set('x-user-id', 'alice');
      expect(res.status).toBe(204);
      expect(res.text).toBe('');

      const after = await request(app).get(`/api/prompts/${created.id}`);
      expect(after.status).toBe(404);
    });

    it('403 when the caller is not the owner', async () => {
      const created = await createPrompt(validPrompt, 'alice');

      const res = await request(app).delete(`/api/prompts/${created.id}`).set('x-user-id', 'bob');
      expect(res.status).toBe(403);
    });

    it('404 when the prompt does not exist', async () => {
      const res = await request(app).delete('/api/prompts/nope');
      expect(res.status).toBe(404);
    });
  });
});
