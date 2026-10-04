import 'dotenv/config';

/**
 * Tests run against a SEPARATE database, because they wipe it between tests.
 * Never point this at your dev (or, worse, production) database.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/prompt_lab_test';
