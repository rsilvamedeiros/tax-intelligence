import { diagnoseSyntheticBatch } from './diagnose-synthetic-batch';
import {
  syntheticDiagnosticSchema,
  syntheticDiagnosticOpenApiSchema,
} from '@tax/contracts';

const document = {
  reference: 'demo-a',
  declaredTotalCents: 300,
  lineAmountsCents: [100, 200],
};
const batch = {
  schemaVersion: 'synthetic-document-batch-v1',
  documents: [document],
};

it('rejects fractional cents before executing the diagnostic', () => {
  expect(() =>
    diagnoseSyntheticBatch({
      schemaVersion: 'synthetic-document-batch-v1',
      documents: [
        { reference: 'demo-a', declaredTotalCents: 0.5, lineAmountsCents: [0] },
      ],
    }),
  ).toThrow();
});

it('accepts the public batch contract and returns the public diagnostic contract', () => {
  const result = diagnoseSyntheticBatch(batch);
  expect(syntheticDiagnosticSchema.parse(result)).toEqual(result);
  expect(syntheticDiagnosticOpenApiSchema).toMatchObject({
    type: 'object',
    additionalProperties: false,
  });
  expect(result.documents[0]!.outcome).toBe('match');
  expect(
    diagnoseSyntheticBatch({
      documents: [
        {
          lineAmountsCents: [100, 200],
          declaredTotalCents: 300,
          reference: 'demo-a',
        },
      ],
      schemaVersion: batch.schemaVersion,
    }),
  ).toEqual(result);
});

it.each([-1, 0.1, '300', Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_001])(
  'rejects invalid declared cents %s without coercion',
  (declaredTotalCents) => {
    expect(() =>
      diagnoseSyntheticBatch({
        ...batch,
        documents: [{ ...document, declaredTotalCents }],
      }),
    ).toThrow();
  },
);

it.each(
  [
    [],
    Array(11).fill(1),
    [-1],
    [0.1],
    ['100'],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [1_000_000_001],
  ].map((lineAmountsCents) => ({ lineAmountsCents })),
)('rejects invalid line amounts $lineAmountsCents', ({ lineAmountsCents }) => {
  expect(() =>
    diagnoseSyntheticBatch({
      ...batch,
      documents: [{ ...document, lineAmountsCents }],
    }),
  ).toThrow();
});

it.each([
  null,
  {},
  { ...batch, schemaVersion: 'other' },
  { ...batch, tenantId: 'untrusted' },
  { ...batch, documents: [] },
  { ...batch, documents: Array(11).fill(document) },
  { ...batch, documents: [document, document] },
  { ...batch, documents: [{ ...document, reference: 'INVALID' }] },
  { ...batch, documents: [{ ...document, rule: 'untrusted' }] },
])('rejects an invalid batch %# before producing evidence', (input) => {
  expect(() => diagnoseSyntheticBatch(input)).toThrow();
});
