/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/tests/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  // Isolation tests need real provisioned tenants to be non-vacuous —
  // run them via `npm run test:isolation` (scripts/run-isolation-tests.ts),
  // not the default suite.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/isolation/',
  ],
  collectCoverageFrom: [
    'src/lib/auth/**/*.ts',
    'src/services/**/*.ts',
    '!**/*.test.ts',
    '!**/*.d.ts',
  ],
};

module.exports = config;
