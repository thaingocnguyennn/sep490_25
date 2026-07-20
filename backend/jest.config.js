/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  // We only run integration tests against a real DB when explicitly enabled
  // via the RUN_DB_TESTS env var; the default suite covers pure-logic units.
  setupFilesAfterEach: [],
  testTimeout: 20000,
  globals: {
    'ts-jest': {
      isolatedModules: true,
      tsconfig: {
        // Mirror the backend tsconfig with a few relaxations for testing.
        target: 'ES2020',
        module: 'commonjs',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        experimentalDecorators: true,
      },
    },
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
