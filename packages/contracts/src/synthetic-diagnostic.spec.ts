import {
  syntheticDiagnosticSchema,
  syntheticDiagnosticOpenApiSchema,
} from './index';

const evidence = {
  reference: 'demo-a',
  declaredTotalCents: 300,
  lineAmountsCents: [100, 200],
  computedTotalCents: 300,
  differenceCents: 0,
  outcome: 'match',
};
const result = {
  schemaVersion: 'synthetic-document-diagnostic-v1',
  rule: {
    id: 'DEMO-TOTAL-001',
    version: '1.0.0',
    source: 'project-fixture-specification',
    fiscalValidity: 'none',
  },
  documents: [evidence],
};

it('rejects an empty diagnostic instead of accepting an unversioned result', () => {
  expect(syntheticDiagnosticSchema.safeParse({}).success).toBe(false);
});

it('accepts explicit synthetic provenance and emits a closed OpenAPI shape', () => {
  expect(syntheticDiagnosticSchema.parse(result)).toEqual(result);
  expect(syntheticDiagnosticOpenApiSchema).toMatchObject({
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'rule', 'documents'],
    properties: {
      rule: {
        additionalProperties: false,
        required: ['id', 'version', 'source', 'fiscalValidity'],
      },
      documents: {
        minItems: 1,
        maxItems: 10,
        items: {
          additionalProperties: false,
          required: [
            'reference',
            'declaredTotalCents',
            'lineAmountsCents',
            'computedTotalCents',
            'differenceCents',
            'outcome',
          ],
          properties: {
            declaredTotalCents: {
              type: 'integer',
              minimum: 0,
              maximum: 1_000_000_000,
            },
            lineAmountsCents: {
              minItems: 1,
              maxItems: 10,
              items: { type: 'integer', minimum: 0, maximum: 1_000_000_000 },
            },
            computedTotalCents: {
              type: 'integer',
              minimum: 0,
              maximum: 10_000_000_000,
            },
            differenceCents: {
              type: 'integer',
              minimum: -10_000_000_000,
              maximum: 1_000_000_000,
            },
            outcome: { enum: ['match', 'mismatch'] },
          },
        },
      },
    },
  });
});
it.each([
  { ...result, schemaVersion: 'other' },
  { ...result, tenantId: 'untrusted' },
  ...['id', 'version', 'source', 'fiscalValidity'].map((field) => ({
    ...result,
    rule: { ...result.rule, [field]: 'other' },
  })),
  { ...result, rule: { ...result.rule, jurisdiction: 'invented' } },
  { ...result, documents: [] },
  { ...result, documents: Array(11).fill(evidence) },
  { ...result, documents: [evidence, evidence] },
])('rejects an unversioned, oversized or misleading diagnostic %#', (value) => {
  expect(syntheticDiagnosticSchema.safeParse(value).success).toBe(false);
});
it.each([
  { computedTotalCents: -1 },
  { computedTotalCents: 10_000_000_001 },
  { computedTotalCents: 0.5 },
  { differenceCents: -10_000_000_001 },
  { differenceCents: 1_000_000_001 },
  { differenceCents: 0.5 },
  { differenceCents: '0' },
  { computedTotalCents: Number.NaN },
  { computedTotalCents: Number.POSITIVE_INFINITY },
  { outcome: 'tax-due' },
  { reference: 'UPPER' },
  { declaredTotalCents: -1 },
  { lineAmountsCents: [] },
  { lineAmountsCents: Array(11).fill(1) },
  { lineAmountsCents: [-1] },
  { private: 'data' },
])('rejects invalid evidence %#', (fields) => {
  expect(
    syntheticDiagnosticSchema.safeParse({
      ...result,
      documents: [{ ...evidence, ...fields }],
    }).success,
  ).toBe(false);
});
it.each([
  {
    ...evidence,
    declaredTotalCents: 0,
    lineAmountsCents: Array(10).fill(1_000_000_000),
    computedTotalCents: 10_000_000_000,
    differenceCents: -10_000_000_000,
    outcome: 'mismatch',
  },
  {
    ...evidence,
    declaredTotalCents: 1_000_000_000,
    lineAmountsCents: [0],
    computedTotalCents: 0,
    differenceCents: 1_000_000_000,
    outcome: 'mismatch',
  },
])('accepts exact maximum totals and signed differences %#', (item) => {
  expect(
    syntheticDiagnosticSchema.safeParse({ ...result, documents: [item] })
      .success,
  ).toBe(true);
});
