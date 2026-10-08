module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.m?js$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' } },
    ],
    '^.+\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!.*jose/)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/telemetry.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
  },
};
