const nextJest = require('next/jest');
module.exports = nextJest({ dir: './' })({
  testEnvironment: 'jsdom',
  testMatch: ['**/*.test.tsx', '**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: ['app/components/**/*.tsx', 'app/api/**/*.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
  },
});
