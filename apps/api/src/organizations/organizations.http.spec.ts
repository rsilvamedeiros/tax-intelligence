import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  organizationPageOpenApiSchema,
  organizationContextOpenApiSchema,
  apiErrorOpenApiSchema,
} from '@tax/contracts';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { configureHttp } from '../http';
import {
  OrganizationsService,
  MembershipDenied,
} from './organizations.service';

describe('Organization HTTP boundary', () => {
  let app: NestExpressApplication;
  const verify = jest.fn();
  const directory = { list: jest.fn(), context: jest.fn() };
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic-subject',
  };
  const id = '00000000-0000-4000-8000-000000000001';
  const logs: unknown[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ verify })
      .overrideProvider(OrganizationsService)
      .useValue(directory)
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (entry) => logs.push(entry));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    logs.length = 0;
    verify.mockResolvedValue(identity);
    directory.list.mockResolvedValue({
      items: [{ id, name: 'Synthetic', role: 'viewer' }],
      nextCursor: null,
    });
    directory.context.mockResolvedValue({
      organization: { id, name: 'Synthetic' },
      role: 'viewer',
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns a bounded authenticated page without caching', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/organizations?limit=1')
      .set('Authorization', 'Bearer synthetic')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.items).toHaveLength(1);
    expect(directory.list).toHaveBeenCalledWith(identity, 1, undefined);
    expect(verify).toHaveBeenCalledWith('Bearer synthetic');
  });
  it('checks authentication before validating selectors', async () => {
    verify.mockRejectedValue(new UnauthorizedException());
    const response = await request(app.getHttpServer())
      .get('/v1/organizations?limit=bad')
      .expect(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(directory.list).not.toHaveBeenCalled();
  });
  it.each(['limit=101', 'limit=1&limit=2', 'actorId=other', 'cursor=bad'])(
    'rejects invalid pagination %s',
    async (query) => {
      await request(app.getHttpServer())
        .get(`/v1/organizations?${query}`)
        .expect(400);
      expect(directory.list).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid context IDs and query selectors', async () => {
    await request(app.getHttpServer())
      .get('/v1/organizations/invalid/context')
      .expect(400);
    await request(app.getHttpServer())
      .get(`/v1/organizations/${id}/context?actorId=other`)
      .expect(400);
    expect(directory.context).not.toHaveBeenCalled();
  });
  it('uses verified identity regardless of tenant header', async () => {
    await request(app.getHttpServer())
      .get(`/v1/organizations/${id}/context`)
      .set('x-tenant-id', 'other')
      .expect(200);
    expect(directory.context).toHaveBeenCalledWith(identity, id);
  });
  it('denies absent or revoked membership uniformly', async () => {
    directory.context.mockRejectedValue(new MembershipDenied());
    const response = await request(app.getHttpServer())
      .get(`/v1/organizations/${id}/context`)
      .expect(403);
    expect(response.body.message).not.toContain(id);
  });
  it('sanitizes database failures and logs', async () => {
    directory.list.mockRejectedValue(
      new Error('synthetic-private-database-credential'),
    );
    const response = await request(app.getHttpServer())
      .get('/v1/organizations')
      .expect(503);
    expect(JSON.stringify([response.body, logs])).not.toContain(
      'synthetic-private',
    );
  });
  it('rejects malformed repository output rather than leaking fields', async () => {
    directory.context.mockResolvedValue({
      organization: { id, name: 'Synthetic' },
      role: 'viewer',
      actorId: 'private',
    });
    await request(app.getHttpServer())
      .get(`/v1/organizations/${id}/context`)
      .expect(503);
  });
  it('preserves identity provider unavailability', async () => {
    verify.mockRejectedValue(new ServiceUnavailableException());
    await request(app.getHttpServer()).get('/v1/organizations').expect(503);
    expect(directory.list).not.toHaveBeenCalled();
  });
  it('publishes strict response contracts and Bearer security in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const page = document.paths['/v1/organizations']!.get!;
    const context =
      document.paths['/v1/organizations/{organizationId}/context']!.get!;
    expect(page.security).toEqual([{ bearer: [] }]);
    expect(context.security).toEqual([{ bearer: [] }]);
    expect(page.responses['200']).toMatchObject({
      content: {
        'application/json': { schema: organizationPageOpenApiSchema },
      },
    });
    expect(context.responses['200']).toMatchObject({
      content: {
        'application/json': { schema: organizationContextOpenApiSchema },
      },
    });
    for (const status of ['400', '401', '503'])
      expect(page.responses[status]).toMatchObject({
        content: { 'application/json': { schema: apiErrorOpenApiSchema } },
      });
    expect(context.responses['403']).toMatchObject({
      content: { 'application/json': { schema: apiErrorOpenApiSchema } },
    });
    expect(page.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        }),
      ]),
    );
  });
});
