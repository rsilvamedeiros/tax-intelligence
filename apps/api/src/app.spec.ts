import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { healthResponseSchema, apiErrorSchema } from '@tax/contracts';
import { AppModule } from './app.module';
import { configureHttp } from './http';
import { HealthService } from './health/health.service';

describe('Operational HTTP boundary', () => {
  let app: NestExpressApplication;
  const entries: Record<string, string | number>[] = [];
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (entry) => entries.push(entry));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  it('serves a contract-valid live response with security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200);
    expect(healthResponseSchema.parse(response.body).status).toBe('ok');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('makes absent database explicit in bootstrap readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/ready')
      .expect(200);
    expect(healthResponseSchema.parse(response.body).checks?.database).toBe(
      'not_configured',
    );
  });
  it('correlates malformed JSON errors without logging the payload', async () => {
    entries.length = 0;
    const id = '00000000-0000-4000-8000-000000000002';
    const response = await request(app.getHttpServer())
      .post('/v1/health/live')
      .set('x-request-id', id)
      .set('Content-Type', 'application/json')
      .send('{"synthetic-secret":')
      .expect(400);
    expect(apiErrorSchema.parse(response.body).requestId).toBe(id);
    expect(response.headers['x-request-id']).toBe(id);
    expect(JSON.stringify(entries)).not.toContain('synthetic-secret');
    expect(entries.at(-1)?.statusCode).toBe(400);
  });
  it('rejects JSON over 1 MiB with a contract-valid correlated error', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/health/live')
      .send({ synthetic: 'x'.repeat(1024 * 1024) })
      .expect(413);
    expect(apiErrorSchema.parse(response.body).statusCode).toBe(413);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('accepts parsing below the configured JSON limit before routing', async () => {
    const response = await request(app.getHttpServer())
      .post('/unknown')
      .send({ synthetic: 'x'.repeat(200 * 1024) })
      .expect(404);
    expect(apiErrorSchema.parse(response.body).statusCode).toBe(404);
  });
  it('returns 503 when a configured dependency fails', async () => {
    const spy = jest
      .spyOn(app.get(HealthService), 'ready')
      .mockResolvedValueOnce({
        status: 'error',
        service: 'tax-intelligence-api',
        checks: { database: 'down' },
      });
    const response = await request(app.getHttpServer())
      .get('/v1/health/ready')
      .expect(503);
    expect(healthResponseSchema.parse(response.body).status).toBe('error');
    spy.mockRestore();
  });
  it('sanitizes unexpected errors', async () => {
    const spy = jest
      .spyOn(app.get(HealthService), 'live')
      .mockImplementationOnce(() => {
        throw new Error('synthetic-secret-password');
      });
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(500);
    expect(apiErrorSchema.parse(response.body).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('synthetic-secret');
    spy.mockRestore();
  });
  it('reuses only validated request IDs and produces correlated errors', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const response = await request(app.getHttpServer())
      .get('/not-found')
      .set('x-request-id', id)
      .expect(404);
    expect(apiErrorSchema.parse(response.body).requestId).toBe(id);
    const invalid = await request(app.getHttpServer())
      .get('/not-found')
      .set('x-request-id', 'synthetic-secret')
      .expect(404);
    expect(apiErrorSchema.parse(invalid.body).requestId).not.toBe(
      'synthetic-secret',
    );
  });
  it('does not log sensitive URLs, bodies or headers', async () => {
    entries.length = 0;
    await request(app.getHttpServer())
      .post('/unknown/synthetic-cpf?token=synthetic-token')
      .set('Authorization', 'Bearer synthetic-bearer')
      .send({ salary: 12345 })
      .expect(404);
    const logs = JSON.stringify(entries);
    expect(logs).not.toMatch(
      /synthetic-cpf|synthetic-token|synthetic-bearer|salary|12345/,
    );
    expect(entries.at(-1)?.route).toBe('unmatched');
    expect(entries.at(-1)?.durationMs).toEqual(expect.any(Number));
  });
  it('advertises only the allowed browser origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
  });
  it('publishes versioned operational OpenAPI contracts', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test').setVersion('0.1.0').build(),
    );
    expect(
      document.paths['/v1/health/ready']?.get?.responses['503'],
    ).toBeDefined();
    expect(document.components?.schemas?.HealthResponseDto).toBeDefined();
  });
});

describe('Real readiness failure', () => {
  it('reports database failure without leaking connection details', async () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      'postgresql://synthetic:synthetic@127.0.0.1:1/unavailable';
    const health = new HealthService();
    try {
      expect(await health.ready()).toEqual({
        status: 'error',
        service: 'tax-intelligence-api',
        checks: { database: 'down' },
      });
    } finally {
      await health.onModuleDestroy();
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
