import { syntheticDocumentBatchInputSchema } from '@tax/contracts';
import { evaluateSyntheticTotals } from '../domain/synthetic-diagnostic';

export function diagnoseSyntheticBatch(input: unknown) {
  return evaluateSyntheticTotals(
    syntheticDocumentBatchInputSchema.parse(input),
  );
}
