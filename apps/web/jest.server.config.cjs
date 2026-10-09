module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/server/**/*.spec.ts'],
  transform: {
    '^.+\\.(tsx?|m?js)$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!.*(openid-client|oauth4webapi|jose)/)',
  ],
  collectCoverageFrom: ['server/**/*.ts', '!server/auth/runtime.ts'],
  coverageDirectory: 'coverage/server',
  coverageThreshold: {
    global: { lines: 80, functions: 80, statements: 80, branches: 70 },
  },
};
