/**
 * Database connection (Prisma ORM + PostgreSQL).
 *
 * Prisma 7 talks to Postgres through a "driver adapter" (here: node-postgres).
 * The adapter keeps a POOL of connections and reuses them: opening a new TCP
 * connection + auth handshake per query would be far too slow.
 *
 * Create ONE client per process and share it — every client has its own pool.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

export function createPrismaClient(connectionString: string = env.DATABASE_URL): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient();

export type { PrismaClient };
