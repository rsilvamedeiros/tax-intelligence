import { createAuthHandlers, type AuthStore } from './handlers';
describe('BFF login and session boundary', () => {
  const entries = new Map<
    string,
    { kind: string; data: Record<string, unknown>; expiresAt: Date }
  >();
  const store: AuthStore = {
    async insert(kind, data, expiresAt) {
      const id = `opaque-${entries.size}`;
      entries.set(id, { kind, data, expiresAt });
      return id;
    },
    async read(kind, id) {
      const value = entries.get(id);
      return value?.kind === kind && value.expiresAt.getTime() > Date.now()
        ? value.data
        : undefined;
    },
    async take(kind, id) {
      const value = await this.read(kind, id);
      entries.delete(id);
      return value;
    },
    async revoke(_kind, id) {
      entries.delete(id);
    },
  };
  const protocol = {
    start: jest.fn(
      async (state: string, nonce: string, verifier: string) =>
        `https://identity.example.test/auth?state=${state}&nonce=${nonce}&challenge=${verifier}`,
    ),
    exchange: jest.fn(async (_url: URL, _attempt: Record<string, unknown>) => ({
      accessToken: 'sensitive-access-token',
      expiresIn: 300,
      subject: 'synthetic-subject',
    })),
  };
  const verifyAccess = jest.fn(async () => ({
    issuer: 'https://identity.example.test',
    subject: 'synthetic-subject',
  }));
  const handlers = createAuthHandlers({
    origin: 'https://app.example.test',
    store,
    protocol,
    verifyAccess,
  });
  const req = (
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
  ) => new Request(`https://app.example.test${path}`, { headers, method });
  beforeEach(() => {
    entries.clear();
    jest.clearAllMocks();
  });
  async function login() {
    const response = await handlers.login(req('/api/auth/login'));
    expect(response.status).toBe(302);
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    const state = new URL(response.headers.get('location')!).searchParams.get(
      'state',
    )!;
    return { cookie, state, response };
  }
  async function session() {
    const attempt = await login();
    const response = await handlers.callback(
      req(`/api/auth/callback?code=synthetic&state=${attempt.state}`, {
        cookie: attempt.cookie,
      }),
    );
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    return { cookie, response };
  }
  it('starts login with a secure opaque attempt cookie and server-side state', async () => {
    const { response } = await login();
    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/);
    expect(response.headers.get('set-cookie')).toMatch(/Secure/);
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(entries.size).toBe(1);
  });
  it('rejects external return destinations before starting login', async () => {
    expect(
      (
        await handlers.login(
          req('/api/auth/login?returnTo=https://untrusted.invalid'),
        )
      ).status,
    ).toBe(400);
    expect(entries.size).toBe(0);
  });
  it('uses the configured callback origin when Next normalizes the request URL', async () => {
    const start = await handlers.login(
      new Request('http://localhost:3000/api/auth/login', {
        headers: { host: 'app.example.test' },
      }),
    );
    expect(start.status).toBe(302);
    const cookie = start.headers.get('set-cookie')!.split(';')[0]!;
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    )!;
    const response = await handlers.callback(
      new Request(
        `http://localhost:3000/api/auth/callback?code=synthetic&state=${state}`,
        { headers: { host: 'app.example.test', cookie } },
      ),
    );
    expect(response.status).toBe(303);
    expect(protocol.exchange.mock.calls[0]?.[0].origin).toBe(
      'https://app.example.test',
    );
  });
  it('rejects an untrusted Host even when the internal URL matches', async () => {
    expect(
      (
        await handlers.login(
          req('/api/auth/login', { host: 'untrusted.invalid' }),
        )
      ).status,
    ).toBe(400);
  });
  it('rejects callbacks without an attempt cookie', async () => {
    expect(
      (await handlers.callback(req('/api/auth/callback?code=x&state=y')))
        .status,
    ).toBe(400);
  });
  it('consumes the attempt on a wrong state without exchanging a code', async () => {
    const attempt = await login();
    expect(
      (
        await handlers.callback(
          req('/api/auth/callback?code=x&state=wrong', {
            cookie: attempt.cookie,
          }),
        )
      ).status,
    ).toBe(400);
    expect(protocol.exchange).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
  });
  it('rejects a callback replay', async () => {
    const attempt = await login();
    const call = req(`/api/auth/callback?code=x&state=${attempt.state}`, {
      cookie: attempt.cookie,
    });
    expect((await handlers.callback(call)).status).toBe(303);
    expect((await handlers.callback(call)).status).toBe(400);
    expect(protocol.exchange).toHaveBeenCalledTimes(1);
  });
  it('returns only identity and csrf token to the browser', async () => {
    const { cookie, response } = await session();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://app.example.test/');
    const current = await handlers.session(
      req('/api/auth/session', { cookie }),
    );
    expect(current.status).toBe(200);
    const json = await current.json();
    expect(json.identity.subject).toBe('synthetic-subject');
    expect(json.csrfToken).toEqual(expect.any(String));
    expect(JSON.stringify(json)).not.toContain('sensitive-access-token');
    expect(response.headers.get('set-cookie')).not.toContain(
      'sensitive-access-token',
    );
  });
  it('rejects a missing or expired session', async () => {
    expect((await handlers.session(req('/api/auth/session'))).status).toBe(401);
    const { cookie } = await session();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 301_000);
    try {
      expect(
        (await handlers.session(req('/api/auth/session', { cookie }))).status,
      ).toBe(401);
    } finally {
      clock.mockRestore();
    }
  });
  it('subtracts verification latency from session lifetime', async () => {
    const started = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(started);
    verifyAccess.mockImplementationOnce(async () => {
      clock.mockReturnValue(started + 5000);
      return {
        issuer: 'https://identity.example.test',
        subject: 'synthetic-subject',
      };
    });
    try {
      const { response } = await session();
      expect(response.status).toBe(303);
      expect(
        [...entries.values()]
          .find((entry) => entry.kind === 'session')
          ?.expiresAt.getTime(),
      ).toBeLessThan(started + 300_000);
    } finally {
      clock.mockRestore();
    }
  });
  it.each<Record<string, string>>([
    {},
    { origin: 'https://untrusted.invalid', 'x-csrf-token': 'x' },
    { origin: 'https://app.example.test', 'x-csrf-token': 'wrong' },
    { origin: 'https://app.example.test', 'x-csrf-token': 'é'.repeat(43) },
  ])('rejects logout without valid Origin/CSRF: %j', async (extra) => {
    const { cookie } = await session();
    expect(
      (
        await handlers.logout(
          req('/api/auth/logout', { cookie, ...extra }, 'POST'),
        )
      ).status,
    ).toBe(403);
    expect(
      (await handlers.session(req('/api/auth/session', { cookie }))).status,
    ).toBe(200);
  });
  it('revokes the session and clears its cookie on logout', async () => {
    const { cookie } = await session();
    const { csrfToken } = await (
      await handlers.session(req('/api/auth/session', { cookie }))
    ).json();
    const response = await handlers.logout(
      req(
        '/api/auth/logout',
        {
          cookie,
          origin: 'https://app.example.test',
          'x-csrf-token': csrfToken,
        },
        'POST',
      ),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(
      (await handlers.session(req('/api/auth/session', { cookie }))).status,
    ).toBe(401);
  });
  it('does not create a session when the API rejects the access token', async () => {
    const attempt = await login();
    verifyAccess.mockRejectedValueOnce(new Error('sensitive-provider-error'));
    const response = await handlers.callback(
      req(`/api/auth/callback?code=x&state=${attempt.state}`, {
        cookie: attempt.cookie,
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive-provider-error');
    expect(entries.size).toBe(0);
  });
});
