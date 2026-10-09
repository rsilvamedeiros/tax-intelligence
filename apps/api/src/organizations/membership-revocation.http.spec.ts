import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { AuthService } from '../auth';
import { configureHttp } from '../http';
import { MembershipDenied } from './organizations.service';
import {
  LastAdministrator,
  MembershipRevocationService,
} from './membership-revocation.service';
describe('Membership revocation HTTP boundary', () => {
  let app: NestExpressApplication;
  const verify = jest.fn();
  const revoke = jest.fn();
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const id = '00000000-0000-4000-8000-000000000001';
  const target = '00000000-0000-4000-8000-000000000002';
  const path = `/v1/organizations/${id}/memberships/${target}`;
  const logs: unknown[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ verify })
      .overrideProvider(MembershipRevocationService)
      .useValue({ revoke })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (entry) => logs.push(entry));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    logs.length = 0;
    verify.mockResolvedValue(identity);
    revoke.mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns empty 204 and derives initiator from verified token', async () => {
    const response = await request(app.getHttpServer())
      .delete(path)
      .set('Authorization', 'Bearer synthetic')
      .set('x-tenant-id', 'attacker')
      .set('x-request-id', target)
      .expect(204);
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(revoke).toHaveBeenCalledWith(identity, id, target, target);
  });
  it('authenticates before validating IDs', async () => {
    verify.mockRejectedValue(new UnauthorizedException());
    const response = await request(app.getHttpServer())
      .delete('/v1/organizations/bad/memberships/bad')
      .expect(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(revoke).not.toHaveBeenCalled();
  });
  it.each([
    ['invalid organization', `/v1/organizations/bad/memberships/${target}`],
    ['invalid actor', `/v1/organizations/${id}/memberships/bad`],
    ['unknown query', `${path}?role=organization_admin`],
  ])('rejects %s', async (_label, url) => {
    await request(app.getHttpServer()).delete(url).expect(400);
    expect(revoke).not.toHaveBeenCalled();
  });
  it('rejects body fields rather than trusting actor or tenant input', async () => {
    await request(app.getHttpServer())
      .delete(path)
      .send({ actorId: target })
      .expect(400);
    expect(revoke).not.toHaveBeenCalled();
  });
  it.each(['null', 'private-text'])(
    'rejects nonempty raw body %s',
    async (body) => {
      await request(app.getHttpServer())
        .delete(path)
        .set(
          'Content-Type',
          body === 'null' ? 'application/json' : 'text/plain',
        )
        .send(body)
        .expect(400);
      expect(revoke).not.toHaveBeenCalled();
    },
  );
  it.each([
    [new MembershipDenied(), 403],
    [new LastAdministrator(), 409],
    [new Error('private-storage-password'), 503],
  ])('sanitizes domain or storage errors %#', async (error, status) => {
    revoke.mockRejectedValue(error);
    const response = await request(app.getHttpServer())
      .delete(path)
      .expect(status as number);
    expect(JSON.stringify([response.body, logs])).not.toMatch(
      /private-storage|synthetic|attacker/,
    );
  });
  it('preserves identity verification unavailability', async () => {
    verify.mockRejectedValue(new ServiceUnavailableException());
    await request(app.getHttpServer()).delete(path).expect(503);
    expect(revoke).not.toHaveBeenCalled();
  });
  it('documents authorization, idempotent response and conflict', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const operation =
      doc.paths['/v1/organizations/{organizationId}/memberships/{actorId}']
        ?.delete;
    expect(operation?.security).toEqual([{ bearer: [] }]);
    for (const status of ['204', '400', '401', '403', '409', '503'])
      expect(operation?.responses[status]).toBeDefined();
    expect(operation?.responses['204']).not.toHaveProperty('content');
  });
});
