/**
 * Runs before every test file (see jest.config.js → setupFiles).
 * Sets env vars BEFORE src/config/env.ts is imported.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
