import { randomBytes, timingSafeEqual } from 'node:crypto';
import { authenticatedIdentitySchema } from '@tax/contracts';
export class InvalidLoginError extends Error {}
export interface AuthStore {
  insert(
    kind: 'attempt' | 'session',
    data: Record<string, unknown>,
    expiresAt: Date,
  ): Promise<string>;
  read(
    kind: 'attempt' | 'session',
    id: string,
  ): Promise<Record<string, unknown> | undefined>;
  take(
    kind: 'attempt' | 'session',
    id: string,
  ): Promise<Record<string, unknown> | undefined>;
  revoke(kind: 'attempt' | 'session', id: string): Promise<void>;
}
export interface AuthDependencies {
  origin: string;
  store: AuthStore;
  protocol: {
    start(state: string, nonce: string, verifier: string): Promise<string>;
    exchange(
      url: URL,
      attempt: Record<string, unknown>,
    ): Promise<{ accessToken: string; expiresIn: number; subject: string }>;
  };
  verifyAccess(token: string): Promise<{ issuer: string; subject: string }>;
}
export function createAuthHandlers(dependencies: AuthDependencies) {
  const { origin, store, protocol, verifyAccess } = dependencies;
  const secure = new URL(origin).protocol === 'https:';
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };
  const opaque = () => randomBytes(32).toString('base64url');
  const cookie = (name: string, value: string, ttl: number) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure ? '; Secure' : ''}`;
  const readCookie = (request: Request, name: string) => {
    const matches = (request.headers.get('cookie') ?? '')
      .split(';')
      .map((value) => value.trim())
      .filter((value) => value.startsWith(`${name}=`));
    return matches.length === 1 ? matches[0]!.slice(name.length + 1) : '';
  };
  const equal = (a: string, b: string) => {
    const left = Buffer.from(a),
      right = Buffer.from(b);
    return (
      a.length <= 256 &&
      left.length === right.length &&
      timingSafeEqual(left, right)
    );
  };
  const failure = (status: number) =>
    Response.json(
      {
        message:
          status === 503 ? 'Autenticação indisponível' : 'Requisição rejeitada',
      },
      { status, headers },
    );
  const validOrigin = (request: Request) => {
    const host = request.headers.get('host');
    return host !== null
      ? host === new URL(origin).host
      : new URL(request.url).origin === origin;
  };
  const activeSession = async (request: Request) => {
    const id = readCookie(request, 'tax_session');
    const data = id ? await store.read('session', id) : undefined;
    if (
      !data ||
      typeof data.csrfToken !== 'string' ||
      !authenticatedIdentitySchema.safeParse(data.identity).success
    )
      return undefined;
    return {
      id,
      csrfToken: data.csrfToken,
      identity: authenticatedIdentitySchema.parse(data.identity),
    };
  };
  return {
    async login(request: Request) {
      if (
        !validOrigin(request) ||
        ![null, '/'].includes(new URL(request.url).searchParams.get('returnTo'))
      )
        return failure(400);
      try {
        const state = opaque(),
          nonce = opaque(),
          verifier = opaque();
        const destination = await protocol.start(state, nonce, verifier);
        const previous = readCookie(request, 'tax_login');
        if (previous) await store.revoke('attempt', previous);
        const id = await store.insert(
          'attempt',
          { state, nonce, verifier },
          new Date(Date.now() + 300_000),
        );
        return new Response(null, {
          status: 302,
          headers: {
            ...headers,
            Location: destination,
            'Set-Cookie': cookie('tax_login', id, 300),
          },
        });
      } catch {
        return failure(503);
      }
    },
    async callback(request: Request) {
      const finish = (response: Response) => {
        response.headers.append('Set-Cookie', cookie('tax_login', '', 0));
        return response;
      };
      if (!validOrigin(request)) return finish(failure(400));
      try {
        const id = readCookie(request, 'tax_login');
        const attempt = id ? await store.take('attempt', id) : undefined;
        const url = new URL(request.url);
        if (
          !attempt ||
          typeof attempt.state !== 'string' ||
          typeof attempt.nonce !== 'string' ||
          typeof attempt.verifier !== 'string' ||
          !equal(attempt.state, url.searchParams.get('state') ?? '') ||
          !url.searchParams.get('code') ||
          url.searchParams.has('error')
        )
          return finish(failure(400));
        const exchangeStarted = Date.now();
        const callbackUrl = new URL(`/api/auth/callback${url.search}`, origin);
        const tokens = await protocol.exchange(callbackUrl, attempt);
        const identity = authenticatedIdentitySchema.parse(
          await verifyAccess(tokens.accessToken),
        );
        if (
          identity.subject !== tokens.subject ||
          !Number.isFinite(tokens.expiresIn) ||
          tokens.expiresIn <= 1
        )
          return finish(failure(400));
        const deadline =
          exchangeStarted + (Math.min(tokens.expiresIn, 300) - 1) * 1000;
        const ttl = Math.floor((deadline - Date.now()) / 1000);
        if (ttl < 1) return finish(failure(400));
        const csrfToken = opaque();
        const sessionId = await store.insert(
          'session',
          { accessToken: tokens.accessToken, identity, csrfToken },
          new Date(Date.now() + ttl * 1000),
        );
        const oldSession = readCookie(request, 'tax_session');
        if (oldSession) await store.revoke('session', oldSession);
        return finish(
          new Response(null, {
            status: 303,
            headers: {
              ...headers,
              Location: `${origin}/`,
              'Set-Cookie': cookie('tax_session', sessionId, ttl),
            },
          }),
        );
      } catch (error) {
        return finish(failure(error instanceof InvalidLoginError ? 400 : 503));
      }
    },
    async session(request: Request) {
      if (!validOrigin(request)) return failure(400);
      try {
        const current = await activeSession(request);
        return current
          ? Response.json(
              {
                authenticated: true,
                identity: current.identity,
                csrfToken: current.csrfToken,
              },
              { headers },
            )
          : failure(401);
      } catch {
        return failure(503);
      }
    },
    async logout(request: Request) {
      if (!validOrigin(request) || request.headers.get('origin') !== origin)
        return failure(403);
      try {
        const current = await activeSession(request);
        if (
          !current ||
          !equal(current.csrfToken, request.headers.get('x-csrf-token') ?? '')
        )
          return failure(403);
        await store.revoke('session', current.id);
        return new Response(null, {
          status: 204,
          headers: { ...headers, 'Set-Cookie': cookie('tax_session', '', 0) },
        });
      } catch {
        return failure(503);
      }
    },
  };
}
