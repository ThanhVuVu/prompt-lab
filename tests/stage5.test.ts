/**
 * Stage 5 — run with:  npm run test:stage5
 * Authentication (who are you?), authorization (what may you do?) and audit logging.
 */
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { createUser, TestUser } from './helpers/auth';
import { resetDatabase } from './helpers/db';

const validPrompt = { title: 'Extract entities', content: 'List every person and company named in: {{text}}' };

describe('Stage 5: auth', () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  // ─────────────────────────────────────────────────────────────── signup ──
  describe('POST /api/auth/signup', () => {
    const body = { email: 'Dana@Example.com', password: 'a-long-password', name: 'Dana' };

    it('creates a user → 201 { token, user } without any password data', async () => {
      const res = await request(app).post('/api/auth/signup').send(body);

      expect(res.status).toBe(201);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user).toMatchObject({ email: 'dana@example.com', name: 'Dana', role: 'user' });
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('a-long-password');
    });

    it('stores a bcrypt hash, never the plain password', async () => {
      await request(app).post('/api/auth/signup').send(body);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dana@example.com' } });
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(user.passwordHash).not.toContain('a-long-password');
    });

    it('409 for an email that is already taken (case-insensitive)', async () => {
      await request(app).post('/api/auth/signup').send(body);
      const res = await request(app).post('/api/auth/signup').send({ ...body, email: 'DANA@example.com' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('ignores a role sent by the client (no self-promotion to admin)', async () => {
      const res = await request(app).post('/api/auth/signup').send({ ...body, role: 'admin' });
      expect(res.body.user.role).toBe('user');
    });

    it.each([
      ['an invalid email', { ...body, email: 'not-an-email' }],
      ['a short password', { ...body, password: 'short' }],
      ['a missing name', { email: body.email, password: body.password }],
    ])('400 for %s', async (_case, payload) => {
      const res = await request(app).post('/api/auth/signup').send(payload);
      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────── login ──
  describe('POST /api/auth/login', () => {
    it('returns a working token for correct credentials', async () => {
      const alice = await createUser(app, 'alice');

      const res = await request(app).post('/api/auth/login').send({ email: alice.email, password: alice.password });
      expect(res.status).toBe(200);

      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
      expect(me.status).toBe(200);
      expect(me.body.id).toBe(alice.id);
    });

    it('401 with the SAME message for a wrong password and an unknown email', async () => {
      const alice = await createUser(app, 'alice');

      const wrongPassword = await request(app).post('/api/auth/login').send({ email: alice.email, password: 'nope-nope' });
      const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });

    it('records failed and successful logins in the audit log', async () => {
      const alice = await createUser(app, 'alice');
      await request(app).post('/api/auth/login').send({ email: alice.email, password: 'wrong-password' });
      await request(app).post('/api/auth/login').send({ email: alice.email, password: alice.password });

      const actions = (await prisma.auditLog.findMany({ where: { userId: alice.id } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['USER_SIGNED_UP', 'USER_LOGIN_FAILED', 'USER_LOGGED_IN']));
    });
  });

  // ─────────────────────────────────────────────────── tokens & logout ──
  describe('tokens', () => {
    it('401 without a token', async () => {
      const res = await request(app).get('/api/prompts');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('401 for a malformed Authorization header', async () => {
      const res = await request(app).get('/api/prompts').set('Authorization', 'Token abc');
      expect(res.status).toBe(401);
    });

    it('401 for a token signed with a different secret (forged)', async () => {
      const alice = await createUser(app, 'alice');
      const forged = jwt.sign({ ver: 0 }, 'attacker-secret-attacker-secret-attacker', { subject: alice.id });
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it('401 for an expired token', async () => {
      const alice = await createUser(app, 'alice');
      const expired = jwt.sign({ ver: 0 }, process.env.JWT_SECRET!, { subject: alice.id, expiresIn: -10 });
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });

    it('logout → 204, and the old token stops working', async () => {
      const alice = await createUser(app, 'alice');

      const logout = await request(app).post('/api/auth/logout').set(alice.auth);
      expect(logout.status).toBe(204);

      const me = await request(app).get('/api/auth/me').set(alice.auth);
      expect(me.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────── authorization ──
  describe('authorization', () => {
    let alice: TestUser;
    let bob: TestUser;

    beforeEach(async () => {
      alice = await createUser(app, 'alice');
      bob = await createUser(app, 'bob');
    });

    it("someone else's PRIVATE prompt is invisible: 404 on read, absent from the list", async () => {
      const created = (await request(app).post('/api/prompts').set(alice.auth).send(validPrompt)).body;

      expect((await request(app).get(`/api/prompts/${created.id}`).set(bob.auth)).status).toBe(404);
      expect((await request(app).get('/api/prompts').set(bob.auth)).body.total).toBe(0);
    });

    it('a PUBLIC prompt is readable by others but not editable (403)', async () => {
      const created = (await request(app).post('/api/prompts').set(alice.auth).send({ ...validPrompt, isPublic: true })).body;

      expect((await request(app).get(`/api/prompts/${created.id}`).set(bob.auth)).status).toBe(200);
      expect((await request(app).patch(`/api/prompts/${created.id}`).set(bob.auth).send({ title: 'Mine now' })).status).toBe(403);
    });

    it('viewers can read but not create (403)', async () => {
      const viewer = await createUser(app, 'victor', 'viewer');
      expect((await request(app).get('/api/prompts').set(viewer.auth)).status).toBe(200);
      expect((await request(app).post('/api/prompts').set(viewer.auth).send(validPrompt)).status).toBe(403);
    });

    it("admins can delete anyone's prompt", async () => {
      const admin = await createUser(app, 'ada', 'admin');
      const created = (await request(app).post('/api/prompts').set(alice.auth).send(validPrompt)).body;

      const res = await request(app).delete(`/api/prompts/${created.id}`).set(admin.auth);
      expect(res.status).toBe(204);
    });

    describe('PATCH /api/users/:id (admin only)', () => {
      it('403 for a normal user', async () => {
        const res = await request(app).patch(`/api/users/${bob.id}`).set(alice.auth).send({ role: 'admin' });
        expect(res.status).toBe(403);
      });

      it('an admin can change a role; it takes effect on the very next request', async () => {
        const admin = await createUser(app, 'ada', 'admin');

        const res = await request(app).patch(`/api/users/${bob.id}`).set(admin.auth).send({ role: 'viewer' });
        expect(res.status).toBe(200);
        expect(res.body.role).toBe('viewer');

        // bob's existing token now carries viewer rights
        expect((await request(app).post('/api/prompts').set(bob.auth).send(validPrompt)).status).toBe(403);
      });

      it('400 for an unknown role', async () => {
        const admin = await createUser(app, 'ada', 'admin');
        const res = await request(app).patch(`/api/users/${bob.id}`).set(admin.auth).send({ role: 'superuser' });
        expect(res.status).toBe(400);
      });
    });
  });

  // ──────────────────────────────────────────────────────────── audit log ──
  describe('audit log', () => {
    it('records who created, updated and deleted a prompt', async () => {
      const alice = await createUser(app, 'alice');
      const created = (await request(app).post('/api/prompts').set(alice.auth).send(validPrompt)).body;
      await request(app).patch(`/api/prompts/${created.id}`).set(alice.auth).send({ content: 'List every person named in: {{text}}' });
      await request(app).delete(`/api/prompts/${created.id}`).set(alice.auth);

      const logs = await prisma.auditLog.findMany({ where: { resourceId: created.id }, orderBy: { createdAt: 'asc' } });

      expect(logs.map((l) => l.action)).toEqual(['PROMPT_CREATED', 'PROMPT_UPDATED', 'PROMPT_DELETED']);
      expect(logs.every((l) => l.userId === alice.id)).toBe(true);
      expect(logs[1].details).toMatchObject({ oldVersion: 1, newVersion: 2 });
    });

    it('GET /api/audit-logs is admin-only', async () => {
      const alice = await createUser(app, 'alice');
      const admin = await createUser(app, 'ada', 'admin');

      expect((await request(app).get('/api/audit-logs').set(alice.auth)).status).toBe(403);

      const res = await request(app).get(`/api/audit-logs?userId=${alice.id}`).set(admin.auth);
      expect(res.status).toBe(200);
      expect(res.body.data.map((l: { action: string }) => l.action)).toContain('USER_SIGNED_UP');
    });
  });
});
