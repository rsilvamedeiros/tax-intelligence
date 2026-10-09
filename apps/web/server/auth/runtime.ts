import 'server-only';
import { createDatabase, SessionStore } from '@tax/database';
import { authenticatedIdentitySchema } from '@tax/contracts';
import { createAuthHandlers } from './handlers';
import { createProtocol } from './protocol';
import { readBffConfig } from './config';
import { createTokenReader } from './session-token';
import { createOrganizationHandlers } from '../organizations/handlers';

type Handlers = ReturnType<typeof createAuthHandlers>;
const runtimeGlobal = globalThis as typeof globalThis & {
  taxBffRuntime?: {
    auth: Handlers;
    organizations: ReturnType<typeof createOrganizationHandlers>;
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
  const organizations = createOrganizationHandlers({
    origin: config.origin,
    readSession: createTokenReader(store),
    upstream(path, token) {
      return fetch(new URL(path, config.apiBase), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
      });
    },
  });
  runtimeGlobal.taxBffRuntime = { auth: handlers, organizations };
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
