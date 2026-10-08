import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { apiErrorSchema } from '@tax/contracts';
import { AppModule } from '../app.module';
import { configureHttp } from '../http';

describe('Access token HTTP boundary', () => {
  let app: NestExpressApplication;
  let server: Server;
  let issuer: string;
  let key: CryptoKey;
  let otherKey: CryptoKey;
  let keys: JWK[];
  let unavailable = false;
  let redirect = false;
  let invalidKeys = false;
  let hits = 0;
  const entries: Record<string, string | number>[] = [];
  const envKeys = [
    'OIDC_ISSUER',
    'OIDC_JWKS_URL',
    'OIDC_AUDIENCE',
    'OIDC_CLIENT_ID',
    'NODE_ENV',
  ];
  const previous = envKeys.map((name) => process.env[name]);
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    key = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    keys = [
      {
        ...(await exportJWK(pair.publicKey)),
        kid: 'first',
        alg: 'RS256',
        use: 'sig',
      },
    ];
    server = createServer((_req, res) => {
      hits++;
      if (redirect) {
        res.writeHead(302, { location: 'http://untrusted.invalid/jwks' });
        res.end();
        return;
      }
      res.writeHead(unavailable ? 503 : 200, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify(invalidKeys ? { keys: 'invalid' } : { keys }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/realms/synthetic`;
    process.env.NODE_ENV = 'test';
    process.env.OIDC_ISSUER = issuer;
    process.env.OIDC_JWKS_URL = `${issuer}/certs`;
    process.env.OIDC_AUDIENCE = 'tax-intelligence-api';
    process.env.OIDC_CLIENT_ID = 'tax-intelligence-web';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (entry) => entries.push(entry));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    envKeys.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  });
  const token = async (
    claims: Record<string, unknown> = {},
    signingKey?: CryptoKey,
    kid = 'first',
  ) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: issuer,
      aud: 'tax-intelligence-api',
      sub: 'synthetic-subject-sentinel',
      iat: now,
      exp: now + 300,
      azp: 'tax-intelligence-web',
      typ: 'Bearer',
      email: 'synthetic-email-sentinel',
      tenant: 'untrusted-tenant',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
      .sign(signingKey ?? key);
  };
  it.each([undefined, 'Basic synthetic', 'Bearer invalid', 'Bearer a b'])(
    'rejects absent or malformed credentials without fetching keys',
    async (authorization) => {
      const before = hits;
      const call = request(app.getHttpServer()).get('/v1/auth/me');
      if (authorization) call.set('Authorization', authorization);
      const response = await call.expect(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(apiErrorSchema.parse(response.body).statusCode).toBe(401);
      expect(hits).toBe(before);
    },
  );
  it('returns only the verified identity and does not log credentials or claims', async () => {
    entries.length = 0;
    const bearer = await token();
    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    expect(response.body).toEqual({
      issuer,
      subject: 'synthetic-subject-sentinel',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    const logs = JSON.stringify(entries);
    for (const value of [
      bearer,
      'synthetic-subject-sentinel',
      'synthetic-email-sentinel',
      'untrusted-tenant',
    ])
      expect(logs).not.toContain(value);
  });
  it.each([
    { iss: 'https://untrusted.invalid' },
    { aud: 'another-api' },
    { azp: 'another-client' },
    { typ: 'ID' },
    { typ: undefined },
    { exp: undefined },
    { iat: undefined },
    { sub: '' },
    { sub: 12 },
    { exp: 1 },
    { iat: Math.floor(Date.now() / 1000) + 60 },
    { exp: Math.floor(Date.now() / 1000) + 3600 },
    { nbf: Math.floor(Date.now() / 1000) + 60 },
  ])('rejects invalid claims: %j', async (claims) => {
    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${await token(claims)}`)
      .expect(401);
    expect(apiErrorSchema.parse(response.body).statusCode).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain(
      'synthetic-email-sentinel',
    );
  });
  it('rejects a signature made with an untrusted key', async () => {
    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${await token({}, otherKey)}`)
      .expect(401);
  });
  it('rejects symmetric algorithm substitution', async () => {
    const bearer = await new SignJWT({
      iss: issuer,
      aud: 'tax-intelligence-api',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new Uint8Array(32));
    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(401);
  });
  it('uses a cached trusted key during a JWKS outage', async () => {
    unavailable = true;
    try {
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${await token()}`)
        .expect(200);
    } finally {
      unavailable = false;
    }
  });
  it('documents bearer security and the identity/error responses', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const route = doc.paths['/v1/auth/me']?.get;
    expect(route?.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(route?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '401', '503']),
    );
    expect(route?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            additionalProperties: false,
            required: ['issuer', 'subject'],
          },
        },
      },
    });
  });
  it('rejects an unknown key identifier during the refresh cooldown', async () => {
    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${await token({}, key, 'unknown')}`)
      .expect(401);
  });
  it('refreshes JWKS after cooldown and verifies a rotated signing key', async () => {
    const pair = await generateKeyPair('RS256');
    keys.push({
      ...(await exportJWK(pair.publicKey)),
      kid: 'rotated',
      alg: 'RS256',
      use: 'sig',
    });
    const future = Date.now() + 6000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(future);
    const before = hits;
    try {
      const issuedAt = Math.floor(future / 1000) - 6;
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set(
          'Authorization',
          `Bearer ${await token({ iat: issuedAt, exp: issuedAt + 300 }, pair.privateKey, 'rotated')}`,
        )
        .expect(200);
      expect(hits).toBeGreaterThan(before);
    } finally {
      clock.mockRestore();
    }
  });
  it.each(['outage', 'redirect', 'invalid-keys'])(
    'fails closed without cached keys: %s',
    async (failure) => {
      await app.close();
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>();
      configureHttp(app, (entry) => entries.push(entry));
      await app.init();
      unavailable = failure === 'outage';
      redirect = failure === 'redirect';
      invalidKeys = failure === 'invalid-keys';
      try {
        const response = await request(app.getHttpServer())
          .get('/v1/auth/me')
          .set('Authorization', `Bearer ${await token()}`)
          .expect(503);
        expect(apiErrorSchema.parse(response.body).statusCode).toBe(503);
        expect(JSON.stringify(response.body)).not.toContain(issuer);
      } finally {
        unavailable = false;
        redirect = false;
        invalidKeys = false;
      }
    },
  );
  it('keeps authentication disabled when provider configuration is absent', async () => {
    await app.close();
    for (const name of envKeys.filter((name) => name.startsWith('OIDC_')))
      delete process.env[name];
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (entry) => entries.push(entry));
    await app.init();
    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${await token()}`)
      .expect(503);
    await request(app.getHttpServer()).get('/v1/health/live').expect(200);
  });
});
