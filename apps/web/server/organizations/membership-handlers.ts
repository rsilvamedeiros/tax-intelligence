import { timingSafeEqual } from 'node:crypto';
import {
  administrativeMembershipPageSchema,
  organizationQuerySchema,
  organizationIdSchema,
  emptyQuerySchema,
  membershipRoleChangeSchema,
} from '@tax/contracts';
export interface MembershipDependencies {
  origin: string;
  readSession(
    request: Request,
  ): Promise<{ accessToken: string; csrfToken: string } | undefined>;
  upstream(
    path: string,
    token: string,
    init: { method: 'GET' | 'PUT' | 'PATCH' | 'DELETE'; body?: string },
  ): Promise<Response>;
}
export function createMembershipHandlers(dependencies: MembershipDependencies) {
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };
  const failure = (status: number, extraHeaders: Record<string, string> = {}) =>
    Response.json(
      {
        message:
          status === 503
            ? 'Administração de membros indisponível'
            : 'Requisição rejeitada',
      },
      { status, headers: { ...headers, ...extraHeaders } },
    );
  const origin = new URL(dependencies.origin);
  async function bodyBytes(request: Request, maxBytes: number) {
    if (!request.body) return new Uint8Array();
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
          void reader.cancel().catch(() => {});
          throw new Error('Request body exceeds limit');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    } finally {
      reader.releaseLock();
    }
  }
  async function jsonBody(request: Request): Promise<unknown> {
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      throw new Error('Invalid JSON body');
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await bodyBytes(request, 1024),
      ),
    );
  }
  async function execute(
    request: Request,
    organizationId: string,
    method: 'GET' | 'PUT' | 'PATCH' | 'DELETE',
    actorId?: string,
  ): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (
      host !== null ? host !== origin.host : url.origin !== dependencies.origin
    )
      return failure(400);
    if (request.method !== method) return failure(405, { Allow: method });
    if (
      method !== 'GET' &&
      request.headers.get('origin') !== dependencies.origin
    )
      return failure(403);
    try {
      const session = await dependencies.readSession(request);
      if (!session) return failure(401);
      if (method !== 'GET') {
        const token = request.headers.get('x-csrf-token') ?? '';
        const pattern = /^[A-Za-z0-9_-]{43}$/;
        if (
          !pattern.test(token) ||
          !pattern.test(session.csrfToken) ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken))
        )
          return failure(403);
      }
      const entries = [...url.searchParams.entries()];
      if (
        new Set(entries.map(([key]) => key)).size !== entries.length ||
        !organizationIdSchema.safeParse(organizationId).success
      )
        return failure(400);
      const query = Object.fromEntries(entries);
      let path = `/v1/organizations/${organizationId}/memberships`;
      let body: string | undefined;
      if (method === 'GET') {
        const parsed = organizationQuerySchema.safeParse(query);
        if (!parsed.success) return failure(400);
        const search = new URLSearchParams({
          limit: String(parsed.data.limit),
        });
        if (parsed.data.cursor) search.set('cursor', parsed.data.cursor);
        path += `?${search}`;
      } else {
        if (
          !organizationIdSchema.safeParse(actorId).success ||
          !emptyQuerySchema.safeParse(query).success
        )
          return failure(400);
        path += `/${actorId}`;
        if (method === 'DELETE') {
          try {
            await bodyBytes(request, 0);
          } catch {
            return failure(400);
          }
        } else {
          try {
            const parsed = membershipRoleChangeSchema.safeParse(
              await jsonBody(request),
            );
            if (!parsed.success) return failure(400);
            body = JSON.stringify(parsed.data);
          } catch {
            return failure(400);
          }
        }
      }
      const response = await dependencies.upstream(path, session.accessToken, {
        method,
        ...(body === undefined ? {} : { body }),
      });
      if (method === 'GET') {
        if ([401, 403].includes(response.status))
          return failure(response.status);
        if (response.status !== 200) return failure(503);
        const parsed = administrativeMembershipPageSchema.safeParse(
          await response.json(),
        );
        return parsed.success
          ? Response.json(parsed.data, { headers })
          : failure(503);
      }
      if (response.status === 204)
        return new Response(null, { status: 204, headers });
      return failure(
        [400, 401, 403, 404, 409].includes(response.status)
          ? response.status
          : 503,
      );
    } catch {
      return failure(503);
    }
  }
  return {
    list(request: Request, organizationId: string) {
      return execute(request, organizationId, 'GET');
    },
    grant(request: Request, organizationId: string, actorId: string) {
      return execute(request, organizationId, 'PUT', actorId);
    },
    changeRole(request: Request, organizationId: string, actorId: string) {
      return execute(request, organizationId, 'PATCH', actorId);
    },
    revoke(request: Request, organizationId: string, actorId: string) {
      return execute(request, organizationId, 'DELETE', actorId);
    },
  };
}
