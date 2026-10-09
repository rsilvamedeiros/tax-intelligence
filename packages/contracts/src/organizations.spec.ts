import {
  organizationContextSchema,
  organizationPageSchema,
  organizationQuerySchema,
  organizationIdSchema,
  emptyQuerySchema,
  organizationPageOpenApiSchema,
  organizationContextOpenApiSchema,
  apiErrorOpenApiSchema,
} from './index';
describe('Organization transport', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('defaults and bounds pagination', () => {
    expect(organizationQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(organizationQuerySchema.parse({ limit: '100', cursor: id })).toEqual(
      { limit: 100, cursor: id },
    );
    for (const limit of ['0', '101', '-1', '1.5', '1e2', ' 1', ['1', '2']])
      expect(organizationQuerySchema.safeParse({ limit }).success).toBe(false);
  });
  it('rejects unexpected selectors and malformed cursors', () => {
    expect(organizationQuerySchema.safeParse({ actorId: id }).success).toBe(
      false,
    );
    expect(
      organizationQuerySchema.safeParse({ cursor: 'invalid' }).success,
    ).toBe(false);
  });
  it('rejects context selectors and invalid identifiers', () => {
    expect(organizationIdSchema.parse(id)).toBe(id);
    expect(organizationIdSchema.safeParse('other').success).toBe(false);
    expect(emptyQuerySchema.parse({})).toEqual({});
    expect(
      emptyQuerySchema.safeParse({ role: 'organization_admin' }).success,
    ).toBe(false);
  });
  it('preserves strict response shapes and nullability in OpenAPI 3', () => {
    expect(organizationPageOpenApiSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['items', 'nextCursor'],
      properties: { items: { maxItems: 100 }, nextCursor: { nullable: true } },
    });
    expect(organizationContextOpenApiSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['organization', 'role'],
      properties: {
        organization: { properties: { name: { pattern: '\\S' } } },
      },
    });
    expect(apiErrorOpenApiSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['statusCode', 'code', 'message', 'requestId'],
    });
  });
  it('validates active context and prevents identity leakage', () => {
    const context = { organization: { id, name: 'Synthetic' }, role: 'viewer' };
    expect(organizationContextSchema.parse(context)).toEqual(context);
    expect(
      organizationContextSchema.safeParse({
        ...context,
        organization: { id, name: ' \t\n' },
      }).success,
    ).toBe(false);
    expect(
      organizationContextSchema.safeParse({ ...context, actorId: id }).success,
    ).toBe(false);
    expect(
      organizationContextSchema.safeParse({ ...context, role: 'super_admin' })
        .success,
    ).toBe(false);
  });
  it('validates bounded strict pages', () => {
    const row = { id, name: 'Synthetic', role: 'analyst' };
    expect(
      organizationPageSchema.parse({ items: [row], nextCursor: null }).items,
    ).toEqual([row]);
    expect(
      organizationPageSchema.safeParse({
        items: Array(101).fill(row),
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      organizationPageSchema.safeParse({
        items: [{ ...row, token: 'synthetic' }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});
