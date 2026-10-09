import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  administrativeMembershipPageOpenApiSchema,
  apiErrorOpenApiSchema,
} from '@tax/contracts';
import { AppModule } from '../app.module';
import { AuthService } from '../auth';
import { configureHttp } from '../http';
import { AdministrativeMembershipService } from './administrative-membership.service';
import { MembershipDenied } from './organizations.service';

describe('Administrative membership HTTP contract', () => {
  let app: NestExpressApplication;
  const verify = jest.fn();
  const list = jest.fn();
  const logs: unknown[] = [];
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const org = '00000000-0000-4000-8000-000000000001';
  const actorId = '00000000-0000-4000-8000-000000000002';
  const path = `/v1/organizations/${org}/memberships`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ verify })
      .overrideProvider(AdministrativeMembershipService)
      .useValue({ list })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (x) => logs.push(x));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    logs.length = 0;
    verify.mockResolvedValue(identity);
    list.mockResolvedValue({
      items: [{ actorId, role: 'viewer', status: 'revoked' }],
      nextCursor: null,
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns the bounded page using verified identity without caching', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}?limit=1&cursor=${actorId}`)
      .set('x-tenant-id', 'forged')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      items: [{ actorId, role: 'viewer', status: 'revoked' }],
      nextCursor: null,
    });
    expect(list).toHaveBeenCalledWith(identity, org, 1, actorId);
  });
  it('defaults pagination and accepts an authorized empty page', async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    const response = await request(app.getHttpServer()).get(path).expect(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
    expect(list).toHaveBeenCalledWith(identity, org, 25, undefined);
  });
  it('authenticates before validating selectors', async () => {
    verify.mockRejectedValue(new UnauthorizedException());
    const response = await request(app.getHttpServer())
      .get('/v1/organizations/bad/memberships?limit=0')
      .expect(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(list).not.toHaveBeenCalled();
  });
  it.each([
    '?limit=0',
    '?limit=101',
    '?limit=1&limit=2',
    '?cursor=bad',
    '?actorId=forged',
    '?status=active',
  ])('rejects invalid query %s', async (query) => {
    await request(app.getHttpServer())
      .get(path + query)
      .expect(400);
    expect(list).not.toHaveBeenCalled();
  });
  it('rejects malformed organization identifiers', async () => {
    await request(app.getHttpServer())
      .get('/v1/organizations/bad/memberships')
      .expect(400);
    expect(list).not.toHaveBeenCalled();
  });
  it.each([
    [new MembershipDenied(), 403],
    [new Error('private-storage'), 503],
  ])('sanitizes failure %#', async (error, status) => {
    list.mockRejectedValue(error);
    const response = await request(app.getHttpServer())
      .get(path)
      .expect(status as number);
    expect(response.body.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify([response.body, logs])).not.toMatch(
      /private-|synthetic|forged/,
    );
  });
  it.each([
    {
      items: [
        { actorId, role: 'viewer', status: 'active', subject: 'private' },
      ],
      nextCursor: null,
    },
    {
      items: [{ actorId, role: 'viewer', status: 'unknown' }],
      nextCursor: null,
    },
  ])('fails closed on unsafe output %#', async (page) => {
    list.mockResolvedValue(page);
    const response = await request(app.getHttpServer()).get(path).expect(503);
    expect(JSON.stringify([response.body, logs])).not.toContain('private');
  });
  it('publishes pagination, authentication and response schemas', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const operation =
      doc.paths['/v1/organizations/{organizationId}/memberships']?.get;
    expect(operation?.security).toEqual([{ bearer: [] }]);
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        }),
        expect.objectContaining({
          name: 'cursor',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
        }),
      ]),
    );
    expect(operation?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: administrativeMembershipPageOpenApiSchema,
        },
      },
    });
    for (const status of ['400', '401', '403', '503'])
      expect(operation?.responses[status]).toMatchObject({
        content: { 'application/json': { schema: apiErrorOpenApiSchema } },
      });
  });
});
