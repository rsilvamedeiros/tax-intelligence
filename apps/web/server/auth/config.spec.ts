import { readBffConfig } from './config';
describe('BFF trusted configuration', () => {
  const valid = {
    NODE_ENV: 'production',
    BFF_APP_ORIGIN: 'https://app.example.test',
    OIDC_ISSUER: 'https://identity.example.test/realms/synthetic',
    OIDC_CLIENT_ID: 'synthetic-web',
    BFF_DATABASE_URL: 'postgresql://synthetic@127.0.0.1/synthetic',
    BFF_SESSION_ENCRYPTION_KEY: 'a'.repeat(64),
    API_BASE_URL: 'http://127.0.0.1:3001',
  };
  it('requires the dedicated database and encryption key', () => {
    expect(() => readBffConfig({})).toThrow();
    expect(() =>
      readBffConfig({ ...valid, BFF_DATABASE_URL: undefined }),
    ).toThrow();
  });
  it('accepts HTTPS endpoints and an internal loopback API', () => {
    expect(readBffConfig(valid).key.length).toBe(32);
  });
  it.each([
    { BFF_APP_ORIGIN: 'http://127.0.0.1:3000' },
    { OIDC_ISSUER: 'http://identity.example.test' },
    { BFF_SESSION_ENCRYPTION_KEY: 'invalid' },
    { OIDC_ISSUER: 'https://identity.example.test/' },
    { API_BASE_URL: 'https://user:synthetic@api.example.test' },
    { BFF_APP_ORIGIN: 'https://app.example.test/path' },
  ])('rejects unsafe configuration: %j', (override) => {
    expect(() => readBffConfig({ ...valid, ...override })).toThrow();
  });
  it('allows loopback origins only in development/test', () => {
    expect(
      readBffConfig({
        ...valid,
        NODE_ENV: 'test',
        BFF_APP_ORIGIN: 'http://127.0.0.1:3000',
        OIDC_ISSUER: 'http://127.0.0.1:8080/realms/synthetic',
      }).origin,
    ).toBe('http://127.0.0.1:3000');
  });
});
