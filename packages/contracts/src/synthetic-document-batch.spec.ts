import {
  syntheticDocumentBatchInputSchema,
  syntheticDocumentBatchReceiptSchema,
  syntheticDocumentBatchDetailSchema,
  syntheticDocumentIdempotencyKeySchema,
  syntheticDocumentIdempotencyKeyOpenApiSchema,
  syntheticDocumentBatchInputOpenApiSchema,
  syntheticDocumentBatchReceiptOpenApiSchema,
  syntheticDocumentBatchDetailOpenApiSchema,
} from './index';

describe('Synthetic document batch input', () => {
  const document = {
    reference: 'demo-001',
    declaredTotalCents: 300,
    lineAmountsCents: [100, 200],
  };
  const batch = {
    schemaVersion: 'synthetic-document-batch-v1',
    documents: [document],
  };

  it('preserves valid amounts and accepts a structurally valid divergent total', () => {
    expect(syntheticDocumentBatchInputSchema.parse(batch)).toEqual(batch);
    const divergent = {
      ...batch,
      documents: [{ ...document, declaredTotalCents: 999 }],
    };
    expect(syntheticDocumentBatchInputSchema.parse(divergent)).toEqual(
      divergent,
    );
  });

  it.each([
    { ...document, declaredTotalCents: -1 },
    { ...document, declaredTotalCents: 1.5 },
    { ...document, declaredTotalCents: 1_000_000_001 },
    { ...document, lineAmountsCents: [-1] },
    { ...document, lineAmountsCents: [0.5] },
    { ...document, lineAmountsCents: [] },
    { ...document, lineAmountsCents: Array(11).fill(0) },
    { ...document, reference: '' },
    { ...document, reference: 'forbidden space' },
    { ...document, reference: 'ação' },
    { ...document, reference: 'a'.repeat(41) },
    { ...document, reference: 'demo\n' },
    { ...document, actorId: 'untrusted' },
  ])('rejects an unsafe document %#', (unsafe) => {
    expect(
      syntheticDocumentBatchInputSchema.safeParse({
        ...batch,
        documents: [unsafe],
      }).success,
    ).toBe(false);
  });

  it('rejects empty, oversized or duplicate documents and unknown batch fields', () => {
    for (const unsafe of [
      { ...batch, documents: [] },
      { ...batch, documents: Array(11).fill(document) },
      { ...batch, documents: [document, document] },
      { ...batch, organizationId: 'untrusted' },
    ]) {
      expect(syntheticDocumentBatchInputSchema.safeParse(unsafe).success).toBe(
        false,
      );
    }
  });

  it('accepts inclusive limits without coercion or loss of precision', () => {
    const maximum = {
      ...batch,
      documents: Array.from({ length: 10 }, (_, index) => ({
        reference: `${index}${'a'.repeat(39)}`,
        declaredTotalCents: 1_000_000_000,
        lineAmountsCents: Array(10).fill(1_000_000_000),
      })),
    };
    expect(syntheticDocumentBatchInputSchema.parse(maximum)).toEqual(maximum);
    const zero = {
      ...batch,
      documents: [
        { ...document, declaredTotalCents: 0, lineAmountsCents: [0] },
      ],
    };
    expect(syntheticDocumentBatchInputSchema.parse(zero)).toEqual(zero);
  });

  it.each(['100', null, undefined, true, NaN, Infinity, -Infinity, 2 ** 53])(
    'rejects invalid money %s in both totals and lines',
    (amount) => {
      for (const unsafe of [
        { ...document, declaredTotalCents: amount },
        { ...document, lineAmountsCents: [amount] },
      ]) {
        expect(
          syntheticDocumentBatchInputSchema.safeParse({
            ...batch,
            documents: [unsafe],
          }).success,
        ).toBe(false);
      }
    },
  );

  it.each([
    null,
    [],
    {},
    { ...batch, schemaVersion: 'v2' },
    { ...batch, documents: [null] },
  ])('rejects malformed batch %#', (unsafe) =>
    expect(syntheticDocumentBatchInputSchema.safeParse(unsafe).success).toBe(
      false,
    ),
  );
});

