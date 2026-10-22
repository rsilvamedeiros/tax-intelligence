import { z } from 'zod';
import { syntheticDiagnosticSchema } from './synthetic-diagnostic';
import { syntheticDocumentBatchReceiptSchema } from './synthetic-document-batch';

const id = z.string().uuid().toLowerCase();
export const syntheticDiagnosticExecutionInputSchema = z
  .object({ batchId: id })
  .strict();
export const syntheticDiagnosticExecutionInputOpenApiSchema = z.toJSONSchema(
  syntheticDiagnosticExecutionInputSchema,
  { target: 'openapi-3.0' },
);
export const syntheticDiagnosticExecutionCommandSchema = z
  .object({ organizationId: id, batchId: id, requestId: id })
  .strict();
export const syntheticDiagnosticExecutionQuerySchema = z
  .object({ organizationId: id, executionId: id })
  .strict();
export const syntheticDiagnosticExecutionReceiptSchema = z
  .object({
    id,
    batchId: id,
    ruleId: z.literal('DEMO-TOTAL-001'),
    ruleVersion: z.literal('1.0.0'),
    createdAt: syntheticDocumentBatchReceiptSchema.shape.createdAt,
  })
  .strict();
export const syntheticDiagnosticExecutionDetailSchema =
  syntheticDiagnosticExecutionReceiptSchema
    .extend({ diagnostic: syntheticDiagnosticSchema })
    .strict();
export type SyntheticDiagnosticExecutionCommand = z.infer<
  typeof syntheticDiagnosticExecutionCommandSchema
>;
export type SyntheticDiagnosticExecutionQuery = z.infer<
  typeof syntheticDiagnosticExecutionQuerySchema
>;
export type SyntheticDiagnosticExecutionReceipt = z.infer<
  typeof syntheticDiagnosticExecutionReceiptSchema
>;
export type SyntheticDiagnosticExecutionDetail = z.infer<
  typeof syntheticDiagnosticExecutionDetailSchema
>;
export const syntheticDiagnosticExecutionReceiptOpenApiSchema = z.toJSONSchema(
  syntheticDiagnosticExecutionReceiptSchema,
  { target: 'openapi-3.0' },
);
export const syntheticDiagnosticExecutionDetailOpenApiSchema = z.toJSONSchema(
  syntheticDiagnosticExecutionDetailSchema,
  { target: 'openapi-3.0' },
);
