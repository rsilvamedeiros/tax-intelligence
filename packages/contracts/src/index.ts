import { z } from 'zod';
export const organizationRoleSchema = z.enum([
  'organization_admin',
  'analyst',
  'reviewer',
  'viewer',
]);
export const membershipRoleChangeSchema = z
  .object({ role: organizationRoleSchema })
  .strict();
export const membershipRoleChangeOpenApiSchema = z.toJSONSchema(
  membershipRoleChangeSchema,
  { target: 'openapi-3.0' },
);
const organizationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(160).regex(/\S/),
  })
  .strict();
export const organizationQuerySchema = z
  .object({
    limit: z
      .string()
      .regex(/^[1-9]\d{0,2}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional()
      .default(25),
    cursor: z.string().uuid().optional(),
  })
  .strict();
export const organizationContextSchema = z
  .object({ organization: organizationSchema, role: organizationRoleSchema })
  .strict();
export const organizationPageSchema = z
  .object({
    items: z
      .array(
        organizationSchema.extend({ role: organizationRoleSchema }).strict(),
      )
      .max(100),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
export const organizationIdSchema = z.string().uuid();
export const emptyQuerySchema = z.object({}).strict();
export const organizationPageOpenApiSchema = z.toJSONSchema(
  organizationPageSchema,
  { target: 'openapi-3.0' },
);
export const organizationContextOpenApiSchema = z.toJSONSchema(
  organizationContextSchema,
  { target: 'openapi-3.0' },
);
export const healthResponseSchema = z
  .object({
    status: z.enum(['ok', 'error']),
    service: z.literal('tax-intelligence-api'),
    checks: z
      .object({ database: z.enum(['up', 'down', 'not_configured']) })
      .optional(),
  })
  .strict();
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export const apiErrorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    code: z.string(),
    message: z.string(),
    requestId: z.string().uuid(),
  })
  .strict();
export type ApiError = z.infer<typeof apiErrorSchema>;
export const apiErrorOpenApiSchema = z.toJSONSchema(apiErrorSchema, {
  target: 'openapi-3.0',
});
export const authenticatedIdentitySchema = z
  .object({
    issuer: z.string().url().max(2048),
    subject: z.string().min(1).max(255),
  })
  .strict();
export type AuthenticatedIdentity = z.infer<typeof authenticatedIdentitySchema>;
export const browserSessionSchema = z
  .object({
    authenticated: z.literal(true),
    identity: authenticatedIdentitySchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