describe('Synthetic document response and idempotency contracts', () => {
  const id = 'ABCDEF01-0000-4000-8000-000000000001';
  const receipt = {
    id,
    schemaVersion: 'synthetic-document-batch-v1',
    createdAt: '2026-10-20T12:00:00.000Z',
  };
  const document = {
    reference: 'demo',
    declaredTotalCents: 10,
    lineAmountsCents: [10],
  };

  it('normalizes resource and idempotency IDs and validates a closed detail', () => {
    expect(syntheticDocumentBatchReceiptSchema.parse(receipt)).toEqual({
      ...receipt,
      id: id.toLowerCase(),
    });
    expect(syntheticDocumentIdempotencyKeySchema.parse(id)).toBe(
      id.toLowerCase(),
    );
    expect(
      syntheticDocumentBatchDetailSchema.parse({
        ...receipt,
        documents: [document],
      }),
    ).toEqual({ ...receipt, id: id.toLowerCase(), documents: [document] });
  });

  it.each([
    { ...receipt, actorId: id },
    { ...receipt, tenantId: id },
    { ...receipt, idempotencyKey: id },
    { ...receipt, documents: [document] },
    { ...receipt, schemaVersion: 'v2' },
    { ...receipt, id: 'invalid' },
    { ...receipt, createdAt: '2026-02-30T12:00:00.000Z' },
    { ...receipt, createdAt: '2026-10-20T12:00:00Z' },
    { ...receipt, createdAt: '2026-10-20T12:00:00.000+00:00' },
    { ...receipt, createdAt: '0000-01-01T00:00:00.000Z' },
    { ...receipt, createdAt: 'not-a-date' },
  ])('rejects an unsafe receipt %#', (unsafe) => {
    expect(syntheticDocumentBatchReceiptSchema.safeParse(unsafe).success).toBe(
      false,
    );
  });

  it('rejects unsafe detail documents and internal top-level fields', () => {
    for (const unsafe of [
      { ...receipt, documents: [] },
      { ...receipt, documents: [document, document] },
      { ...receipt, documents: [{ ...document, payload: 'private' }] },
      { ...receipt, documents: [document], fingerprint: 'private' },
      receipt,
    ]) {
      expect(syntheticDocumentBatchDetailSchema.safeParse(unsafe).success).toBe(
        false,
      );
    }
  });

  it.each([
    '',
    'invalid',
    `${id},${id}`,
    ` ${id}`,
    `${id}\n`,
    [id],
    1,
    null,
    'abcdef01-0000-1000-8000-000000000001',
  ])('rejects invalid or multiple command keys %#', (unsafe) => {
    expect(
      syntheticDocumentIdempotencyKeySchema.safeParse(unsafe).success,
    ).toBe(false);
  });

  it('describes accepted uppercase and lowercase command keys in OpenAPI', () => {
    const pattern = syntheticDocumentIdempotencyKeyOpenApiSchema.pattern;
    expect(typeof pattern).toBe('string');
    const matcher = new RegExp(pattern as string);
    expect(matcher.test(id)).toBe(true);
    expect(matcher.test(id.toLowerCase())).toBe(true);
    expect(matcher.test('invalid')).toBe(false);
  });

  it('publishes closed input and response shapes with bounded integer amounts', () => {
    expect(syntheticDocumentBatchInputOpenApiSchema).toMatchObject({
      additionalProperties: false,
      required: ['schemaVersion', 'documents'],
      properties: {
        documents: {
          minItems: 1,
          maxItems: 10,
          items: {
            additionalProperties: false,
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
            },
          },
        },
      },
    });
    expect(syntheticDocumentBatchReceiptOpenApiSchema).toMatchObject({
      additionalProperties: false,
      required: ['id', 'schemaVersion', 'createdAt'],
    });
    expect(syntheticDocumentBatchDetailOpenApiSchema).toMatchObject({
      additionalProperties: false,
      required: ['id', 'schemaVersion', 'createdAt', 'documents'],
    });
  });
});
