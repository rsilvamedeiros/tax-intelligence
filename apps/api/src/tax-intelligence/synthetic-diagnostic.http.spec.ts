import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth';
import { configureHttp } from '../http';
import {
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { request as httpRequest } from 'node:http';
import { SyntheticDiagnosticExecutionService } from './application/synthetic-diagnostic-execution';
import { diagnoseSyntheticBatch } from './application/diagnose-synthetic-batch';
import {
  syntheticDiagnosticExecutionInputOpenApiSchema,
  syntheticDiagnosticExecutionDetailSchema,
} from '@tax/contracts';

describe('Synthetic diagnostic HTTP', () => {
  it('exposes authenticated creation without administrative storage fallback', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({
        verify: async () => ({
          issuer: 'https://example.invalid',
          subject: 'synthetic',
        }),
      })
      .compile();
    const app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, () => undefined);
    await app.init();
    try {
      await request(app.getHttpServer())
        .post(
          '/v1/organizations/00000000-0000-4000-8000-000000000001/synthetic-diagnostic-executions',
        )
        .send({ batchId: '00000000-0000-4000-8000-000000000002' })
        .expect(503);
    } finally {
      await app.close();
    }
  });
});

describe('Synthetic diagnostic transport contract', () => {
  let app: NestExpressApplication;
  const organizationId = '00000000-0000-4000-8000-000000000001';
  const batchId = '00000000-0000-4000-8000-000000000002';
  const executionId = '00000000-0000-4000-8000-000000000003';
  const path = `/v1/organizations/${organizationId}/synthetic-diagnostic-executions`;
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const receipt = {
    id: executionId,
    batchId,
    ruleId: 'DEMO-TOTAL-001',
    ruleVersion: '1.0.0',
    createdAt: '2026-10-22T00:00:00.000Z',
  };
  const detail = {
    ...receipt,
    diagnostic: diagnoseSyntheticBatch({
      schemaVersion: 'synthetic-document-batch-v1',
      documents: [
        {
          reference: 'sample',
          declaredTotalCents: 999,
          lineAmountsCents: [100, 200],
        },
      ],
    }),
  };
  const verify = jest.fn();
  const create = jest.fn();
  const get = jest.fn();
  const logs: unknown[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ verify })
      .overrideProvider(SyntheticDiagnosticExecutionService)
      .useValue({ create, get })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, (entry) => logs.push(entry));
    await app.init();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    logs.length = 0;
    verify.mockResolvedValue(identity);
    create.mockResolvedValue({ status: 'created', receipt });
    get.mockResolvedValue({ status: 'found', execution: detail });
  });
  it.each(['created', 'replayed'])(
    'projects %s receipt and verified identity',
    async (status) => {
      create.mockResolvedValue({ status, receipt });
      const response = await request(app.getHttpServer())
        .post(path)
        .set('x-request-id', executionId)
        .set('x-tenant-id', 'forged')
        .send({ batchId })
        .expect(status === 'created' ? 201 : 200);
      expect(response.body).toEqual(receipt);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(create).toHaveBeenCalledWith(identity, {
        organizationId,
        batchId,
        requestId: executionId,
      });
    },
  );
  it('returns strict evidence through read', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/${executionId}`)
      .expect(200);
    expect(response.body).toEqual(
      syntheticDiagnosticExecutionDetailSchema.parse(detail),
    );
    expect(get).toHaveBeenCalledWith(identity, { organizationId, executionId });
  });
  it.each(['post', 'get'] as const)(
    'authenticates before selectors: %s',
    async (method) => {
      verify.mockRejectedValue(new UnauthorizedException());
      const response = await request(app.getHttpServer())
        [method](
          '/v1/organizations/bad/synthetic-diagnostic-executions' +
            (method === 'get' ? '/bad' : ''),
        )
        .expect(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(create).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    },
  );
  it('maps unavailable identity verification to safe 503', async () => {
    verify.mockRejectedValue(new ServiceUnavailableException('private-auth'));
    const response = await request(app.getHttpServer())
      .post(path)
      .send({ batchId })
      .expect(503);
    expect(JSON.stringify([response.body, logs])).not.toContain('private-auth');
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { batchId: 'bad' },
    { batchId, actorId: executionId },
    { batchId, ruleId: 'other' },
    { batchId, documents: [] },
    { batchId, requestId: executionId },
    [],
  ])('rejects closed input %j', async (input) => {
    await request(app.getHttpServer()).post(path).send(input).expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['post', 'get'] as const)(
    'rejects query and invalid organization: %s',
    async (method) => {
      const target = method === 'get' ? `${path}/${executionId}` : path;
      await request(app.getHttpServer())
        [method](`${target}?tenant=forged`)
        .send(method === 'post' ? { batchId } : undefined)
        .expect(400);
      await request(app.getHttpServer())
        [method](target.replace(organizationId, 'bad'))
        .send(method === 'post' ? { batchId } : undefined)
        .expect(400);
      expect(create).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    },
  );
  it('rejects a client idempotency key', async () => {
    await request(app.getHttpServer())
      .post(path)
      .set('Idempotency-Key', executionId)
      .send({ batchId })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['text/plain', 'application/xml'])(
    'rejects media %s',
    async (media) => {
      await request(app.getHttpServer())
        .post(path)
        .set('Content-Type', media)
        .send('private-body')
        .expect(415);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it('rejects compression and malformed JSON', async () => {
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('{}')
      .expect(415);
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('enforces UTF8 byte size before schema processing', async () => {
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ batchId, padding: 'é'.repeat(600) }))
      .expect(413);
    expect(create).not.toHaveBeenCalled();
  });
  it('bounds chunked input', async () => {
    const address = app.getHttpServer().address();
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const call = httpRequest(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'transfer-encoding': 'chunked',
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      call.on('error', reject);
      call.write('{"padding":"');
      call.end('x'.repeat(1100) + '"}');
    });
    expect(status).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['json', 'text', 'chunked', 'invalid-id'])(
    'rejects read input: %s',
    async (kind) => {
      const call = request(app.getHttpServer()).get(
        `${path}/${kind === 'invalid-id' ? 'bad' : executionId}`,
      );
      if (kind === 'json') call.send({ batchId });
      if (kind === 'text') call.set('Content-Type', 'text/plain').send('x');
      if (kind === 'chunked') call.set('Transfer-Encoding', 'chunked');
      await call.expect(400);
      expect(get).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['denied', 403],
    ['not_found', 404],
  ] as const)('maps creation %s', async (status, code) => {
    create.mockResolvedValue({ status });
    await request(app.getHttpServer())
      .post(path)
      .send({ batchId })
      .expect(code);
  });
  it.each([
    ['denied', 403],
    ['not_found', 404],
  ] as const)('maps read %s', async (status, code) => {
    get.mockResolvedValue({ status });
    await request(app.getHttpServer())
      .get(`${path}/${executionId}`)
      .expect(code);
  });
  it.each(['create', 'get'])(
    'sanitizes %s storage failure and invalid result',
    async (operation) => {
      const mock = operation === 'create' ? create : get;
      const call = () =>
        operation === 'create'
          ? request(app.getHttpServer()).post(path).send({ batchId })
          : request(app.getHttpServer()).get(`${path}/${executionId}`);
      mock.mockRejectedValue(new Error('private-storage'));
      const response = await call().expect(503);
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
      expect(JSON.stringify([response.body, logs])).not.toContain(
        'private-storage',
      );
      mock.mockResolvedValue(
        operation === 'create'
          ? { status: 'created', receipt: { ...receipt, private: true } }
          : { status: 'found', execution: { ...detail, private: true } },
      );
      await call().expect(503);
    },
  );
  it('publishes strict body, bearer and all statuses in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const post =
      doc.paths[
        '/v1/organizations/{organizationId}/synthetic-diagnostic-executions'
      ]!.post!;
    expect(post.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(post.responses)).toEqual(
      expect.arrayContaining([
        '200',
        '201',
        '400',
        '401',
        '403',
        '404',
        '413',
        '415',
        '503',
      ]),
    );
    expect(post.requestBody).toEqual(
      expect.objectContaining({
        content: {
          'application/json': {
            schema: syntheticDiagnosticExecutionInputOpenApiSchema,
          },
        },
      }),
    );
    expect(
      doc.paths[
        '/v1/organizations/{organizationId}/synthetic-diagnostic-executions/{executionId}'
      ]!.get!.responses['404'],
    ).toBeDefined();
  });
});
