import type {
  SyntheticDocumentBatchInput,
  SyntheticDiagnostic,
} from '@tax/contracts';

export function evaluateSyntheticTotals(
  input: SyntheticDocumentBatchInput,
): SyntheticDiagnostic {
  return {
    schemaVersion: 'synthetic-document-diagnostic-v1',
    rule: {
      id: 'DEMO-TOTAL-001',
      version: '1.0.0',
      source: 'project-fixture-specification',
      fiscalValidity: 'none',
    },
    documents: input.documents.map((document) => {
      const computedTotalCents = document.lineAmountsCents.reduce(
        (sum, value) => sum + value,
        0,
      );
      const differenceCents = document.declaredTotalCents - computedTotalCents;
      return {
        reference: document.reference,
        declaredTotalCents: document.declaredTotalCents,
        lineAmountsCents: [...document.lineAmountsCents],
        computedTotalCents,
        differenceCents,
        outcome: differenceCents === 0 ? 'match' : 'mismatch',
      };
    }),
  };
}
