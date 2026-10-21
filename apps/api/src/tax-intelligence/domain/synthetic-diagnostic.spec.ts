import { evaluateSyntheticTotals } from './synthetic-diagnostic';
import type { SyntheticDocumentBatchInput } from '@tax/contracts';

it('reports exact matching totals with reproducible non-fiscal evidence', () => {
  expect(
    evaluateSyntheticTotals({
      schemaVersion: 'synthetic-document-batch-v1',
      documents: [
        {
          reference: 'demo-a',
          declaredTotalCents: 300,
          lineAmountsCents: [100, 200],
        },
      ],
    }),
  ).toEqual({
    schemaVersion: 'synthetic-document-diagnostic-v1',
    rule: {
      id: 'DEMO-TOTAL-001',
      version: '1.0.0',
      source: 'project-fixture-specification',
      fiscalValidity: 'none',
    },
    documents: [
      {
        reference: 'demo-a',
        declaredTotalCents: 300,
        lineAmountsCents: [100, 200],
        computedTotalCents: 300,
        differenceCents: 0,
        outcome: 'match',
      },
    ],
  });
});

it.each([
  [0, [0], 0, 0, 'match'],
  [301, [100, 200], 300, 1, 'mismatch'],
  [299, [100, 200], 300, -1, 'mismatch'],
  [1_000_000_000, [0], 0, 1_000_000_000, 'mismatch'],
  [
    0,
    Array(10).fill(1_000_000_000),
    10_000_000_000,
    -10_000_000_000,
    'mismatch',
  ],
] as const)(
  'compares %s cents against %j without overflow or rounding',
  (declaredTotalCents, lines, computed, difference, outcome) => {
    const result = evaluateSyntheticTotals({
      schemaVersion: 'synthetic-document-batch-v1',
      documents: [
        {
          reference: 'bounds',
          declaredTotalCents,
          lineAmountsCents: [...lines],
        },
      ],
    });
    expect(result.documents[0]).toMatchObject({
      computedTotalCents: computed,
      differenceCents: difference,
      outcome,
    });
    expect(Number.isSafeInteger(result.documents[0]!.computedTotalCents)).toBe(
      true,
    );
  },
);

it('preserves document and line order and returns evidence for every document', () => {
  const input: SyntheticDocumentBatchInput = {
    schemaVersion: 'synthetic-document-batch-v1',
    documents: Array.from({ length: 10 }, (_, index) => ({
      reference: `doc-${9 - index}`,
      declaredTotalCents: index,
      lineAmountsCents: [index, 0],
    })),
  };
  const result = evaluateSyntheticTotals(input);
  expect(result.documents.map((item) => item.reference)).toEqual(
    input.documents.map((item) => item.reference),
  );
  expect(result.documents.map((item) => item.lineAmountsCents)).toEqual(
    input.documents.map((item) => item.lineAmountsCents),
  );
  expect(result.documents.every((item) => item.outcome === 'match')).toBe(true);
});

it('is deterministic for frozen input and isolates returned evidence from other executions', () => {
  const input: SyntheticDocumentBatchInput = {
    schemaVersion: 'synthetic-document-batch-v1',
    documents: [
      { reference: 'frozen', declaredTotalCents: 3, lineAmountsCents: [2, 1] },
    ],
  };
  Object.freeze(input.documents[0]!.lineAmountsCents);
  Object.freeze(input.documents[0]);
  Object.freeze(input.documents);
  Object.freeze(input);
  const first = evaluateSyntheticTotals(input);
  const second = evaluateSyntheticTotals(input);
  expect(first).toEqual(second);
  first.documents[0]!.lineAmountsCents[0] = 999;
  expect(input.documents[0]!.lineAmountsCents).toEqual([2, 1]);
  expect(second.documents[0]!.lineAmountsCents).toEqual([2, 1]);
  expect(evaluateSyntheticTotals(input)).toEqual(second);
});
