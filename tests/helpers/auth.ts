import { Express } from 'express';
import request from 'supertest';
import { prisma } from '../../src/config/database';
import { Role } from '../../src/types';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  /** Pass to supertest: request(app).get(...).set(user.auth) */
  auth: { Authorization: string };
}

/**
 * Signs a user up through the real API (so the test also exercises signup)
 * and, for admin/viewer, promotes them directly in the database.
 */
export async function createUser(app: Express, name: string, role: Role = 'user'): Promise<TestUser> {
  const email = `${name}@example.com`;
  const password = 'correct-horse-battery';

  const res = await request(app).post('/api/auth/signup').send({ email, password, name });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);

  if (role !== 'user') {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
  }

  const token: string = res.body.token;
  return { id: res.body.user.id, email, password, token, auth: { Authorization: `Bearer ${token}` } };
}
