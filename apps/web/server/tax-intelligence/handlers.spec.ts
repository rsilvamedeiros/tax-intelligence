import { createSyntheticDiagnosticHandlers } from './handlers';

describe('Synthetic diagnostic BFF', () => {
  const origin = 'https://app.example.invalid';
  const org = '00000000-0000-4000-8000-000000000001';
  const batchId = '00000000-0000-4000-8000-000000000002';
  const executionId = '00000000-0000-4000-8000-000000000003';
  const csrf = 'a'.repeat(43);
  const input = { batchId };
  const receipt = {
    id: executionId,
    batchId,
    ruleId: 'DEMO-TOTAL-001',
    ruleVersion: '1.0.0',
    createdAt: '2026-10-23T00:00:00.000Z',
  };
  const detail = {
    ...receipt,
    diagnostic: {
      schemaVersion: 'synthetic-document-diagnostic-v1',
      rule: {
        id: 'DEMO-TOTAL-001',
        version: '1.0.0',
        source: 'project-fixture-specification',
        fiscalValidity: 'none',
      },
      documents: [
        {
          reference: 'demo',
          declaredTotalCents: 999,
          lineAmountsCents: [100],
          computedTotalCents: 100,
          differenceCents: 899,
          outcome: 'mismatch',
        },
      ],
    },
  };
  const readSession = jest.fn();
  const upstream = jest.fn();
  const handlers = createSyntheticDiagnosticHandlers({
    origin,
    readSession,
    upstream,
  });
  function request(
    body = JSON.stringify(input),
    headers: Record<string, string> = {},
    query = '',
  ) {
    return new Request(
      `${origin}/api/organizations/${org}/synthetic-diagnostic-executions${query}`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'x-csrf-token': csrf,
          'Content-Type': 'application/json',
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
  it('creates using only session token and validated batch reference', async () => {
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
      `/v1/organizations/${org}/synthetic-diagnostic-executions`,
      'server-only-token',
      { method: 'POST', body: JSON.stringify(input) },
    );
  });
  it('rejects a valid upstream receipt exceeding the response byte limit', async () => {
    upstream.mockResolvedValue(
      new Response(' '.repeat(32768) + JSON.stringify(receipt), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect((await handlers.create(request(), org)).status).toBe(503);
  });
  const read = (headers: Record<string, string> = {}, query = '') =>
    new Request(
      `${origin}/api/organizations/${org}/synthetic-diagnostic-executions/${executionId}${query}`,
      { headers },
    );
  it('reads strict evidence using only the server session token', async () => {
    upstream.mockResolvedValue(Response.json(detail));
    const response = await handlers.get(
      read({ Authorization: 'Bearer forged', 'x-tenant-id': 'forged' }),
      org,
      executionId,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations/${org}/synthetic-diagnostic-executions/${executionId}`,
      'server-only-token',
      { method: 'GET' },
    );
  });
  it.each([200, 201])(
    'preserves create status %s without retries',
    async (status) => {
      upstream.mockResolvedValue(Response.json(receipt, { status }));
      const response = await handlers.create(request(), org);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(receipt);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    },
  );
  it.each(['create', 'get'] as const)(
    'requires session before selectors: %s',
    async (action) => {
      readSession.mockResolvedValue(undefined);
      const response =
        action === 'create'
          ? await handlers.create(request('bad', {}, '?forged=1'), 'bad')
          : await handlers.get(read({}, '?forged=1'), 'bad', 'bad');
      expect(response.status).toBe(401);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['create', 'get'] as const)(
    'sanitizes session failure: %s',
    async (action) => {
      readSession.mockRejectedValue(new Error('private-session'));
      const response =
        action === 'create'
          ? await handlers.create(request(), org)
          : await handlers.get(read(), org, executionId);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private-session');
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['wrong.example.invalid', 'app.example.invalid:9999'])(
    'rejects untrusted Host %s despite forwarded headers',
    async (host) => {
      const response = await handlers.create(
        request(undefined, {
          Host: host,
          'x-forwarded-host': 'app.example.invalid',
          'x-forwarded-proto': 'https',
        }),
        org,
      );
      expect(response.status).toBe(400);
      expect(readSession).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('accepts the configured Host behind an internal request URL', async () => {
    const response = await handlers.create(
      new Request('http://internal.invalid/path', {
        method: 'POST',
        headers: {
          Host: 'app.example.invalid',
          Origin: origin,
          'x-csrf-token': csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      }),
      org,
    );
    expect(response.status).toBe(201);
  });
  it('rejects an external URL when Host is unavailable', async () => {
    expect(
      (
        await handlers.get(
          new Request('https://external.invalid/path'),
          org,
          executionId,
        )
      ).status,
    ).toBe(400);
    expect(readSession).not.toHaveBeenCalled();
  });
  it.each(['https://evil.invalid', origin + '/', 'null', ''])(
    'requires exact Origin %s',
    async (value) => {
      const response = await handlers.create(
        request(undefined, { Origin: value }),
        org,
      );
      expect(response.status).toBe(403);
      expect(readSession).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['', 'bad', 'b'.repeat(43), 'a'.repeat(42), 'a'.repeat(44)])(
    'rejects CSRF %s',
    async (token) => {
      expect(
        (
          await handlers.create(
            request(undefined, { 'x-csrf-token': token }),
            org,
          )
        ).status,
      ).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed session CSRF', async () => {
    readSession.mockResolvedValue({
      accessToken: 'server-token',
      csrfToken: 'bad',
    });
    expect((await handlers.create(request(), org)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['create', 'get'] as const)(
    'rejects unexpected methods: %s',
    async (action) => {
      const req = new Request(origin + '/path', { method: 'PUT' });
      const response =
        action === 'create'
          ? await handlers.create(req, org)
          : await handlers.get(req, org, executionId);
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe(
        action === 'create' ? 'POST' : 'GET',
      );
      expect(readSession).not.toHaveBeenCalled();
    },
  );
  it.each(['create', 'get'] as const)(
    'rejects invalid selectors/query: %s',
    async (action) => {
      const call = (id: string, query = '') =>
        action === 'create'
          ? handlers.create(request(undefined, {}, query), id)
          : handlers.get(read({}, query), id, executionId);
      expect((await call('bad')).status).toBe(400);
      expect((await call(org, '?role=admin')).status).toBe(400);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each([
    {},
    { batchId: 'bad' },
    { batchId, actorId: executionId },
    { batchId, requestId: executionId },
    { batchId, ruleId: 'other' },
    { batchId, documents: [] },
    [],
  ])('rejects closed input %j', async (body) => {
    expect(
      (await handlers.create(request(JSON.stringify(body)), org)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects any Idempotency-Key because replay is natural', async () => {
    expect(
      (
        await handlers.create(
          request(undefined, { 'Idempotency-Key': org }),
          org,
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    'text/plain',
    'application/json; charset=latin1',
    'application/json; unexpected=true',
    'application/problem+json',
  ])('rejects media %s', async (contentType) => {
    expect(
      (
        await handlers.create(
          request(undefined, { 'Content-Type': contentType }),
          org,
        )
      ).status,
    ).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    'application/json; charset=utf-8',
    'application/json; charset="UTF-8"',
  ])('accepts JSON UTF8 %s', async (contentType) => {
    expect(
      (
        await handlers.create(
          request(undefined, { 'Content-Type': contentType }),
          org,
        )
      ).status,
    ).toBe(201);
  });
  it('rejects compressed input and invalid JSON', async () => {
    expect(
      (
        await handlers.create(
          request(undefined, { 'Content-Encoding': 'gzip' }),
          org,
        )
      ).status,
    ).toBe(415);
    expect((await handlers.create(request('{'), org)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('accepts exact input byte limit and rejects one byte more', async () => {
    const body = JSON.stringify(input);
    expect(
      (
        await handlers.create(
          request(' '.repeat(1024 - body.length) + body),
          org,
        )
      ).status,
    ).toBe(201);
    upstream.mockClear();
    expect(
      (
        await handlers.create(
          request(' '.repeat(1025 - body.length) + body),
          org,
        )
      ).status,
    ).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('counts UTF8 bytes before schema processing', async () => {
    expect(
      (
        await handlers.create(
          request(JSON.stringify({ padding: 'é'.repeat(600) })),
          org,
        )
      ).status,
    ).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('bounds a stream even with misleading Content-Length and cancels overflow', async () => {
    const cancel = jest.fn();
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode('x'.repeat(1025)));
        }
      },
      cancel,
    });
    const req = new Request(origin + '/path', {
      method: 'POST',
      headers: {
        Origin: origin,
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
        'Content-Length': '0',
      },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect((await handlers.create(req, org)).status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects invalid input UTF8 and missing stream', async () => {
    const base = request();
    const req = new Request(base.url, {
      method: 'POST',
      headers: base.headers,
      body: new Uint8Array([0xff]),
    });
    expect((await handlers.create(req, org)).status).toBe(400);
    expect(
      (
        await handlers.create(
          new Request(base.url, { method: 'POST', headers: base.headers }),
          org,
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    ['Content-Length', '1'],
    ['Transfer-Encoding', 'chunked'],
  ])('rejects GET framing %s', async (name, value) => {
    expect(
      (await handlers.get(read({ [name]: value }), org, executionId)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects a GET body object and malformed execution ID', async () => {
    const req = read();
    Object.defineProperty(req, 'body', { value: new ReadableStream() });
    expect((await handlers.get(req, org, executionId)).status).toBe(400);
    expect((await handlers.get(read(), org, 'bad')).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 413, 415, 409, 500, 502, 503, 302, 204])(
    'sanitizes upstream status %s',
    async (status) => {
      upstream.mockResolvedValue(
        new Response(status === 204 ? null : 'private-upstream', {
          status,
          headers: {
            'Set-Cookie': 'private-cookie',
            Location: 'https://evil.invalid',
          },
        }),
      );
      const response = await handlers.create(request(), org);
      expect(response.status).toBe(
        [400, 401, 403, 404, 413, 415].includes(status) ? status : 503,
      );
      expect(await response.text()).not.toContain('private-upstream');
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    },
  );
  it('treats a GET 201 as failure', async () => {
    upstream.mockResolvedValue(Response.json(detail, { status: 201 }));
    expect((await handlers.get(read(), org, executionId)).status).toBe(503);
  });
  it('does not retry an upstream timeout or network error', async () => {
    upstream.mockRejectedValue(new Error('private-timeout'));
    const response = await handlers.create(request(), org);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-timeout');
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'get'] as const)(
    'rejects unknown result fields: %s',
    async (action) => {
      upstream.mockResolvedValue(
        Response.json(
          {
            ...(action === 'create' ? receipt : detail),
            token: 'private-token',
          },
          { status: action === 'create' ? 201 : 200 },
        ),
      );
      const response =
        action === 'create'
          ? await handlers.create(request(), org)
          : await handlers.get(read(), org, executionId);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private-token');
    },
  );
  it('accepts exact response byte limit', async () => {
    const body = JSON.stringify(receipt);
    upstream.mockResolvedValue(
      new Response(' '.repeat(32768 - body.length) + body, {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect((await handlers.create(request(), org)).status).toBe(201);
  });
  it('cancels an oversized upstream stream', async () => {
    const cancel = jest.fn();
    let sent = false;
    upstream.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            if (!sent) {
              sent = true;
              controller.enqueue(new Uint8Array(32769));
            }
          },
          cancel,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect((await handlers.create(request(), org)).status).toBe(503);
    expect(cancel).toHaveBeenCalled();
  });
  it.each(['text/plain', 'missing', 'malformed', 'invalid-utf8', 'empty'])(
    'rejects invalid upstream JSON %s',
    async (kind) => {
      const value =
        kind === 'invalid-utf8'
          ? new Uint8Array([0xff])
          : kind === 'empty'
            ? null
            : kind === 'malformed'
              ? '{'
              : JSON.stringify(receipt);
      upstream.mockResolvedValue(
        new Response(value, {
          status: 201,
          headers:
            kind === 'missing'
              ? {}
              : {
                  'Content-Type':
                    kind === 'text/plain' ? 'text/plain' : 'application/json',
                },
        }),
      );
      expect((await handlers.create(request(), org)).status).toBe(503);
    },
  );
});
