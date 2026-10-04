/**
 * Prisma CLI configuration (used by `prisma migrate`, `prisma generate`, `prisma studio`).
 * The app itself connects in src/config/database.ts.
 */
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
