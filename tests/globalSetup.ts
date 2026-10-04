/**
 * Runs ONCE before the whole test run: bring the test database's schema up to
 * date by applying every migration in prisma/migrations.
 */
import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './testDatabaseUrl';

export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
