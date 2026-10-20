import type { Pool, PoolClient } from 'pg';
import {
  syntheticDocumentBatchInputSchema,
  syntheticDocumentBatchReceiptSchema,
  syntheticDocumentBatchDetailSchema,
  syntheticDocumentIdempotencyKeySchema,
  type SyntheticDocumentBatchInput,
  type SyntheticDocumentBatchReceipt,
  type SyntheticDocumentBatchDetail,
} from '@tax/contracts';
import {
  OrganizationOperationStore,
  type AuthorizedOrganizationOperation,
} from './organization-operation-store';
import { SyntheticBatchAuditStore } from './synthetic-batch-audit-store';

export interface SyntheticBatchOperation {
  identity: { issuer: string; subject: string };
  organizationId: string;
}
export interface SyntheticBatchCreateCommand extends SyntheticBatchOperation {
  input: SyntheticDocumentBatchInput;
  idempotencyKey: string;
  requestId: string;
}
export type SyntheticBatchCreateResult =
  | { status: 'created' | 'replayed'; receipt: SyntheticDocumentBatchReceipt }
  | { status: 'denied' | 'conflict' };
export type SyntheticBatchReadResult =
  | { status: 'found'; batch: SyntheticDocumentBatchDetail }
  | { status: 'denied' | 'not_found' };

export class SyntheticDocumentBatchStore {
  constructor(private readonly pool: Pool) {}
  async assertRuntimePrivileges(): Promise<void> {
    const result = await this.pool.query<{ allowed: boolean }>(`
      SELECT NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
        AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid)
        AND NOT has_database_privilege(current_user,current_database(),'CREATE')
        AND NOT EXISTS (
          SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
          AND (n.nspowner=r.oid OR has_schema_privilege(current_user,n.oid,'CREATE'))
        )
        AND NOT has_schema_privilege(current_user,'auth_bff','USAGE')
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='S'
          AND (c.relowner=r.oid OR has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_class WHERE oid IN (
            'fiscal_compliance.synthetic_batches'::regclass,
            'fiscal_compliance.synthetic_documents'::regclass,
            'fiscal_compliance.synthetic_lines'::regclass,
            'audit_compliance.synthetic_batch_creations'::regclass)
          AND (NOT relrowsecurity OR NOT relforcerowsecurity)
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','f')
          AND (c.relowner=r.oid
            OR has_table_privilege(current_user,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'UPDATE,REFERENCES')
            OR (has_any_column_privilege(current_user,c.oid,'SELECT') AND NOT (
              (n.nspname='identity_access' AND c.relname='actors') OR
              (n.nspname='organization_access' AND c.relname='memberships') OR
              (n.nspname='fiscal_compliance' AND c.relname IN ('synthetic_batches','synthetic_documents','synthetic_lines'))))
            OR (has_any_column_privilege(current_user,c.oid,'INSERT') AND NOT (
              (n.nspname='fiscal_compliance' AND c.relname IN ('synthetic_batches','synthetic_documents','synthetic_lines')) OR
              (n.nspname='audit_compliance' AND c.relname='synthetic_batch_creations'))))
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_attribute a WHERE a.attrelid='audit_compliance.synthetic_batch_creations'::regclass
          AND a.attnum>0 AND NOT a.attisdropped AND a.attname NOT IN ('tenant_id','actor_id','batch_id','request_id')
          AND has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT')
        )
        AND has_table_privilege(current_user,'identity_access.actors','SELECT')
        AND has_table_privilege(current_user,'organization_access.memberships','SELECT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_batches','SELECT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_batches','INSERT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_documents','SELECT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_documents','INSERT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_lines','SELECT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_lines','INSERT')
        AND NOT EXISTS (
          SELECT 1 FROM pg_attribute a WHERE a.attrelid='audit_compliance.synthetic_batch_creations'::regclass
          AND a.attnum>0 AND NOT a.attisdropped AND a.attname IN ('tenant_id','actor_id','batch_id','request_id')
          AND NOT has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT')
        )
        AS allowed FROM pg_roles r WHERE r.rolname=current_user
    `);
    if (result.rows[0]?.allowed !== true)
      throw new Error('Unsafe synthetic batch database privileges');
  }
  async create(
    command: SyntheticBatchCreateCommand,
  ): Promise<SyntheticBatchCreateResult> {
    const input = syntheticDocumentBatchInputSchema.parse(command.input);
    const key = syntheticDocumentIdempotencyKeySchema.parse(
      command.idempotencyKey,
    );
    return this.transaction(command, 'create', async (client, scope) => {
      const previous = await client.query<{ id: string }>(
        'SELECT id FROM fiscal_compliance.synthetic_batches WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3',
        [scope.organizationId, scope.actorId, key],
      );
      if (previous.rows[0]) {
        const batch = await this.read(
          client,
          scope.organizationId,
          previous.rows[0].id,
        );
        if (!batch) throw new Error('Stored synthetic batch missing');
        // The same strict schema fixes property order on both projections; JSON also normalizes -0.
        if (JSON.stringify(batch.documents) !== JSON.stringify(input.documents))
          return { status: 'conflict' as const };
        return {
          status: 'replayed' as const,
          receipt: syntheticDocumentBatchReceiptSchema.parse({
            id: batch.id,
            schemaVersion: batch.schemaVersion,
            createdAt: batch.createdAt,
          }),
        };
      }
      const inserted = await client.query<{ id: string; created_at: Date }>(
        'INSERT INTO fiscal_compliance.synthetic_batches(tenant_id,actor_id,idempotency_key,document_count) VALUES($1,$2,$3,$4) RETURNING id,created_at',
        [scope.organizationId, scope.actorId, key, input.documents.length],
      );
      const batch = inserted.rows[0]!;
      for (const [index, document] of input.documents.entries()) {
        await client.query(
          'INSERT INTO fiscal_compliance.synthetic_documents(tenant_id,batch_id,ordinal,reference,declared_total_cents,line_count) VALUES($1,$2,$3,$4,$5,$6)',
          [
            scope.organizationId,
            batch.id,
            index + 1,
            document.reference,
            document.declaredTotalCents,
            document.lineAmountsCents.length,
          ],
        );
        await client.query(
          'INSERT INTO fiscal_compliance.synthetic_lines(tenant_id,batch_id,document_ordinal,ordinal,amount_cents) SELECT $1,$2,$3,ordinal::smallint,value::integer FROM jsonb_array_elements_text($4::jsonb) WITH ORDINALITY AS amounts(value,ordinal)',
          [
            scope.organizationId,
            batch.id,
            index + 1,
            JSON.stringify(document.lineAmountsCents),
          ],
        );
      }
      await new SyntheticBatchAuditStore(client).record({
        ...scope,
        batchId: batch.id,
        requestId: command.requestId,
      });
      return {
        status: 'created' as const,
        receipt: syntheticDocumentBatchReceiptSchema.parse({
          id: batch.id,
          schemaVersion: input.schemaVersion,
          createdAt: batch.created_at.toISOString(),
        }),
      };
    });
  }
  async get(
    command: SyntheticBatchOperation & { batchId: string },
  ): Promise<SyntheticBatchReadResult> {
    return this.transaction(command, 'read', async (client, scope) => {
      const batch = await this.read(
        client,
        scope.organizationId,
        command.batchId,
      );
      return batch
        ? { status: 'found' as const, batch }
        : { status: 'not_found' as const };
    });
  }

