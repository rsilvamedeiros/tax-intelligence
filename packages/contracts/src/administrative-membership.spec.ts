import {
  administrativeMembershipPageSchema,
  administrativeMembershipPageOpenApiSchema,
} from './index';
describe('Administrative membership transport', () => {
  const row = {
    actorId: '00000000-0000-4000-8000-000000000001',
    role: 'viewer',
    status: 'active',
  };
  it('accepts active and revoked members and bounded pages', () => {
    const page = {
      items: [row, { ...row, status: 'revoked' }],
      nextCursor: row.actorId,
    };
    expect(administrativeMembershipPageSchema.parse(page)).toEqual(page);
    expect(
      administrativeMembershipPageSchema.parse({ items: [], nextCursor: null }),
    ).toEqual({ items: [], nextCursor: null });
  });
  it.each([
    { ...row, subject: 'private' },
    { ...row, role: 'super_admin' },
    { ...row, status: 'pending' },
    { ...row, actorId: 'invalid' },
  ])('rejects unsafe member %#', (member) => {
    expect(
      administrativeMembershipPageSchema.safeParse({
        items: [member],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
  it('rejects oversized pages and extra top-level fields', () => {
    expect(
      administrativeMembershipPageSchema.safeParse({
        items: Array(101).fill(row),
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      administrativeMembershipPageSchema.safeParse({
        items: [],
        nextCursor: null,
        issuer: 'private',
      }).success,
    ).toBe(false);
  });
  it('publishes strict OpenAPI shapes and closed status values', () => {
    expect(administrativeMembershipPageOpenApiSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['items', 'nextCursor'],
      properties: {
        items: {
          maxItems: 100,
          items: {
            additionalProperties: false,
            required: ['actorId', 'role', 'status'],
            properties: { status: { enum: ['active', 'revoked'] } },
          },
        },
        nextCursor: { nullable: true },
      },
    });
  });
});
