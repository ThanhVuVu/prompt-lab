/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupAfterEnv.ts'],
  // Test files share ONE database, so run them one at a time.
  maxWorkers: 1,
  clearMocks: true,

  // `npm run test:coverage`
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/generated/**', // Prisma's generated client
    '!src/index.ts', //     process entry points: wiring only, exercised by running them
    '!src/worker.ts',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  // CI fails if coverage drops below these. Raise them over time, never lower them quietly.
  coverageThreshold: {
    global: { statements: 90, branches: 75, functions: 90, lines: 90 },
  },
};
