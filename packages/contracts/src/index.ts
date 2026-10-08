import { z } from 'zod';
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
export const authenticatedIdentitySchema = z
  .object({
    issuer: z.string().url().max(2048),
    subject: z.string().min(1).max(255),
  })
  .strict();
export type AuthenticatedIdentity = z.infer<typeof authenticatedIdentitySchema>;
