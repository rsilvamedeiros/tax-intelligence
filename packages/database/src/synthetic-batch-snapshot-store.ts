import type { PoolClient } from 'pg';
import {
  syntheticDocumentBatchDetailSchema,
  type SyntheticDocumentBatchDetail,
} from '@tax/contracts';
import type { AuthorizedOrganizationOperation } from './organization-operation-store';

// Infrastructure-only snapshot; caller supplies the already authorized active transaction.
export class SyntheticBatchSnapshotStore {
  constructor(
    private readonly client: PoolClient,
    private readonly scope: AuthorizedOrganizationOperation,
  ) {}
  async get(
    batchId: string,
  ): Promise<SyntheticDocumentBatchDetail | undefined> {
    const client = this.client;
    const organizationId = this.scope.organizationId;
    const root = await client.query<{
      id: string;
      created_at: Date;
      document_count: number;
    }>(
      'SELECT id,created_at,document_count FROM fiscal_compliance.synthetic_batches WHERE tenant_id=$1 AND id=$2',
      [organizationId, batchId],
    );
    const batch = root.rows[0];
    if (!batch) return undefined;
    const documents = await client.query<{
      ordinal: number;
      reference: string;
      declared_total_cents: number;
      line_count: number;
    }>(
      'SELECT ordinal,reference,declared_total_cents,line_count FROM fiscal_compliance.synthetic_documents WHERE tenant_id=$1 AND batch_id=$2 ORDER BY ordinal',
      [organizationId, batchId],
    );
    const lines = await client.query<{
      document_ordinal: number;
      ordinal: number;
      amount_cents: number;
    }>(
      'SELECT document_ordinal,ordinal,amount_cents FROM fiscal_compliance.synthetic_lines WHERE tenant_id=$1 AND batch_id=$2 ORDER BY document_ordinal,ordinal',
      [organizationId, batchId],
    );
    if (documents.rows.length !== batch.document_count)
      throw new Error('Incomplete synthetic batch');
    const normalized = documents.rows.map((document, index) => {
      const amounts = lines.rows.filter(
        (line) => line.document_ordinal === document.ordinal,
      );
      if (
        document.ordinal !== index + 1 ||
        amounts.length !== document.line_count ||
        amounts.some((line, lineIndex) => line.ordinal !== lineIndex + 1)
      )
        throw new Error('Incomplete synthetic document');
      return {
        reference: document.reference,
        declaredTotalCents: document.declared_total_cents,
        lineAmountsCents: amounts.map((line) => line.amount_cents),
      };
    });
    return syntheticDocumentBatchDetailSchema.parse({
      id: batch.id,
      schemaVersion: 'synthetic-document-batch-v1',
      createdAt: batch.created_at.toISOString(),
      documents: normalized,
    });
  }
}