  private async read(
    client: PoolClient,
    organizationId: string,
    batchId: string,
  ): Promise<SyntheticDocumentBatchDetail | undefined> {
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

  private async transaction<T>(
    command: SyntheticBatchOperation,
    action: 'create' | 'read',
    work: (
      client: PoolClient,
      scope: AuthorizedOrganizationOperation,
    ) => Promise<T>,
  ): Promise<T | { status: 'denied' }> {
    const client = await this.pool.connect();
    let started = false;
    let discard = false;
    const connectionError = () => {
      discard = true;
    };
    client.on('error', connectionError);
    try {
      const baseline = await client.query<{ tenant: string | null }>(
        "SELECT nullif(current_setting('tax.tenant_id',true),'') AS tenant",
      );
      if (baseline.rows[0]!.tenant !== null)
        throw new Error('Contaminated batch connection');
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      started = true;
      await client.query(
        "SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='2000ms'; SET LOCAL transaction_timeout='5000ms'",
      );
      const scope = await new OrganizationOperationStore(client).authorize(
        command.identity,
        command.organizationId,
        action,
      );
      let result: T | { status: 'denied' } = { status: 'denied' };
      if (scope) {
        await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
          scope.organizationId,
        ]);
        result = await work(client, scope);
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (started) {
        try {
          await client.query('ROLLBACK');
        } catch {
          discard = true;
        }
      } else discard = true;
      throw error;
    } finally {
      client.release(discard);
      client.removeListener('error', connectionError);
    }
  }
}
