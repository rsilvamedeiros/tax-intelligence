import { type SyntheticDocumentBatchInput } from '@tax/contracts';
import { canonicalizeSyntheticDocumentBatch } from './synthetic-document-batch';

describe('Synthetic document command identity', () => {
  const input: SyntheticDocumentBatchInput = {
    schemaVersion: 'synthetic-document-batch-v1',
    documents: [
      {
        reference: 'demo-a',
        declaredTotalCents: 99,
        lineAmountsCents: [10, 20],
      },
      { reference: 'demo-b', declaredTotalCents: 0, lineAmountsCents: [0] },
    ],
  };

  it('preserves the complete validated command without diagnosing totals', () => {
    expect(JSON.parse(canonicalizeSyntheticDocumentBatch(input))).toEqual(
      input,
    );
  });

  it('equates property-order differences while preserving document and line order', () => {
    const reordered: SyntheticDocumentBatchInput = {
      documents: input.documents.map((document) => ({
        lineAmountsCents: document.lineAmountsCents,
        declaredTotalCents: document.declaredTotalCents,
        reference: document.reference,
      })),
      schemaVersion: input.schemaVersion,
    };
    const command = canonicalizeSyntheticDocumentBatch(input);
    expect(canonicalizeSyntheticDocumentBatch(reordered)).toBe(command);
    expect(
      canonicalizeSyntheticDocumentBatch({
        ...input,
        documents: [...input.documents].reverse(),
      }),
    ).not.toBe(command);
    expect(
      canonicalizeSyntheticDocumentBatch({
        ...input,
        documents: [
          { ...input.documents[0]!, lineAmountsCents: [20, 10] },
          input.documents[1]!,
        ],
      }),
    ).not.toBe(command);
  });

  it.each([
    { reference: 'demo-c', declaredTotalCents: 99, lineAmountsCents: [10, 20] },
    {
      reference: 'demo-a',
      declaredTotalCents: 100,
      lineAmountsCents: [10, 20],
    },
    { reference: 'demo-a', declaredTotalCents: 99, lineAmountsCents: [10, 21] },
    {
      reference: 'demo-a',
      declaredTotalCents: 99,
      lineAmountsCents: [10, 20, 0],
    },
  ])('distinguishes a changed command %#', (document) => {
    expect(
      canonicalizeSyntheticDocumentBatch({
        ...input,
        documents: [document, input.documents[1]!],
      }),
    ).not.toBe(canonicalizeSyntheticDocumentBatch(input));
  });

  it('does not mutate frozen input or include unrelated object fields', () => {
    const augmented = {
      ...structuredClone(input),
      tenantId: 'not-command-content',
      documents: input.documents.map((document) => ({
        ...document,
        privateValue: 'not-command-content',
        lineAmountsCents: [...document.lineAmountsCents],
      })),
    };
    for (const document of augmented.documents) {
      Object.freeze(document.lineAmountsCents);
      Object.freeze(document);
    }
    Object.freeze(augmented.documents);
    Object.freeze(augmented);
    const before = JSON.stringify(augmented);
    const command = canonicalizeSyntheticDocumentBatch(augmented);
    expect(JSON.parse(command)).toEqual(input);
    expect(command).not.toContain('not-command-content');
    expect(JSON.stringify(augmented)).toBe(before);
  });
});
