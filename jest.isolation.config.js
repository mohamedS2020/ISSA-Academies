/**
 * ISSA — Jest config for isolation tests
 *
 * tests/isolation/* is excluded from the default jest.config.js so a
 * normal `npm test` run stays fast. This config is used exclusively by
 * scripts/run-isolation-tests.ts to run that suite on demand, once real
 * test tenants have been provisioned.
 */

/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/tests/isolation/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/'],
};

module.exports = config;
