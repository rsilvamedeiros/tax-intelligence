import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  membershipRoleChangeOpenApiSchema,
  apiErrorOpenApiSchema,
} from '@tax/contracts';
import { AppModule } from '../app.module';
import { AuthService } from '../auth';
import { configureHttp } from '../http';
import {
  MembershipGrantService,
  MembershipGrantConflict,
  GrantTargetNotFound,
} from './membership-grant.service';
import { MembershipDenied } from './organizations.service';
describe('Membership grant HTTP contract', () => {
  let app: NestExpressApplication;
  const verify = jest.fn();
  const grant = jest.fn();
  const logs: unknown[] = [];
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const org = '00000000-0000-4000-8000-000000000001';
  const target = '00000000-0000-4000-8000-000000000002';
  const path = `/v1/organizations/${org}/memberships/${target}`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ verify })
      .overrideProvider(MembershipGrantService)
      .useValue({ grant })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (x) => logs.push(x));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    logs.length = 0;
    verify.mockResolvedValue(identity);
    grant.mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns 204 and uses verified identity and server correlation', async () => {
    const response = await request(app.getHttpServer())
      .put(path)
      .set('x-request-id', target)
      .set('x-tenant-id', 'forged')
      .send({ role: 'analyst' })
      .expect(204);
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(grant).toHaveBeenCalledWith(
      identity,
      org,
      target,
      'analyst',
      target,
    );
  });
  it('authenticates before validating selectors and body', async () => {
    verify.mockRejectedValue(new UnauthorizedException());
    const response = await request(app.getHttpServer())
      .put('/v1/organizations/bad/memberships/bad')
      .send({ role: 'bad' })
      .expect(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(grant).not.toHaveBeenCalled();
  });
  it.each([
    { role: 'bad' },
    { role: 'viewer', actorId: target },
    {},
    ['viewer'],
  ])('rejects invalid JSON %#', async (body) => {
    await request(app.getHttpServer()).put(path).send(body).expect(400);
    expect(grant).not.toHaveBeenCalled();
  });
  it.each([
    `${path}?role=viewer`,
    `/v1/organizations/bad/memberships/${target}`,
    `/v1/organizations/${org}/memberships/bad`,
  ])('rejects selector %s', async (url) => {
    await request(app.getHttpServer())
      .put(url)
      .send({ role: 'viewer' })
      .expect(400);
    expect(grant).not.toHaveBeenCalled();
  });
  it('rejects unparsed text body', async () => {
    await request(app.getHttpServer())
      .put(path)
      .type('text')
      .send('private-input')
      .expect(400);
    expect(grant).not.toHaveBeenCalled();
  });
  it.each([
    [new MembershipDenied(), 403],
    [new GrantTargetNotFound(), 404],
    [new MembershipGrantConflict(), 409],
    [new Error('private-storage-secret'), 503],
  ])('sanitizes failure %#', async (error, status) => {
    grant.mockRejectedValue(error);
    const response = await request(app.getHttpServer())
      .put(path)
      .send({ role: 'viewer' })
      .expect(status as number);
    expect(JSON.stringify([response.body, logs])).not.toMatch(
      /private-|synthetic|forged/,
    );
  });
  it('publishes strict request and sanitized errors', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const operation =
      doc.paths['/v1/organizations/{organizationId}/memberships/{actorId}']
        ?.put;
    expect(operation?.security).toEqual([{ bearer: [] }]);
    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': { schema: membershipRoleChangeOpenApiSchema },
      },
    });
    for (const status of ['400', '401', '403', '404', '409', '503'])
      expect(operation?.responses[status]).toMatchObject({
        content: { 'application/json': { schema: apiErrorOpenApiSchema } },
      });
    expect(operation?.responses['204']).not.toHaveProperty('content');
  });
});
