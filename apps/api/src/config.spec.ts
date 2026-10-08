import { readConfig } from './config';
describe('Startup configuration', () => {
  it('uses safe local defaults', () => {
    expect(readConfig({})).toEqual({
      port: 3001,
      production: false,
      origin: 'http://localhost:3000',
    });
  });
  it.each(['0', '65536', 'NaN', '1.5'])('rejects invalid port %s', (PORT) => {
    expect(() => readConfig({ PORT })).toThrow('PORT inválida');
  });
  it('requires database and explicit CORS in production', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL',
    );
    expect(() =>
      readConfig({ NODE_ENV: 'production', DATABASE_URL: 'synthetic' }),
    ).toThrow('CORS_ORIGIN');
  });
  it.each([
    '*',
    'https://example.com/path',
    'ftp://example.com',
    'http://example.com',
  ])('rejects unsafe production origin %s', (CORS_ORIGIN) => {
    expect(() =>
      readConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'synthetic',
        CORS_ORIGIN,
      }),
    ).toThrow();
  });
  it('accepts explicit production configuration', () => {
    expect(
      readConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'synthetic',
        CORS_ORIGIN: 'https://example.com',
      }).production,
    ).toBe(true);
  });
});
