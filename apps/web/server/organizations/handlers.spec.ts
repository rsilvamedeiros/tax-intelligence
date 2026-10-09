import { createOrganizationHandlers } from './handlers';
describe('Organization BFF boundary', () => {
  const origin = 'https://app.example.invalid';
  const id = '00000000-0000-4000-8000-000000000001';
  const row = { id, name: 'Synthetic', role: 'viewer' };
  const readSession = jest.fn();
  const upstream = jest.fn();
  const handlers = createOrganizationHandlers({
    origin,
    readSession,
    upstream,
  });
  const request = (query = '', headers: Record<string, string> = {}) =>
    new Request(`${origin}/api/organizations${query}`, { headers });
  beforeEach(() => {
    jest.resetAllMocks();
    readSession.mockResolvedValue({ accessToken: 'server-only-token' });
    upstream.mockResolvedValue(
      Response.json({ items: [row], nextCursor: null }),
    );
  });
  it('lists using only the server token and allowed query', async () => {
    const response = await handlers.list(
      request('?limit=1', {
        Authorization: 'Bearer attacker',
        'x-tenant-id': 'attacker',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ items: [row], nextCursor: null });
    expect(upstream).toHaveBeenCalledWith(
      '/v1/organizations?limit=1',
      'server-only-token',
    );
  });
  it('rejects absent sessions before validating selectors', async () => {
    readSession.mockResolvedValue(undefined);
    expect((await handlers.list(request('?limit=bad'))).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects duplicate queries and forged host before upstream access', async () => {
    expect((await handlers.list(request('?limit=1&limit=2'))).status).toBe(400);
    expect(
      (await handlers.list(request('', { host: 'attacker.invalid' }))).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('supports the configured host after Next normalizes request URLs', async () => {
    const response = await handlers.list(
      new Request('http://localhost/api/organizations', {
        headers: { host: 'app.example.invalid' },
      }),
    );
    expect(response.status).toBe(200);
  });
  it('forwards only a validated context selector', async () => {
    upstream.mockResolvedValue(
      Response.json({ organization: { id, name: row.name }, role: row.role }),
    );
    expect((await handlers.context(request(), id)).status).toBe(200);
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations/${id}/context`,
      'server-only-token',
    );
    expect((await handlers.context(request(), 'invalid')).status).toBe(400);
    expect((await handlers.context(request('?role=admin'), id)).status).toBe(
      400,
    );
  });
  it.each([401, 403, 503])(
    'sanitizes upstream rejection %s',
    async (status) => {
      upstream.mockResolvedValue(
        Response.json({ token: 'private-upstream-token' }, { status }),
      );
      const response = await handlers.context(request(), id);
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private');
    },
  );
  it('treats redirects and malformed success as unavailable', async () => {
    upstream.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.invalid' },
      }),
    );
    expect((await handlers.list(request())).status).toBe(503);
    upstream.mockResolvedValue(
      Response.json({ items: [row], nextCursor: null, accessToken: 'private' }),
    );
    expect((await handlers.list(request())).status).toBe(503);
  });
  it('sanitizes transport and session store failure', async () => {
    readSession.mockRejectedValue(new Error('private storage credential'));
    expect((await handlers.list(request())).status).toBe(503);
    readSession.mockResolvedValue({ accessToken: 'server-only-token' });
    upstream.mockRejectedValue(new Error('private transport credential'));
    expect((await handlers.context(request(), id)).status).toBe(503);
  });
  it('rejects a context for a different organization', async () => {
    upstream.mockResolvedValue(
      Response.json({
        organization: {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Other',
        },
        role: 'viewer',
      }),
    );
    expect((await handlers.context(request(), id)).status).toBe(503);
  });
  it('bounds pagination and rejects unknown query fields', async () => {
    expect((await handlers.list(request(`?cursor=${id}`))).status).toBe(200);
    expect(upstream).toHaveBeenCalledWith(
      `/v1/organizations?limit=25&cursor=${id}`,
      'server-only-token',
    );
    expect((await handlers.list(request('?actorId=other'))).status).toBe(400);
  });
});
