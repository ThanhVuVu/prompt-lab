/**
 * Runs before every test file (see jest.config.js → setupFiles).
 * Sets env vars BEFORE src/config/env.ts is imported.
 */
import { TEST_DATABASE_URL } from './testDatabaseUrl';

process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.DATABASE_URL = TEST_DATABASE_URL;
