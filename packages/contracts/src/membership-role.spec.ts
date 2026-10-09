import {
  membershipRoleChangeSchema,
  membershipRoleChangeOpenApiSchema,
} from './index';
describe('Strict membership role change contract', () => {
  it.each(['organization_admin', 'analyst', 'reviewer', 'viewer'])(
    'accepts %s',
    (role) => {
      expect(membershipRoleChangeSchema.parse({ role })).toEqual({ role });
    },
  );
  it.each([
    { role: 'super_admin' },
    { role: 'viewer', actorId: 'forged' },
    {},
    null,
    { role: ['viewer'] },
  ])('rejects invalid input %#', (body) => {
    expect(membershipRoleChangeSchema.safeParse(body).success).toBe(false);
  });
  it('publishes the same closed role vocabulary in OpenAPI', () => {
    expect(membershipRoleChangeOpenApiSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['role'],
      properties: {
        role: { enum: ['organization_admin', 'analyst', 'reviewer', 'viewer'] },
      },
    });
  });
});
