import {
  healthResponseSchema,
  apiErrorSchema,
  authenticatedIdentitySchema,
} from './index';
describe('Operational contracts', () => {
  it('accepts only the minimal verified identity response', () => {
    expect(
      authenticatedIdentitySchema.parse({
        issuer: 'https://identity.example.test/realms/synthetic',
        subject: 'synthetic-subject',
      }).subject,
    ).toBe('synthetic-subject');
  });
  it.each([
    { issuer: 'invalid', subject: 'synthetic-subject' },
    { issuer: 'https://identity.example.test', subject: '' },
    { issuer: 'https://identity.example.test', subject: 'x'.repeat(256) },
    {
      issuer: 'https://identity.example.test',
      subject: 'synthetic',
      token: 'synthetic-sentinel',
    },
  ])('rejects invalid identities and extra sensitive fields', (value) => {
    expect(authenticatedIdentitySchema.safeParse(value).success).toBe(false);
  });
  it('accepts a live health response', () => {
    expect(
      healthResponseSchema.parse({
        status: 'ok',
        service: 'tax-intelligence-api',
      }).status,
    ).toBe('ok');
  });
  it.each([
    { status: 'healthy', service: 'tax-intelligence-api' },
    { status: 'ok', service: 'other' },
    {
      status: 'ok',
      service: 'tax-intelligence-api',
      token: 'synthetic-secret',
    },
    {
      status: 'ok',
      service: 'tax-intelligence-api',
      checks: { database: 'unknown' },
    },
  ])('rejects drift and accidental sensitive fields', (value) => {
    expect(healthResponseSchema.safeParse(value).success).toBe(false);
  });
  it('requires a valid correlation identifier in errors', () => {
    expect(
      apiErrorSchema.safeParse({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Erro interno',
        requestId: 'invalid',
      }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.parse({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Erro interno',
        requestId: '00000000-0000-4000-8000-000000000001',
      }).statusCode,
    ).toBe(500);
  });
});
