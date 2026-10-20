import type { SyntheticDocumentBatchInput } from '@tax/contracts';

export function canonicalizeSyntheticDocumentBatch(
  input: SyntheticDocumentBatchInput,
): string {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    documents: input.documents.map((document) => ({
      reference: document.reference,
      declaredTotalCents: document.declaredTotalCents,
      lineAmountsCents: document.lineAmountsCents,
    })),
  });
}
