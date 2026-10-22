import type {
  AuthenticatedIdentity,
  SyntheticDiagnostic,
  SyntheticDiagnosticExecutionReceipt,
  SyntheticDiagnosticExecutionDetail,
} from '@tax/contracts';
import {
  authenticatedIdentitySchema,
  organizationIdSchema,
  syntheticDiagnosticExecutionCommandSchema,
  syntheticDiagnosticExecutionQuerySchema,
  syntheticDiagnosticExecutionReceiptSchema,
  syntheticDiagnosticExecutionDetailSchema,
  syntheticDocumentBatchDetailSchema,
} from '@tax/contracts';
import { diagnoseSyntheticBatch } from './diagnose-synthetic-batch';

export interface DiagnosticTransaction {
  readonly scope: { readonly organizationId: string; readonly actorId: string };
  readBatch(batchId: string): Promise<unknown | undefined>;
  // Natural key includes the current tenant and fixed DEMO-TOTAL-001/1.0.0.
  findExecution(batchId: string): Promise<unknown | undefined>;
  readExecution(executionId: string): Promise<unknown | undefined>;
  insertExecution(command: {
    batchId: string;
    diagnostic: SyntheticDiagnostic;
  }): Promise<unknown>;
  recordCreation(command: {
    executionId: string;
    requestId: string;
  }): Promise<void>;
}
export interface DiagnosticUnitOfWork {
  // Adapter must authorize and retain the organization lock/context through commit or rollback.
  run<T>(
    operation: {
      identity: AuthenticatedIdentity;
      organizationId: string;
      action: 'create' | 'read';
    },
    work: (transaction: DiagnosticTransaction) => Promise<T>,
  ): Promise<{ status: 'authorized'; value: T } | { status: 'denied' }>;
}
export type DiagnosticCreateResult =
  | {
      status: 'created' | 'replayed';
      receipt: SyntheticDiagnosticExecutionReceipt;
    }
  | { status: 'denied' | 'not_found' };
export type DiagnosticReadResult =
  | { status: 'found'; execution: SyntheticDiagnosticExecutionDetail }
  | { status: 'denied' | 'not_found' };

export class SyntheticDiagnosticExecutionService {
  constructor(private readonly unitOfWork: DiagnosticUnitOfWork) {}
  async create(
    identity: AuthenticatedIdentity,
    command: unknown,
  ): Promise<DiagnosticCreateResult> {
    const input = syntheticDiagnosticExecutionCommandSchema.parse(command);
    const verifiedIdentity = authenticatedIdentitySchema.parse(identity);
    const result = await this.unitOfWork.run<DiagnosticCreateResult>(
      {
        identity: verifiedIdentity,
        organizationId: input.organizationId,
        action: 'create',
      },
      async (transaction) => {
        assertScope(transaction, input.organizationId);
        const snapshot = await transaction.readBatch(input.batchId);
        if (snapshot === undefined) return { status: 'not_found' };
        const diagnostic = calculateSnapshot(snapshot, input.batchId);
        const previous = await transaction.findExecution(input.batchId);
        if (previous !== undefined) {
          const execution = validateExecution(
            previous,
            input.batchId,
            diagnostic,
          );
          return { status: 'replayed', receipt: projectReceipt(execution) };
        }
        const inserted = validateExecution(
          await transaction.insertExecution({
            batchId: input.batchId,
            diagnostic: structuredClone(diagnostic),
          }),
          input.batchId,
          diagnostic,
        );
        await transaction.recordCreation({
          executionId: inserted.id,
          requestId: input.requestId,
        });
        return { status: 'created', receipt: projectReceipt(inserted) };
      },
    );
    return unwrap(result);
  }
  async get(
    identity: AuthenticatedIdentity,
    query: unknown,
  ): Promise<DiagnosticReadResult> {
    const input = syntheticDiagnosticExecutionQuerySchema.parse(query);
    const verifiedIdentity = authenticatedIdentitySchema.parse(identity);
    const result = await this.unitOfWork.run<DiagnosticReadResult>(
      {
        identity: verifiedIdentity,
        organizationId: input.organizationId,
        action: 'read',
      },
      async (transaction) => {
        assertScope(transaction, input.organizationId);
        const stored = await transaction.readExecution(input.executionId);
        if (stored === undefined) return { status: 'not_found' };
        const parsed =
          syntheticDiagnosticExecutionDetailSchema.safeParse(stored);
        if (!parsed.success || parsed.data.id !== input.executionId)
          return integrity();
        const snapshot = await transaction.readBatch(parsed.data.batchId);
        const diagnostic = calculateSnapshot(snapshot, parsed.data.batchId);
        return {
          status: 'found',
          execution: validateExecution(
            parsed.data,
            parsed.data.batchId,
            diagnostic,
          ),
        };
      },
    );
    return unwrap(result);
  }
}

function projectReceipt(execution: SyntheticDiagnosticExecutionDetail) {
  return syntheticDiagnosticExecutionReceiptSchema.parse({
    id: execution.id,
    batchId: execution.batchId,
    ruleId: execution.ruleId,
    ruleVersion: execution.ruleVersion,
    createdAt: execution.createdAt,
  });
}

function integrity(): never {
  throw new Error('Invalid synthetic diagnostic state');
}
function assertScope(
  transaction: DiagnosticTransaction,
  organizationId: string,
) {
  const organization = organizationIdSchema.safeParse(
    transaction.scope?.organizationId,
  );
  const actor = organizationIdSchema.safeParse(transaction.scope?.actorId);
  if (
    !organization.success ||
    !actor.success ||
    organization.data.toLowerCase() !== organizationId
  )
    integrity();
}
function calculateSnapshot(snapshot: unknown, batchId: string) {
  const parsed = syntheticDocumentBatchDetailSchema.safeParse(snapshot);
  if (!parsed.success || parsed.data.id !== batchId) return integrity();
  return diagnoseSyntheticBatch({
    schemaVersion: parsed.data.schemaVersion,
    documents: parsed.data.documents,
  });
}
function validateExecution(
  value: unknown,
  batchId: string,
  diagnostic: SyntheticDiagnostic,
) {
  const parsed = syntheticDiagnosticExecutionDetailSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.batchId !== batchId ||
    JSON.stringify(parsed.data.diagnostic) !== JSON.stringify(diagnostic)
  )
    return integrity();
  return parsed.data;
}
function unwrap<T>(
  result: { status: 'authorized'; value: T } | { status: 'denied' },
): T | { status: 'denied' } {
  if (result.status === 'denied') return { status: 'denied' };
  if (result.status !== 'authorized') return integrity();
  return result.value;
}
