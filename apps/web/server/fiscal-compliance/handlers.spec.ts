import { createSyntheticBatchHandlers } from './handlers';

describe('Synthetic batch BFF boundary', () => {
  const origin = 'https://app.example.invalid';
  const org = '00000000-0000-4000-8000-000000000001';
  const batch = '00000000-0000-4000-8000-000000000002';
  const csrf = 'a'.repeat(43);
  const input = {
    schemaVersion: 'synthetic-document-batch-v1',
    documents: [
      { reference: 'demo', declaredTotalCents: 999, lineAmountsCents: [100] },
    ],
  };
  const receipt = {
    id: batch,
    schemaVersion: input.schemaVersion,
    createdAt: '2026-10-20T00:00:00.000Z',
  };
  const readSession = jest.fn();
  const upstream = jest.fn();
  const handlers = createSyntheticBatchHandlers({
    origin,
    readSession,
    upstream,
  });
  function request(
    body: string = JSON.stringify(input),
    headers: Record<string, string> = {},
    query = '',
  ) {
    return new Request(
      `${origin}/api/organizations/${org}/synthetic-document-batches${query}`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'x-csrf-token': csrf,
          'Content-Type': 'application/json',
          'Idempotency-Key': org.toUpperCase(),
          ...headers,
        },
        body,
      },
    );
  }
  beforeEach(() => {
    jest.resetAllMocks();
    readSession.mockResolvedValue({
      accessToken: 'server-only-token',
      csrfToken: csrf,
    });
    upstream.mockResolvedValue(Response.json(receipt, { status: 201 }));
  });
  it('creates with only verified selectors, server session token and normalized idempotency key', async () => {
    const response = await handlers.create(
      request(undefined, {
        Authorization: 'Bearer forged',
        Cookie: 'tax_session=opaque',
        'x-tenant-id': 'forged',
        'x-request-id': 'forged',
      }),
      org,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(receipt);
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations/${org}/synthetic-document-batches`,
      'server-only-token',
      { method: 'POST', body: JSON.stringify(input), idempotencyKey: org },
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
  it('reads a strict batch with the server session token and no CSRF requirement', async () => {
    const detail = { ...receipt, documents: input.documents };
    upstream.mockResolvedValue(Response.json(detail));
    const response = await handlers.get(
      new Request(
        `${origin}/api/organizations/${org}/synthetic-document-batches/${batch}`,
        { headers: { Authorization: 'Bearer forged' } },
      ),
      org,
      batch,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations/${org}/synthetic-document-batches/${batch}`,
      'server-only-token',
      { method: 'GET' },
    );
  });
  const getRequest = (headers: Record<string, string> = {}, query = '') =>
    new Request(
      `${origin}/api/organizations/${org}/synthetic-document-batches/${batch}${query}`,
      { headers },
    );
  function streamed(chunks: Uint8Array[], extra: Record<string, string> = {}) {
    return new Request(request().url, {
      method: 'POST',
      headers: { ...Object.fromEntries(request().headers), ...extra },
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  }
  it('preserves replay status and reuses the same key without automatic retries', async () => {
    upstream.mockResolvedValue(Response.json(receipt));
    const response = await handlers.create(request(), org);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'get'] as const)(
    'rejects absent session before selectors for %s',
    async (action) => {
      readSession.mockResolvedValue(undefined);
      const response =
        action === 'create'
          ? await handlers.create(request('bad'), 'bad')
          : await handlers.get(getRequest(), 'bad', 'bad');
      expect(response.status).toBe(401);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['create', 'get'] as const)(
    'sanitizes session failures for %s',
    async (action) => {
      readSession.mockRejectedValue(new Error('private-session-sentinel'));
      const response =
        action === 'create'
          ? await handlers.create(request(), org)
          : await handlers.get(getRequest(), org, batch);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private-session-sentinel');
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['https://attacker.invalid', '', 'null'])(
    'rejects Origin %s before reading the session',
    async (value) => {
      expect(
        (await handlers.create(request(undefined, { Origin: value }), org))
          .status,
      ).toBe(403);
      expect(readSession).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['', 'wrong', 'b'.repeat(43), 'é'.repeat(43)])(
    'rejects CSRF %#',
    async (value) => {
      expect(
        (
          await handlers.create(
            request(undefined, { 'x-csrf-token': value }),
            org,
          )
        ).status,
      ).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed stored CSRF', async () => {
    readSession.mockResolvedValue({
      accessToken: 'server-token',
      csrfToken: 'bad',
    });
    expect((await handlers.create(request(), org)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['create', 'get'] as const)(
    'rejects a hostile host for %s',
    async (action) => {
      const response =
        action === 'create'
          ? await handlers.create(
              request(undefined, { Host: 'attacker.invalid' }),
              org,
            )
          : await handlers.get(
              getRequest({ Host: 'attacker.invalid' }),
              org,
              batch,
            );
      expect(response.status).toBe(400);
      expect(readSession).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('rejects a different URL origin when Host is absent', async () => {
    expect(
      (await handlers.get(new Request('https://attacker.invalid/'), org, batch))
        .status,
    ).toBe(400);
    expect(readSession).not.toHaveBeenCalled();
  });
  it('ignores forwarded host and never copies browser headers or upstream cookies', async () => {
    upstream.mockResolvedValue(
      Response.json(receipt, {
        status: 201,
        headers: {
          'Set-Cookie': 'private-cookie',
          'x-private': 'private-header',
        },
      }),
    );
    const response = await handlers.create(
      request(undefined, {
        Host: new URL(origin).host,
        'x-forwarded-host': 'attacker.invalid',
        'x-role': 'organization_admin',
      }),
      org,
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-private')).toBeNull();
  });
  it('rejects method mismatch and reports Allow', async () => {
    const create = await handlers.create(getRequest(), org);
    const get = await handlers.get(request(), org, batch);
    expect([create.status, get.status]).toEqual([405, 405]);
    expect(create.headers.get('allow')).toBe('POST');
    expect(get.headers.get('allow')).toBe('GET');
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['?tenant=forged', '?id=a&id=b', '?limit=1'])(
    'rejects query %s',
    async (query) => {
      expect(
        (await handlers.create(request(undefined, {}, query), org)).status,
      ).toBe(400);
      expect(
        (await handlers.get(getRequest({}, query), org, batch)).status,
      ).toBe(400);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid UUID selectors', async () => {
    expect((await handlers.create(request(), 'bad')).status).toBe(400);
    expect((await handlers.get(getRequest(), 'bad', batch)).status).toBe(400);
    expect((await handlers.get(getRequest(), org, 'bad')).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    '',
    'bad',
    `${org.slice(0, 8)} ${org.slice(8)}`,
    `${org}, ${org}`,
    '00000000-0000-1000-8000-000000000001',
  ])('rejects idempotency key %#', async (key) => {
    const operation = request();
    if (key === '') operation.headers.delete('Idempotency-Key');
    else operation.headers.set('Idempotency-Key', key);
    expect((await handlers.create(operation, org)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('normalizes uppercase UUIDv4 letters before forwarding', async () => {
    const key = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    expect(
      (
        await handlers.create(
          request(undefined, { 'Idempotency-Key': key }),
          org,
        )
      ).status,
    ).toBe(201);
    expect(upstream.mock.calls[0]![2].idempotencyKey).toBe(key.toLowerCase());
  });
  it.each([
    {},
    [],
    { ...input, tenantId: org },
    { ...input, documents: [] },
    {
      ...input,
      documents: [{ ...input.documents[0], reference: 'bad reference' }],
    },
  ])('rejects strict input %#', async (body) => {
    expect(
      (await handlers.create(request(JSON.stringify(body)), org)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    'text/plain',
    'application/merge-patch+json',
    'application/json; charset=utf-16',
    '',
  ])('rejects media %s', async (media) => {
    expect(
      (
        await handlers.create(
          request(undefined, { 'Content-Type': media }),
          org,
        )
      ).status,
    ).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('accepts explicitly declared UTF-8', async () => {
    expect(
      (
        await handlers.create(
          request(undefined, {
            'Content-Type': 'application/json; charset=UTF-8',
          }),
          org,
        )
      ).status,
    ).toBe(201);
  });
  it.each([
    'application/json; charset="utf-8',
    'application/json; charset=utf-8"',
  ])('rejects malformed charset quoting: %s', async (media) => {
    expect(
      (
        await handlers.create(
          request(undefined, { 'Content-Type': media }),
          org,
        )
      ).status,
    ).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects compression', async () => {
    expect(
      (
        await handlers.create(
          request(undefined, { 'Content-Encoding': 'gzip' }),
          org,
        )
      ).status,
    ).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects invalid JSON and malformed UTF-8', async () => {
    expect(
      (await handlers.create(request('{"private-sentinel":'), org)).status,
    ).toBe(400);
    expect(
      (await handlers.create(streamed([new Uint8Array([0xff])]), org)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('accepts exactly 16 KiB and rejects one byte more regardless of Content-Length', async () => {
    const body = JSON.stringify(input);
    const exact = body + ' '.repeat(16384 - Buffer.byteLength(body));
    expect((await handlers.create(request(exact), org)).status).toBe(201);
    upstream.mockClear();
    expect(
      (
        await handlers.create(
          streamed([new TextEncoder().encode(exact), new Uint8Array([32])], {
            'Content-Length': '1',
          }),
          org,
        )
      ).status,
    ).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('counts UTF-8 bytes instead of characters', async () => {
    const body = JSON.stringify({ ...input, extra: 'é'.repeat(9000) });
    expect(body.length).toBeLessThan(16384);
    expect((await handlers.create(request(body), org)).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('cancels an oversized stream without waiting for completion', async () => {
    const cancel = jest.fn();
    const operation = new Request(request().url, {
      method: 'POST',
      headers: request().headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(16385));
        },
        cancel,
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    expect((await handlers.create(operation, org)).status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('sanitizes a failed input stream', async () => {
    const operation = new Request(request().url, {
      method: 'POST',
      headers: request().headers,
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error('private-stream'));
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const response = await handlers.create(operation, org);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('private-stream');
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    ['Content-Length', '1'],
    ['Transfer-Encoding', 'chunked'],
  ] as const)('rejects GET body framing %s', async (name, value) => {
    expect(
      (await handlers.get(getRequest({ [name]: value }), org, batch)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('accepts an explicit empty GET body length', async () => {
    upstream.mockResolvedValue(
      Response.json({ ...receipt, documents: input.documents }),
    );
    expect(
      (await handlers.get(getRequest({ 'Content-Length': '0' }), org, batch))
        .status,
    ).toBe(200);
  });
  it.each([400, 401, 403, 404, 409, 413, 415])(
    'sanitizes known upstream error %s',
    async (status) => {
      upstream.mockResolvedValue(
        Response.json(
          { secret: 'private-upstream-sentinel' },
          { status, headers: { 'Set-Cookie': 'private-cookie' } },
        ),
      );
      const response = await handlers.create(request(), org);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        message: 'Requisição rejeitada',
      });
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
    },
  );
  it.each([202, 204, 301, 302, 429, 500, 503])(
    'rejects unexpected upstream status %s',
    async (status) => {
      upstream.mockResolvedValue(new Response(null, { status }));
      expect((await handlers.create(request(), org)).status).toBe(503);
    },
  );
  it('rejects GET 201 even with a valid detail', async () => {
    upstream.mockResolvedValue(
      Response.json(
        { ...receipt, documents: input.documents },
        { status: 201 },
      ),
    );
    expect((await handlers.get(getRequest(), org, batch)).status).toBe(503);
  });
  it.each([401, 403, 404])(
    'preserves GET denial %s without reproducing its body',
    async (status) => {
      upstream.mockResolvedValue(
        Response.json({ secret: 'private-upstream' }, { status }),
      );
      const response = await handlers.get(getRequest(), org, batch);
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain('private-upstream');
    },
  );
  it.each([{}, { ...receipt, accessToken: 'private-token' }])(
    'rejects invalid receipt %#',
    async (body) => {
      upstream.mockResolvedValue(Response.json(body));
      expect((await handlers.create(request(), org)).status).toBe(503);
    },
  );
  it('rejects malformed detail and non-JSON media', async () => {
    upstream.mockResolvedValue(Response.json({ ...receipt, documents: [] }));
    expect((await handlers.get(getRequest(), org, batch)).status).toBe(503);
    upstream.mockResolvedValue(
      new Response(JSON.stringify(receipt), {
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    expect((await handlers.create(request(), org)).status).toBe(503);
  });
  it('bounds upstream bytes and rejects malformed JSON without leaking input', async () => {
    upstream.mockResolvedValue(
      new Response(JSON.stringify(receipt) + ' '.repeat(16384), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect((await handlers.create(request(), org)).status).toBe(503);
    upstream.mockResolvedValue(
      new Response('{"private-upstream":', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const response = await handlers.create(request(), org);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-upstream');
  });
  it('sanitizes an upstream network failure without retrying', async () => {
    upstream.mockRejectedValue(new Error('private-network-token'));
    const response = await handlers.create(request(), org);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-network-token');
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
