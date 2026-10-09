import 'server-only';
import { createDatabase, SessionStore } from '@tax/database';
import { authenticatedIdentitySchema } from '@tax/contracts';
import { createAuthHandlers } from './handlers';
import { createProtocol } from './protocol';
import { readBffConfig } from './config';
import { createTokenReader } from './session-token';
import { createOrganizationHandlers } from '../organizations/handlers';
import { createMembershipHandlers } from '../organizations/membership-handlers';

type Handlers = ReturnType<typeof createAuthHandlers>;
const runtimeGlobal = globalThis as typeof globalThis & {
  taxBffRuntime?: {
    auth: Handlers;
    organizations: ReturnType<typeof createOrganizationHandlers>;
    memberships: ReturnType<typeof createMembershipHandlers>;
  };
};
function runtime() {
  if (runtimeGlobal.taxBffRuntime) return runtimeGlobal.taxBffRuntime;
  const config = readBffConfig();
  const database = createDatabase(config.databaseUrl);
  const store = new SessionStore(database.pool, config.key);
  const handlers = createAuthHandlers({
    origin: config.origin,
    store,
    protocol: createProtocol(config.issuer, config.clientId, config.origin),
    async verifyAccess(token) {
      const response = await fetch(new URL('/v1/auth/me', config.apiBase), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error('Access token verification failed');
      const identity = authenticatedIdentitySchema.parse(await response.json());
      if (identity.issuer !== config.issuer)
        throw new Error('Identity issuer mismatch');
      return identity;
    },
  });
  const upstream = (
    path: string,
    token: string,
    init?: { method: 'GET' | 'PUT' | 'PATCH' | 'DELETE'; body?: string },
  ) =>
    fetch(new URL(path, config.apiBase), {
      method: init?.method ?? 'GET',
      body: init?.body,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
  const organizations = createOrganizationHandlers({
    origin: config.origin,
    readSession: createTokenReader(store),
    upstream,
  });
  const memberships = createMembershipHandlers({
    origin: config.origin,
    readSession: createTokenReader(store),
    upstream,
  });
  runtimeGlobal.taxBffRuntime = { auth: handlers, organizations, memberships };
  return runtimeGlobal.taxBffRuntime;
}
export async function handleAuth(action: keyof Handlers, request: Request) {
  try {
    return await runtime().auth[action](request);
  } catch {
    return Response.json(
      { message: 'Autenticação indisponível' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      },
    );
  }
}
export async function handleMemberships(
  action: keyof ReturnType<typeof createMembershipHandlers>,
  request: Request,
  organizationId: string,
  actorId?: string,
) {
  try {
    const handlers = runtime().memberships;
    return action === 'list'
      ? await handlers.list(request, organizationId)
      : await handlers[action](request, organizationId, actorId ?? '');
  } catch {
    return Response.json(
      { message: 'Administração de membros indisponível' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      },
    );
  }
}
export async function handleOrganizations(
  request: Request,
  organizationId?: string,
) {
  try {
    const handlers = runtime().organizations;
    return organizationId === undefined
      ? await handlers.list(request)
      : await handlers.context(request, organizationId);
  } catch {
    return Response.json(
      { message: 'Organizações indisponíveis' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      },
    );
  }
}
