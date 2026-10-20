import { z } from 'zod';

const centsSchema = z.number().int().min(0).max(1_000_000_000);
const documentsSchema = z
  .array(
    z
      .object({
        reference: z.string().regex(/^[a-z0-9-]{1,40}$/),
        declaredTotalCents: centsSchema,
        lineAmountsCents: z.array(centsSchema).min(1).max(10),
      })
      .strict(),
  )
  .min(1)
  .max(10)
  .refine(
    (documents) =>
      new Set(documents.map((document) => document.reference)).size ===
      documents.length,
    'Document references must be unique within a batch',
  )
  .describe(
    'Document references must be unique within the batch; array order is significant.',
  );

export const syntheticDocumentBatchInputSchema = z
  .object({
    schemaVersion: z.literal('synthetic-document-batch-v1'),
    documents: documentsSchema,
  })
  .strict();

const createdAtSchema = z.iso
  .datetime({ precision: 3 })
  .refine(
    (value) =>
      !value.startsWith('0000') &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'Canonical UTC timestamp required',
  );
export const syntheticDocumentBatchReceiptSchema = z
  .object({
    id: z.string().uuid().toLowerCase(),
    schemaVersion: z.literal('synthetic-document-batch-v1'),
    createdAt: createdAtSchema,
  })
  .strict();
export const syntheticDocumentBatchDetailSchema =
  syntheticDocumentBatchReceiptSchema
    .extend({ documents: documentsSchema })
    .strict();
export const syntheticDocumentIdempotencyKeySchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  )
  .toLowerCase();

export type SyntheticDocumentBatchInput = z.infer<
  typeof syntheticDocumentBatchInputSchema
>;
export type SyntheticDocumentBatchReceipt = z.infer<
  typeof syntheticDocumentBatchReceiptSchema
>;
export type SyntheticDocumentBatchDetail = z.infer<
  typeof syntheticDocumentBatchDetailSchema
>;

export const syntheticDocumentBatchInputOpenApiSchema = z.toJSONSchema(
  syntheticDocumentBatchInputSchema,
  { target: 'openapi-3.0' },
);
export const syntheticDocumentBatchReceiptOpenApiSchema = z.toJSONSchema(
  syntheticDocumentBatchReceiptSchema,
  { target: 'openapi-3.0' },
);
export const syntheticDocumentBatchDetailOpenApiSchema = z.toJSONSchema(
  syntheticDocumentBatchDetailSchema,
  { target: 'openapi-3.0' },
);
export const syntheticDocumentIdempotencyKeyOpenApiSchema = z.toJSONSchema(
  syntheticDocumentIdempotencyKeySchema,
  { target: 'openapi-3.0' },
);
