/**
 * Runs before every test file (see jest.config.js → setupFiles).
 * Sets env vars BEFORE src/config/env.ts is imported.
 */
import { TEST_DATABASE_URL } from './testDatabaseUrl';

process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'true'; // the logger itself is silent in tests
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
// Cheap hashing keeps the suite fast. Never use 4 in production.
process.env.BCRYPT_ROUNDS = '4';
