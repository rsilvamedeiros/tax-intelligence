import { createMembershipHandlers } from './membership-handlers';
describe('Administrative membership BFF boundary', () => {
  const origin = 'https://app.example.invalid';
  const org = '00000000-0000-4000-8000-000000000001';
  const actor = '00000000-0000-4000-8000-000000000002';
  const csrf = 'a'.repeat(43);
  const readSession = jest.fn();
  const upstream = jest.fn();
  const handlers = createMembershipHandlers({ origin, readSession, upstream });
  const page = {
    items: [{ actorId: actor, role: 'viewer', status: 'revoked' }],
    nextCursor: null,
  };
  function request(
    method = 'GET',
    query = '',
    body?: string,
    headers: Record<string, string> = {},
  ) {
    return new Request(
      `${origin}/api/organizations/${org}/memberships${query}`,
      {
        method,
        body,
        headers: {
          Origin: origin,
          'x-csrf-token': csrf,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
      },
    );
  }
  beforeEach(() => {
    jest.resetAllMocks();
    readSession.mockResolvedValue({
      accessToken: 'server-only-token',
      csrfToken: csrf,
    });
    upstream.mockResolvedValue(new Response(null, { status: 204 }));
  });
  it('lists with the server token and only validated pagination', async () => {
    upstream.mockResolvedValue(Response.json(page));
    const response = await handlers.list(
      request('GET', `?limit=1&cursor=${actor}`, undefined, {
        Authorization: 'Bearer attacker',
        'x-tenant-id': 'attacker',
      }),
      org,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations/${org}/memberships?limit=1&cursor=${actor}`,
      'server-only-token',
      { method: 'GET' },
    );
  });
  it('defaults the page without requiring CSRF for a read', async () => {
    upstream.mockResolvedValue(Response.json({ items: [], nextCursor: null }));
    const response = await handlers.list(
      new Request(`${origin}/api/organizations/${org}/memberships`),
      org,
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations/${org}/memberships?limit=25`,
      'server-only-token',
      { method: 'GET' },
    );
  });
  it.each([
    ['grant', 'PUT'],
    ['changeRole', 'PATCH'],
    ['revoke', 'DELETE'],
  ] as const)(
    'executes %s without forwarding browser credentials or query',
    async (action, method) => {
      const response = await handlers[action](
        request(
          method,
          '',
          method === 'DELETE' ? undefined : JSON.stringify({ role: 'analyst' }),
          {
            Authorization: 'Bearer attacker',
            cookie: 'tax_session=opaque',
            'x-role': 'organization_admin',
          },
        ),
        org,
        actor,
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(upstream).toHaveBeenCalledWith(
        `/v1/organizations/${org}/memberships/${actor}`,
        'server-only-token',
        {
          method,
          ...(method === 'DELETE'
            ? {}
            : { body: JSON.stringify({ role: 'analyst' }) }),
        },
      );
      expect(response.headers.get('set-cookie')).toBeNull();
    },
  );
  it('rejects missing sessions before malformed selectors', async () => {
    readSession.mockResolvedValue(undefined);
    expect(
      (await handlers.list(request('GET', '?limit=bad'), 'bad')).status,
    ).toBe(401);
    expect(
      (await handlers.grant(request('PUT', '?bad=1', 'invalid'), 'bad', 'bad'))
        .status,
    ).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects forged hosts but supports a host normalized by Next', async () => {
    expect(
      (
        await handlers.list(
          request('GET', '', undefined, { host: 'attacker.invalid' }),
          org,
        )
      ).status,
    ).toBe(400);
    expect(readSession).not.toHaveBeenCalled();
    upstream.mockResolvedValue(Response.json(page));
    expect(
      (
        await handlers.list(
          new Request('http://localhost/api/organizations/id/memberships', {
            headers: { host: 'app.example.invalid' },
          }),
          org,
        )
      ).status,
    ).toBe(200);
  });
  it.each(['https://attacker.invalid', 'null', ''])(
    'rejects mutation Origin %s before reading session',
    async (value) => {
      expect(
        (
          await handlers.revoke(
            request('DELETE', '', undefined, { Origin: value }),
            org,
            actor,
          )
        ).status,
      ).toBe(403);
      expect(readSession).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(['', 'b'.repeat(43), '!'.repeat(43), 'a'.repeat(10000)])(
    'rejects unbound or malformed CSRF %#',
    async (token) => {
      expect(
        (
          await handlers.grant(
            request('PUT', '', JSON.stringify({ role: 'viewer' }), {
              'x-csrf-token': token,
            }),
            org,
            actor,
          )
        ).status,
      ).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each([
    '?limit=0',
    '?limit=101',
    '?limit=1&limit=2',
    '?cursor=invalid',
    '?actorId=attacker',
  ])('rejects read query %s', async (query) => {
    expect((await handlers.list(request('GET', query), org)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects malformed UUIDs and mutation queries', async () => {
    expect((await handlers.list(request(), 'bad')).status).toBe(400);
    expect((await handlers.revoke(request('DELETE'), org, 'bad')).status).toBe(
      400,
    );
    expect(
      (
        await handlers.grant(
          request('PUT', '?role=viewer', '{"role":"viewer"}'),
          org,
          actor,
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    '{}',
    '["viewer"]',
    '{"role":"super_admin"}',
    '{"role":"viewer","actorId":"forged"}',
    'invalid',
    ' '.repeat(1025) + '{"role":"viewer"}',
  ])('rejects invalid or oversized JSON %#', async (body) => {
    expect(
      (await handlers.changeRole(request('PATCH', '', body), org, actor))
        .status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects non-JSON content types and absent JSON bodies', async () => {
    expect(
      (
        await handlers.grant(
          request('PUT', '', '{"role":"viewer"}', {
            'Content-Type': 'text/plain',
          }),
          org,
          actor,
        )
      ).status,
    ).toBe(400);
    expect((await handlers.grant(request('PUT'), org, actor)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('bounds chunked JSON and cancels an oversized stream', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
      },
      cancel,
    });
    const init = {
      method: 'PUT',
      body,
      duplex: 'half',
      headers: {
        Origin: origin,
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
    };
    const response = await handlers.grant(
      new Request(`${origin}/api/organizations/${org}/memberships`, init),
      org,
      actor,
    );
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects DELETE bodies even when empty JSON', async () => {
    expect(
      (await handlers.revoke(request('DELETE', '', '{}'), org, actor)).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('accepts a DELETE stream with zero bytes as supplied by Next', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const init = {
      method: 'DELETE',
      body,
      duplex: 'half',
      headers: { Origin: origin, 'x-csrf-token': csrf },
    };
    const response = await handlers.revoke(
      new Request(
        `${origin}/api/organizations/${org}/memberships/${actor}`,
        init,
      ),
      org,
      actor,
    );
    expect(response.status).toBe(204);
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations/${org}/memberships/${actor}`,
      'server-only-token',
      { method: 'DELETE' },
    );
  });
  it('rejects a method mismatched to the handler', async () => {
    const response = await handlers.grant(
      request('PATCH', '', '{"role":"viewer"}'),
      org,
      actor,
    );
    expect(response.headers.get('allow')).toBe('PUT');
    expect(response.status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 503])(
    'sanitizes mutation error %s',
    async (status) => {
      upstream.mockResolvedValue(
        Response.json(
          { token: 'private-upstream', sql: 'private' },
          {
            status,
            headers: {
              'set-cookie': 'private',
              location: 'https://attacker.invalid',
            },
          },
        ),
      );
      const response = await handlers.grant(
        request('PUT', '', '{"role":"viewer"}'),
        org,
        actor,
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('location')).toBeNull();
      expect(JSON.stringify(await response.json())).not.toContain('private');
    },
  );
  it.each([401, 403])(
    'preserves directory denial %s without upstream data',
    async (status) => {
      upstream.mockResolvedValue(
        Response.json({ subject: 'private' }, { status }),
      );
      const response = await handlers.list(request(), org);
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private');
    },
  );
  it('rejects redirects, unexpected statuses and malformed directory output', async () => {
    upstream.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.invalid' },
      }),
    );
    expect((await handlers.list(request(), org)).status).toBe(503);
    upstream.mockResolvedValue(Response.json({ ...page, token: 'private' }));
    expect((await handlers.list(request(), org)).status).toBe(503);
    upstream.mockResolvedValue(
      Response.json({ token: 'private' }, { status: 200 }),
    );
    expect(
      (
        await handlers.grant(
          request('PUT', '', '{"role":"viewer"}'),
          org,
          actor,
        )
      ).status,
    ).toBe(503);
    upstream.mockResolvedValue(new Response(null, { status: 404 }));
    expect((await handlers.list(request(), org)).status).toBe(503);
  });
  it('sanitizes session and network failure', async () => {
    readSession.mockRejectedValue(new Error('private-database'));
    const response = await handlers.list(request(), org);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private');
    readSession.mockResolvedValue({
      accessToken: 'server-only-token',
      csrfToken: csrf,
    });
    upstream.mockRejectedValue(new Error('private-network'));
    expect((await handlers.revoke(request('DELETE'), org, actor)).status).toBe(
      503,
    );
  });
});
