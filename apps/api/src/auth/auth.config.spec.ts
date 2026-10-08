import { readAuthConfig } from './auth.config';
describe('Trusted OIDC configuration', () => {
  const valid = {
    OIDC_ISSUER: 'https://identity.example.test/realms/synthetic',
    OIDC_JWKS_URL: 'https://identity.example.test/realms/synthetic/certs',
    OIDC_AUDIENCE: 'tax-intelligence-api',
    OIDC_CLIENT_ID: 'tax-intelligence-web',
    NODE_ENV: 'production',
  };
  it('disables authentication when no provider is configured', () => {
    expect(readAuthConfig({})).toBeUndefined();
  });
  it('accepts a complete trusted HTTPS configuration', () => {
    expect(readAuthConfig(valid)?.issuer).toBe(valid.OIDC_ISSUER);
  });
  it.each([
    { OIDC_CLIENT_ID: undefined },
    { OIDC_AUDIENCE: '' },
    { OIDC_CLIENT_ID: ' padded ' },
    { OIDC_JWKS_URL: 'https://other.example.test/certs' },
    {
      OIDC_ISSUER: 'http://127.0.0.1/realms/synthetic',
      OIDC_JWKS_URL: 'http://127.0.0.1/certs',
    },
    { OIDC_ISSUER: 'ftp://identity.example.test' },
    { OIDC_JWKS_URL: 'https://user:synthetic@identity.example.test/certs' },
    { OIDC_JWKS_URL: 'https://identity.example.test/certs?url=untrusted' },
    { OIDC_JWKS_URL: 'https://identity.example.test/certs#fragment' },
    { OIDC_ISSUER: 'not-a-url' },
    {
      NODE_ENV: 'development',
      OIDC_ISSUER: 'http://identity.example.test',
      OIDC_JWKS_URL: 'http://identity.example.test/certs',
    },
  ])('rejects incomplete or unsafe configuration: %j', (override) => {
    expect(() => readAuthConfig({ ...valid, ...override })).toThrow();
  });
  it('allows HTTP only on development loopback', () => {
    expect(
      readAuthConfig({
        ...valid,
        NODE_ENV: 'development',
        OIDC_ISSUER: 'http://127.0.0.1:8080/realms/synthetic',
        OIDC_JWKS_URL: 'http://127.0.0.1:8080/certs',
      })?.audience,
    ).toBe(valid.OIDC_AUDIENCE);
  });
});
