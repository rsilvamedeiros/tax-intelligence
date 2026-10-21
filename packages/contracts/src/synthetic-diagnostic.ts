import { z } from 'zod';

const cents = z.number().int().min(0).max(1_000_000_000);
export const syntheticDiagnosticSchema = z
  .object({
    schemaVersion: z.literal('synthetic-document-diagnostic-v1'),
    rule: z
      .object({
        id: z.literal('DEMO-TOTAL-001'),
        version: z.literal('1.0.0'),
        source: z.literal('project-fixture-specification'),
        fiscalValidity: z.literal('none'),
      })
      .strict(),
    documents: z
      .array(
        z
          .object({
            reference: z.string().regex(/^[a-z0-9-]{1,40}$/),
            declaredTotalCents: cents,
            lineAmountsCents: z.array(cents).min(1).max(10),
            computedTotalCents: z.number().int().min(0).max(10_000_000_000),
            differenceCents: z
              .number()
              .int()
              .min(-10_000_000_000)
              .max(1_000_000_000),
            outcome: z.enum(['match', 'mismatch']),
          })
          .strict(),
      )
      .min(1)
      .max(10)
      .refine(
        (documents) =>
          new Set(documents.map((document) => document.reference)).size ===
          documents.length,
        'Document references must be unique within a diagnostic',
      ),
  })
  .strict();

export type SyntheticDiagnostic = z.infer<typeof syntheticDiagnosticSchema>;
export const syntheticDiagnosticOpenApiSchema = z.toJSONSchema(
  syntheticDiagnosticSchema,
  { target: 'openapi-3.0' },
);
