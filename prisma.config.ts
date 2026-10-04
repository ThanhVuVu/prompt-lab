/**
 * Prisma CLI configuration (used by `prisma migrate`, `prisma generate`, `prisma studio`).
 * The app itself connects in src/config/database.ts.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env (not Prisma's env() helper, which throws when unset) so that
    // `prisma generate` — run by `npm install` — works before .env exists.
    // Commands that need the database (migrate, studio) still fail clearly without it.
    url: process.env.DATABASE_URL,
  },
});
