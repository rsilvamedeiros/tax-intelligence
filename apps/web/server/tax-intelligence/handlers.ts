import { timingSafeEqual } from 'node:crypto';
import {
  organizationIdSchema,
  emptyQuerySchema,
  syntheticDiagnosticExecutionInputSchema,
  syntheticDiagnosticExecutionReceiptSchema,
  syntheticDiagnosticExecutionDetailSchema,
} from '@tax/contracts';

export interface SyntheticDiagnosticDependencies {
  origin: string;
  readSession(
    request: Request,
  ): Promise<{ accessToken: string; csrfToken: string } | undefined>;
  upstream(
    path: string,
    token: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ): Promise<Response>;
}

class BodyLimitExceeded extends Error {}
async function json(
  message: Request | Response,
  limit: number,
): Promise<unknown> {
  const reader = message.body?.getReader();
  if (!reader) throw new Error('Missing JSON body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        throw new BodyLimitExceeded();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    reader.releaseLock();
  }
}

export function createSyntheticDiagnosticHandlers(
  dependencies: SyntheticDiagnosticDependencies,
) {
  const origin = new URL(dependencies.origin);
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };
  const failure = (status: number, extra: Record<string, string> = {}) =>
    Response.json(
      {
        message:
          status === 503
            ? 'Diagnóstico sintético indisponível'
            : 'Requisição rejeitada',
      },
      { status, headers: { ...headers, ...extra } },
    );
  async function execute(
    request: Request,
    organizationId: string,
    method: 'GET' | 'POST',
    executionId?: string,
  ): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (
      host !== null ? host !== origin.host : url.origin !== dependencies.origin
    )
      return failure(400);
    if (request.method !== method) return failure(405, { Allow: method });
    if (
      method === 'POST' &&
      request.headers.get('origin') !== dependencies.origin
    )
      return failure(403);
    try {
      const session = await dependencies.readSession(request);
      if (!session) return failure(401);
      if (method === 'POST') {
        const csrf = request.headers.get('x-csrf-token') ?? '';
        const pattern = /^[A-Za-z0-9_-]{43}$/;
        if (
          !pattern.test(csrf) ||
          !pattern.test(session.csrfToken) ||
          !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrfToken))
        )
          return failure(403);
      }
      if (
        !organizationIdSchema.safeParse(organizationId).success ||
        !emptyQuerySchema.safeParse(Object.fromEntries(url.searchParams))
          .success
      )
        return failure(400);
      const init: Parameters<SyntheticDiagnosticDependencies['upstream']>[2] = {
        method,
      };
      let path = `/v1/organizations/${organizationId}/synthetic-diagnostic-executions`;
      if (method === 'POST') {
        if (request.headers.has('idempotency-key')) return failure(400);
        const contentType = request.headers.get('content-type') ?? '';
        if (
          !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(
            contentType,
          ) ||
          !['identity', null].includes(request.headers.get('content-encoding'))
        )
          return failure(415);
        try {
          const parsed = syntheticDiagnosticExecutionInputSchema.safeParse(
            await json(request, 1024),
          );
          if (!parsed.success) return failure(400);
          init.body = JSON.stringify(parsed.data);
        } catch (error) {
          return failure(error instanceof BodyLimitExceeded ? 413 : 400);
        }
      } else {
        if (
          !organizationIdSchema.safeParse(executionId).success ||
          request.body !== null ||
          request.headers.has('transfer-encoding') ||
          (request.headers.has('content-length') &&
            request.headers.get('content-length') !== '0')
        )
          return failure(400);
        path += `/${executionId}`;
      }
      const response = await dependencies.upstream(
        path,
        session.accessToken,
        init,
      );
      if (
        response.status === 200 ||
        (method === 'POST' && response.status === 201)
      ) {
        if (
          response.headers
            .get('content-type')
            ?.split(';')[0]
            ?.trim()
            .toLowerCase() !== 'application/json'
        ) {
          void response.body?.cancel().catch(() => {});
          throw new Error('Invalid upstream media');
        }
        const receipt = (
          method === 'POST'
            ? syntheticDiagnosticExecutionReceiptSchema
            : syntheticDiagnosticExecutionDetailSchema
        ).parse(await json(response, 32 * 1024));
        return Response.json(receipt, { status: response.status, headers });
      }
      void response.body?.cancel().catch(() => {});
      return failure(
        [400, 401, 403, 404, 413, 415].includes(response.status)
          ? response.status
          : 503,
      );
    } catch {
      return failure(503);
    }
  }
  return {
    create(request: Request, organizationId: string) {
      return execute(request, organizationId, 'POST');
    },
    get(request: Request, organizationId: string, executionId: string) {
      return execute(request, organizationId, 'GET', executionId);
    },
  };
}
