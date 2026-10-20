import type {
  AuthenticatedIdentity,
  SyntheticDocumentBatchInput,
  SyntheticDocumentBatchReceipt,
  SyntheticDocumentBatchDetail,
} from '@tax/contracts';

export interface BatchOperation {
  identity: AuthenticatedIdentity;
  organizationId: string;
}
export interface BatchCreateCommand extends BatchOperation {
  input: SyntheticDocumentBatchInput;
  idempotencyKey: string;
  requestId: string;
}
export interface SyntheticBatchPort {
  create(
    command: BatchCreateCommand,
  ): Promise<
    | { status: 'created' | 'replayed'; receipt: SyntheticDocumentBatchReceipt }
    | { status: 'denied' | 'conflict' }
  >;
  get(
    command: BatchOperation & { batchId: string },
  ): Promise<
    | { status: 'found'; batch: SyntheticDocumentBatchDetail }
    | { status: 'denied' | 'not_found' }
  >;
}

// Authorization, locking and atomic audit are enforced together by the transactional port.
export class SyntheticBatchService {
  constructor(private readonly batches: SyntheticBatchPort) {}
  create(command: BatchCreateCommand) {
    return this.batches.create(command);
  }
  get(command: BatchOperation & { batchId: string }) {
    return this.batches.get(command);
  }
}
