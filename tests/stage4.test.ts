/**
 * Stage 4 — run with:  npm run test:stage4
 *
 * Everything from Stage 3 must still pass (it now runs against PostgreSQL).
 * These tests cover what the database adds: persistence, version history,
 * transactions and constraints.
 */
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { createUser, TestUser } from './helpers/auth';
import { resetDatabase } from './helpers/db';

const validPrompt = {
  title: 'Classify sentiment',
  content: 'Classify the sentiment of this review as positive or negative: {{review}}',
};

describe('Stage 4: database persistence', () => {
  let app: Express;
  let alice: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
    alice = await createUser(app, 'alice');
  });

  async function createPrompt(user: TestUser = alice) {
    const res = await request(app).post('/api/prompts').set(user.auth).send(validPrompt);
    expect(res.status).toBe(201);
    return res.body;
  }

  it('data survives an app restart (it lives in Postgres, not in memory)', async () => {
    const created = await createPrompt();

    const restartedApp = createApp(); // brand-new PromptService instance
    const res = await request(restartedApp).get(`/api/prompts/${created.id}`).set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe(validPrompt.title);
  });

  it('generates UUID ids', async () => {
    const created = await createPrompt();
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('a non-UUID id is a 404, not a 500', async () => {
    const res = await request(app).get('/api/prompts/not-a-uuid').set(alice.auth);
    expect(res.status).toBe(404);
  });

  describe('version history (prompt_versions)', () => {
    it('records version 1 on create', async () => {
      const created = await createPrompt();

      const res = await request(app).get(`/api/prompts/${created.id}/versions`).set(alice.auth);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ version: 1, content: validPrompt.content, changedBy: alice.id });
    });

    it('records a new version, with a reason, when content changes', async () => {
      const created = await createPrompt();
      await request(app)
        .patch(`/api/prompts/${created.id}`)
        .set(alice.auth)
        .send({ content: 'Rate the sentiment of this review from 1 to 5: {{review}}', changeReason: 'Need finer scale' });

      const res = await request(app).get(`/api/prompts/${created.id}/versions`).set(alice.auth);

      expect(res.body.map((v: { version: number }) => v.version)).toEqual([2, 1]); // newest first
      expect(res.body[0].changeReason).toBe('Need finer scale');
    });

    it('does NOT record a version when only the title changes', async () => {
      const created = await createPrompt();
      await request(app).patch(`/api/prompts/${created.id}`).set(alice.auth).send({ title: 'New title' });

      const res = await request(app).get(`/api/prompts/${created.id}/versions`).set(alice.auth);
      expect(res.body).toHaveLength(1);
    });

    it('changeReason alone is not a valid update', async () => {
      const created = await createPrompt();
      const res = await request(app)
        .patch(`/api/prompts/${created.id}`)
        .set(alice.auth)
        .send({ changeReason: 'nothing changed' });
      expect(res.status).toBe(400);
    });

    it('404 for the versions of a missing prompt', async () => {
      const res = await request(app).get('/api/prompts/00000000-0000-0000-0000-000000000000/versions').set(alice.auth);
      expect(res.status).toBe(404);
    });

    it('deleting a prompt deletes its history (ON DELETE CASCADE)', async () => {
      const created = await createPrompt();
      await request(app).delete(`/api/prompts/${created.id}`).set(alice.auth);

      expect(await prisma.promptVersion.count({ where: { promptId: created.id } })).toBe(0);
    });
  });

  describe('constraints', () => {
    it('the database itself refuses two identical version numbers for one prompt', async () => {
      const created = await createPrompt();

      await expect(
        prisma.promptVersion.create({
          data: { promptId: created.id, version: 1, content: 'duplicate', changedBy: alice.id },
        }),
      ).rejects.toThrow(/Unique constraint/);
    });
  });
});
