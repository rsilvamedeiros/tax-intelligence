import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { request as httpRequest } from 'node:http';
import { AppModule } from '../app.module';
import { AuthService } from '../auth';
import { configureHttp } from '../http';
import { UnauthorizedException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  syntheticDocumentBatchReceiptSchema,
  syntheticDocumentBatchDetailSchema,
} from '@tax/contracts';
import { SyntheticBatchRepository } from './synthetic-batch.repository';

describe('Synthetic batch HTTP', () => {
  let app: NestExpressApplication;
  const organizationId = '00000000-0000-4000-8000-000000000001';
  const path = `/v1/organizations/${organizationId}/synthetic-document-batches`;
  const batchId = '00000000-0000-4000-8000-000000000002';
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const input = {
    schemaVersion: 'synthetic-document-batch-v1',
    documents: [
      { reference: 'sample', declaredTotalCents: 100, lineAmountsCents: [100] },
    ],
  };
  const receipt = {
    id: batchId,
    schemaVersion: input.schemaVersion,
    createdAt: '2026-10-20T00:00:00.000Z',
  };
  const verify = jest.fn();
  const create = jest.fn();
  const get = jest.fn();
  const logs: unknown[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ verify })
      .overrideProvider(SyntheticBatchRepository)
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
    get.mockResolvedValue({
      status: 'found',
      batch: { ...receipt, documents: input.documents },
    });
  });
  it('exposes the authenticated operation without falling back to administrative storage', async () => {
    create.mockRejectedValue(new Error('storage-unavailable'));
    await request(app.getHttpServer())
      .post(path)
      .set('Idempotency-Key', organizationId)
      .send({
        schemaVersion: 'synthetic-document-batch-v1',
        documents: [
          {
            reference: 'sample',
            declaredTotalCents: 100,
            lineAmountsCents: [100],
          },
        ],
      })
      .expect(503);
  });
  it.each(['created', 'replayed'])(
    'returns projected receipt for %s with verified identity',
    async (status) => {
      create.mockResolvedValue({ status, receipt });
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Idempotency-Key', organizationId.toUpperCase())
        .set('x-request-id', batchId)
        .set('x-tenant-id', 'forged')
        .send(input)
        .expect(status === 'created' ? 201 : 200);
      expect(response.body).toEqual(
        syntheticDocumentBatchReceiptSchema.parse(receipt),
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(create).toHaveBeenCalledWith({
        identity,
        organizationId,
        input,
        idempotencyKey: organizationId,
        requestId: batchId,
      });
    },
  );
  it('returns strict detail', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/${batchId}`)
      .expect(200);
    expect(response.body).toEqual(
      syntheticDocumentBatchDetailSchema.parse({
        ...receipt,
        documents: input.documents,
      }),
    );
    expect(get).toHaveBeenCalledWith({ identity, organizationId, batchId });
  });
  it.each(['post', 'get'] as const)(
    'authenticates before controller validation: %s',
    async (method) => {
      verify.mockRejectedValue(new UnauthorizedException());
      const response = await request(app.getHttpServer())
        [method](
          '/v1/organizations/bad/synthetic-document-batches' +
            (method === 'get' ? '/bad' : ''),
        )
        .expect(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(create).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    },
  );
  it.each([
    undefined,
    'bad',
    `${organizationId}, ${batchId}`,
    '00000000-0000-1000-8000-000000000001',
  ])('rejects key %s', async (key) => {
    const operation = request(app.getHttpServer()).post(path);
    if (key) operation.set('Idempotency-Key', key);
    await operation.send(input).expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects duplicate key headers', async () => {
    await request(app.getHttpServer())
      .post(path)
      .set({ 'Idempotency-Key': [organizationId, organizationId] })
      .send(input)
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    {},
    [],
    { ...input, tenantId: organizationId },
    { ...input, documents: [] },
  ])('rejects body %#', async (body) => {
    await request(app.getHttpServer())
      .post(path)
      .set('Idempotency-Key', organizationId)
      .send(body)
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it.each([`${path}?extra=1`, path.replace(organizationId, 'bad')])(
    'rejects selector %s',
    async (url) => {
      await request(app.getHttpServer())
        .post(url)
        .set('Idempotency-Key', organizationId)
        .send(input)
        .expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each([
    'text/plain',
    'application/octet-stream',
    'application/merge-patch+json',
  ])('rejects media %s', async (media) => {
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', media)
      .send(JSON.stringify(input))
      .expect(415);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON without logging content', async () => {
    await request(app.getHttpServer())
      .post(path)
      .type('json')
      .send('{"private-sentinel":')
      .expect(400);
    expect(JSON.stringify(logs)).not.toContain('private-sentinel');
  });
  it('bounds actual JSON bytes', async () => {
    await request(app.getHttpServer())
      .post(path)
      .type('json')
      .send(JSON.stringify(input) + ' '.repeat(16384))
      .expect(413);
    expect(create).not.toHaveBeenCalled();
  });
  it('accepts exactly 16 KiB of JSON transport', async () => {
    const json = JSON.stringify(input);
    await request(app.getHttpServer())
      .post(path)
      .type('json')
      .set('Idempotency-Key', organizationId)
      .send(json + ' '.repeat(16384 - Buffer.byteLength(json)))
      .expect(201);
  });
  it('rejects malformed stored output rather than exposing it', async () => {
    create.mockResolvedValue({
      status: 'created',
      receipt: { ...receipt, secret: 'private-sentinel' },
    });
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Idempotency-Key', organizationId)
      .send(input)
      .expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private-sentinel');
    get.mockResolvedValue({
      status: 'found',
      batch: { ...receipt, documents: [] },
    });
    await request(app.getHttpServer()).get(`${path}/${batchId}`).expect(503);
  });
  it('bounds chunked JSON bytes', async () => {
    const server = app.getHttpServer();
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('HTTP listener unavailable');
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const operation = httpRequest(
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
      operation.on('error', reject);
      operation.write(JSON.stringify(input));
      operation.end(' '.repeat(16384));
    });
    expect(status).toBe(413);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects compressed JSON', async () => {
    await request(app.getHttpServer())
      .post(path)
      .type('json')
      .set('Content-Encoding', 'gzip')
      .send('compressed-sentinel')
      .expect(415);
    expect(create).not.toHaveBeenCalled();
  });
  it.each([`${path}/bad`, `${path}/${batchId}?extra=1`])(
    'rejects GET selector %s',
    async (url) => {
      await request(app.getHttpServer()).get(url).expect(400);
      expect(get).not.toHaveBeenCalled();
    },
  );
  it.each(['application/json', 'text/plain'])(
    'rejects GET body %s',
    async (media) => {
      await request(app.getHttpServer())
        .get(`${path}/${batchId}`)
        .set('Content-Type', media)
        .send('{}')
        .expect(400);
      expect(get).not.toHaveBeenCalled();
    },
  );
  it('rejects GET chunked framing', async () => {
    await request(app.getHttpServer())
      .get(`${path}/${batchId}`)
      .set('Transfer-Encoding', 'chunked')
      .expect(400);
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    ['denied', 403],
    ['conflict', 409],
  ] as const)('maps create %s', async (status, code) => {
    create.mockResolvedValue({ status });
    await request(app.getHttpServer())
      .post(path)
      .set('Idempotency-Key', organizationId)
      .send(input)
      .expect(code);
  });
  it.each([
    ['denied', 403],
    ['not_found', 404],
  ] as const)('maps get %s', async (status, code) => {
    get.mockResolvedValue({ status });
    await request(app.getHttpServer()).get(`${path}/${batchId}`).expect(code);
  });
  it.each(['create', 'get'])('sanitizes %s failure', async (operation) => {
    (operation === 'create' ? create : get).mockRejectedValue(
      new Error('private-storage-sentinel'),
    );
    const call =
      operation === 'create'
        ? request(app.getHttpServer())
            .post(path)
            .set('Idempotency-Key', organizationId)
            .send(input)
        : request(app.getHttpServer()).get(`${path}/${batchId}`);
    const response = await call.expect(503);
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(JSON.stringify([response.body, logs])).not.toContain(
      'private-storage-sentinel',
    );
  });
  it('publishes both schemas, bearer and all transport outcomes', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const post =
      doc.paths[
        '/v1/organizations/{organizationId}/synthetic-document-batches'
      ]!.post!;
    expect(post.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(post.responses)).toEqual(
      expect.arrayContaining([
        '200',
        '201',
        '400',
        '401',
        '403',
        '409',
        '413',
        '415',
        '503',
      ]),
    );
    expect(
      doc.paths[
        '/v1/organizations/{organizationId}/synthetic-document-batches/{batchId}'
      ]!.get!.responses['404'],
    ).toBeDefined();
  });
});
