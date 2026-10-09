import {
  organizationQuerySchema,
  organizationPageSchema,
  organizationContextSchema,
  organizationIdSchema,
  emptyQuerySchema,
} from '@tax/contracts';
export interface OrganizationDependencies {
  origin: string;
  readSession(request: Request): Promise<{ accessToken: string } | undefined>;
  upstream(path: string, token: string): Promise<Response>;
}
export function createOrganizationHandlers(
  dependencies: OrganizationDependencies,
) {
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };
  const failure = (status: number) =>
    Response.json(
      {
        message:
          status === 503
            ? 'Organizações indisponíveis'
            : 'Requisição rejeitada',
      },
      { status, headers },
    );
  async function execute(request: Request, organizationId?: string) {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (
      host !== null
        ? host !== new URL(dependencies.origin).host
        : url.origin !== dependencies.origin
    )
      return failure(400);
    try {
      const session = await dependencies.readSession(request);
      if (!session) return failure(401);
      const entries = [...url.searchParams.entries()];
      if (new Set(entries.map(([key]) => key)).size !== entries.length)
        return failure(400);
      const query = Object.fromEntries(entries);
      let path: string;
      if (organizationId !== undefined) {
        if (
          !organizationIdSchema.safeParse(organizationId).success ||
          !emptyQuerySchema.safeParse(query).success
        )
          return failure(400);
        path = `/v1/organizations/${organizationId}/context`;
      } else {
        const parsed = organizationQuerySchema.safeParse(query);
        if (!parsed.success) return failure(400);
        const search = new URLSearchParams({
          limit: String(parsed.data.limit),
        });
        if (parsed.data.cursor) search.set('cursor', parsed.data.cursor);
        path = `/v1/organizations?${search}`;
      }
      const response = await dependencies.upstream(path, session.accessToken);
      if ([401, 403].includes(response.status)) return failure(response.status);
      if (response.status !== 200) return failure(503);
      const body: unknown = await response.json();
      const parsed = (
        organizationId === undefined
          ? organizationPageSchema
          : organizationContextSchema
      ).safeParse(body);
      if (
        parsed.success &&
        organizationId !== undefined &&
        'organization' in parsed.data &&
        parsed.data.organization.id.toLowerCase() !==
          organizationId.toLowerCase()
      )
        return failure(503);
      return parsed.success
        ? Response.json(parsed.data, { headers })
        : failure(503);
    } catch {
      return failure(503);
    }
  }
  return {
    list(request: Request) {
      return execute(request);
    },
    context(request: Request, organizationId: string) {
      return execute(request, organizationId);
    },
  };
}
