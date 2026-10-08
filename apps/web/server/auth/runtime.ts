import 'server-only';
import { createDatabase, SessionStore } from '@tax/database';
import { authenticatedIdentitySchema } from '@tax/contracts';
import { createAuthHandlers } from './handlers';
import { createProtocol } from './protocol';
import { readBffConfig } from './config';

type Handlers = ReturnType<typeof createAuthHandlers>;
const runtimeGlobal = globalThis as typeof globalThis & {
  taxBffAuth?: Handlers;
};
function runtime() {
  if (runtimeGlobal.taxBffAuth) return runtimeGlobal.taxBffAuth;
  const config = readBffConfig();
  const database = createDatabase(config.databaseUrl);
  const handlers = createAuthHandlers({
    origin: config.origin,
    store: new SessionStore(database.pool, config.key),
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
  runtimeGlobal.taxBffAuth = handlers;
  return handlers;
}
export async function handleAuth(action: keyof Handlers, request: Request) {
  try {
    return await runtime()[action](request);
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
