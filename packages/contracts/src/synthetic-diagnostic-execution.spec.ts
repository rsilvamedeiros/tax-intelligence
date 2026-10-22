import {
  syntheticDiagnosticExecutionReceiptSchema,
  syntheticDiagnosticExecutionCommandSchema,
  syntheticDiagnosticExecutionQuerySchema,
  syntheticDiagnosticExecutionDetailSchema,
  syntheticDiagnosticExecutionReceiptOpenApiSchema,
  syntheticDiagnosticExecutionDetailOpenApiSchema,
} from './index';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const batchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requestId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const command = { organizationId, batchId, requestId };
const receipt = {
  id,
  batchId,
  ruleId: 'DEMO-TOTAL-001',
  ruleVersion: '1.0.0',
  createdAt: '2026-10-22T12:00:00.000Z',
};
const diagnostic = {
  schemaVersion: 'synthetic-document-diagnostic-v1',
  rule: {
    id: 'DEMO-TOTAL-001',
    version: '1.0.0',
    source: 'project-fixture-specification',
    fiscalValidity: 'none',
  },
  documents: [
    {
      reference: 'demo',
      declaredTotalCents: 0,
      lineAmountsCents: [0],
      computedTotalCents: 0,
      differenceCents: 0,
      outcome: 'match',
    },
  ],
};

it('rejects an empty execution receipt without batch and version provenance', () => {
  expect(syntheticDiagnosticExecutionReceiptSchema.safeParse({}).success).toBe(
    false,
  );
});

it('normalizes command and receipt identifiers while preserving exact UTC provenance', () => {
  expect(
    syntheticDiagnosticExecutionCommandSchema.parse({
      organizationId: organizationId.toUpperCase(),
      batchId: batchId.toUpperCase(),
      requestId: requestId.toUpperCase(),
    }),
  ).toEqual(command);
  expect(
    syntheticDiagnosticExecutionReceiptSchema.parse({
      ...receipt,
      id: id.toUpperCase(),
      batchId: batchId.toUpperCase(),
    }),
  ).toEqual(receipt);
  expect(
    syntheticDiagnosticExecutionQuerySchema.parse({
      organizationId: organizationId.toUpperCase(),
      executionId: id.toUpperCase(),
    }),
  ).toEqual({ organizationId, executionId: id });
});

it.each([
  {},
  { ...command, actorId: id },
  { ...command, identity: {} },
  { ...command, documents: [] },
  { ...command, ruleId: 'DEMO-TOTAL-001' },
  { ...command, ruleVersion: '1.0.0' },
  { ...command, idempotencyKey: id },
  { ...command, organizationId: 'bad' },
  { ...command, batchId: 'bad' },
  { ...command, requestId: 'bad' },
  { ...command, requestId: undefined },
  { ...command, tenantId: id },
])('rejects invalid or over-specified application command %#', (value) => {
  expect(
    syntheticDiagnosticExecutionCommandSchema.safeParse(value).success,
  ).toBe(false);
});

it.each([
  {},
  { organizationId, executionId: 'bad' },
  { organizationId: 'bad', executionId: id },
  { organizationId, executionId: id, batchId },
  { organizationId, executionId: id, actorId: id },
])('rejects invalid or over-specified query %#', (value) => {
  expect(syntheticDiagnosticExecutionQuerySchema.safeParse(value).success).toBe(
    false,
  );
});

it.each([
  { ...receipt, id: 'bad' },
  { ...receipt, batchId: 'bad' },
  { ...receipt, ruleId: 'other' },
  { ...receipt, ruleVersion: '2.0.0' },
  { ...receipt, actorId: id },
  { ...receipt, diagnostic },
  { ...receipt, createdAt: '2026-10-22T12:00:00Z' },
  { ...receipt, createdAt: '2026-10-22T12:00:00.000+00:00' },
  { ...receipt, createdAt: '2026-02-30T12:00:00.000Z' },
  { ...receipt, createdAt: '0000-01-01T00:00:00.000Z' },
  { ...receipt, createdAt: 'not-a-date' },
])('rejects invalid receipt metadata or private fields %#', (value) => {
  expect(
    syntheticDiagnosticExecutionReceiptSchema.safeParse(value).success,
  ).toBe(false);
});

it('accepts closed detail with the existing synthetic evidence contract', () => {
  expect(
    syntheticDiagnosticExecutionDetailSchema.parse({ ...receipt, diagnostic }),
  ).toEqual({ ...receipt, diagnostic });
});
it.each([
  { ...receipt },
  { ...receipt, diagnostic: {} },
  { ...receipt, diagnostic, private: 'data' },
  {
    ...receipt,
    diagnostic: {
      ...diagnostic,
      rule: { ...diagnostic.rule, fiscalValidity: 'real' },
    },
  },
])('rejects incompatible detail %#', (value) => {
  expect(
    syntheticDiagnosticExecutionDetailSchema.safeParse(value).success,
  ).toBe(false);
});

it('exports closed OpenAPI receipts and details with required provenance and bounded evidence', () => {
  expect(syntheticDiagnosticExecutionReceiptOpenApiSchema).toMatchObject({
    type: 'object',
    additionalProperties: false,
    required: ['id', 'batchId', 'ruleId', 'ruleVersion', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      batchId: { type: 'string', format: 'uuid' },
      ruleId: { enum: ['DEMO-TOTAL-001'] },
      ruleVersion: { enum: ['1.0.0'] },
      createdAt: { type: 'string', format: 'date-time' },
    },
  });
  expect(syntheticDiagnosticExecutionDetailOpenApiSchema).toMatchObject({
    additionalProperties: false,
    required: [
      'id',
      'batchId',
      'ruleId',
      'ruleVersion',
      'createdAt',
      'diagnostic',
    ],
    properties: {
      diagnostic: {
        additionalProperties: false,
        required: ['schemaVersion', 'rule', 'documents'],
        properties: { documents: { minItems: 1, maxItems: 10 } },
      },
    },
  });
});
