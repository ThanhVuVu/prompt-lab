/**
 * Stage 8 — run with:  npm run test:stage8
 *
 * Three kinds of tests you haven't written yet:
 *   1. Pure UNIT tests: no HTTP, no database. Milliseconds each.
 *   2. CONCURRENCY tests: what happens when two requests race?
 *   3. REGRESSION tests: one test per bug that was fixed, so it never comes back.
 */
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { signupSchema } from '../src/schemas/authSchemas';
import { createPromptSchema, listPromptsQuerySchema, updatePromptSchema } from '../src/schemas/promptSchemas';
import { createUser, TestUser } from './helpers/auth';
import { resetDatabase } from './helpers/db';
import { InMemoryJobQueue } from './helpers/fakes';
import { buildPrompt, createPromptAs } from './helpers/factories';

// ───────────────────────────────────────────────────────── 1. unit tests ──
describe('Stage 8: schemas (unit tests, no I/O)', () => {
  it.each([
    [{ title: 'Ok title', content: '0123456789' }, true],
    [{ title: '  Okay  ', content: '0123456789' }, true],
    [{ title: '  Ok  ', content: '0123456789' }, false], // trimmed to 2 characters
    [{ title: 'ab', content: '0123456789' }, false],
    [{ title: 'Ok title', content: 'x'.repeat(10_001) }, false],
    [{ title: 'Ok title', content: '0123456789', tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, false],
    [{ title: 'Ok title', content: '0123456789', tags: [''] }, false],
  ])('createPromptSchema %j → valid=%s', (input, valid) => {
    expect(createPromptSchema.safeParse(input).success).toBe(valid);
  });

  it('createPromptSchema trims the title and fills defaults', () => {
    expect(createPromptSchema.parse({ title: '  Hello  ', content: '0123456789' })).toEqual({
      title: 'Hello',
      content: '0123456789',
      tags: [],
      isPublic: false,
    });
  });

  it('updatePromptSchema has NO defaults (a partial update must not reset fields)', () => {
    expect(updatePromptSchema.parse({ title: 'Only title' })).toEqual({ title: 'Only title' });
  });

  it('listPromptsQuerySchema coerces query strings to numbers', () => {
    expect(listPromptsQuerySchema.parse({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20 });
  });

  it('signupSchema lowercases emails', () => {
    expect(signupSchema.parse({ email: 'Bob@Example.COM', password: '12345678', name: 'Bob' }).email).toBe('bob@example.com');
  });
});

// ──────────────────────────────────────────────── 2. concurrency tests ──
describe('Stage 8: concurrency (integration, real Postgres)', () => {
  let app: Express;
  let alice: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp({ jobQueue: new InMemoryJobQueue() });
    alice = await createUser(app, 'alice');
  });

  it('two simultaneous content edits produce versions 2 and 3, never two "version 2"s', async () => {
    const prompt = await createPromptAs(app, alice);

    const [a, b] = await Promise.all([
      request(app).patch(`/api/prompts/${prompt.id}`).set(alice.auth).send({ content: 'Edit number one, long enough' }),
      request(app).patch(`/api/prompts/${prompt.id}`).set(alice.auth).send({ content: 'Edit number two, long enough' }),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const versions = await prisma.promptVersion.findMany({ where: { promptId: prompt.id }, orderBy: { version: 'asc' } });
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: prompt.id } })).version).toBe(3);
  });

  it('two simultaneous signups with the same email: exactly one wins, the other gets 409', async () => {
    const body = { email: 'race@example.com', password: 'a-long-password', name: 'Racer' };

    const results = await Promise.all([
      request(app).post('/api/auth/signup').send(body),
      request(app).post('/api/auth/signup').send(body),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: 'race@example.com' } })).toBe(1);
  });

  it('10 parallel creates all succeed and are all listed', async () => {
    await Promise.all(Array.from({ length: 10 }, () => createPromptAs(app, alice)));
    const res = await request(app).get('/api/prompts?limit=100').set(alice.auth);
    expect(res.body.total).toBe(10);
  });
});

// ───────────────────────────────────────────────── 3. regression tests ──
describe('Stage 8: regression tests', () => {
  let app: Express;
  let alice: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp({ jobQueue: new InMemoryJobQueue() });
    alice = await createUser(app, 'alice');
  });

  // Bug (Stage 3 → 4): `?page=abc` produced NaN and silently returned an empty page.
  it('a non-numeric page is a 400, not an empty 200', async () => {
    expect((await request(app).get('/api/prompts?page=abc').set(alice.auth)).status).toBe(400);
  });

  // Bug (Stage 4): a non-UUID id reached Postgres and became a 500.
  it('a non-UUID prompt id is a 404, not a 500', async () => {
    expect((await request(app).get('/api/prompts/123').set(alice.auth)).status).toBe(404);
  });

  // Bug (Stage 3): updating only the title reset tags to [] because the update schema had defaults.
  it('a title-only update keeps the existing tags', async () => {
    const prompt = await createPromptAs(app, alice, { tags: ['keep-me'] });
    const res = await request(app).patch(`/api/prompts/${prompt.id}`).set(alice.auth).send({ title: 'New title' });
    expect(res.body.tags).toEqual(['keep-me']);
  });

  // Bug (Stage 7): successful requests were logged at "http" level and filtered out at LOG_LEVEL=info.
  // (Covered in stage7.test.ts: the request log line is asserted at level "info".)

  // Bug (Stage 8, found by THIS test): an oversized body returned 500 instead of 413.
  it('a 100 KB+ body is rejected with 413, not processed', async () => {
    const res = await request(app)
      .post('/api/prompts')
      .set(alice.auth)
      .send(buildPrompt({ content: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
  });
});
