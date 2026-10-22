import type { Pool, PoolClient } from 'pg';
import { performance } from 'node:perf_hooks';
import {
  authenticatedIdentitySchema,
  organizationIdSchema,
  syntheticDiagnosticSchema,
  syntheticDiagnosticExecutionDetailSchema,
  type AuthenticatedIdentity,
  type SyntheticDiagnostic,
} from '@tax/contracts';
import { OrganizationOperationStore } from './organization-operation-store';
import { SyntheticBatchSnapshotStore } from './synthetic-batch-snapshot-store';
import { SyntheticDiagnosticAuditStore } from './synthetic-diagnostic-audit-store';

export interface DiagnosticPersistenceTransaction {
  readonly scope: { organizationId: string; actorId: string };
  readBatch(batchId: string): Promise<unknown | undefined>;
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
export interface DiagnosticPersistenceOperation {
  identity: AuthenticatedIdentity;
  organizationId: string;
  action: 'create' | 'read';
}
export class SyntheticDiagnosticExecutionStore {
  constructor(private readonly pool: Pool) {
    const connection = Number(pool.options.connectionTimeoutMillis);
    const statement = Number(pool.options.statement_timeout);
    if (!(
      connection > 0 &&
      connection <= 2000 &&
      statement > 0 &&
      statement <= 2000
    ))
      throw new Error('Bounded diagnostic pool required');
  }
  private async assertPrivileges(client: PoolClient): Promise<void> {
    const result = await client.query<{ allowed: boolean }>(`
      SELECT NOT (r.rolinherit OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
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
            'tax_intelligence.synthetic_diagnostic_runs'::regclass,
            'audit_compliance.synthetic_diagnostic_creations'::regclass)
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
              (n.nspname='fiscal_compliance' AND c.relname IN ('synthetic_batches','synthetic_documents','synthetic_lines')) OR
              (n.nspname='tax_intelligence' AND c.relname='synthetic_diagnostic_runs')))
            OR (has_any_column_privilege(current_user,c.oid,'INSERT') AND NOT (
              (n.nspname='tax_intelligence' AND c.relname='synthetic_diagnostic_runs') OR
              (n.nspname='audit_compliance' AND c.relname='synthetic_diagnostic_creations'))))
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_attribute a WHERE a.attrelid='audit_compliance.synthetic_diagnostic_creations'::regclass
          AND a.attnum>0 AND NOT a.attisdropped AND a.attname NOT IN ('tenant_id','actor_id','execution_id','request_id')
          AND has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT')
        )
        AND has_table_privilege(current_user,'identity_access.actors','SELECT')
        AND has_table_privilege(current_user,'organization_access.memberships','SELECT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_batches','SELECT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_documents','SELECT')
        AND has_table_privilege(current_user,'fiscal_compliance.synthetic_lines','SELECT')
        AND NOT EXISTS (
          SELECT 1 FROM pg_attribute a WHERE a.attrelid='audit_compliance.synthetic_diagnostic_creations'::regclass
          AND a.attnum>0 AND NOT a.attisdropped AND a.attname IN ('tenant_id','actor_id','execution_id','request_id')
          AND NOT has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT')
        )
        AND has_table_privilege(current_user,'tax_intelligence.synthetic_diagnostic_runs','SELECT')
        AND has_table_privilege(current_user,'tax_intelligence.synthetic_diagnostic_runs','INSERT')
        AND current_setting('server_encoding')='UTF8'
        AS allowed FROM pg_roles r WHERE r.rolname=current_user
    `);
    if (result.rows[0]?.allowed !== true)
      throw new Error('Unsafe synthetic diagnostic database privileges');
  }
  async run<T>(
    operation: DiagnosticPersistenceOperation,
    work: (transaction: DiagnosticPersistenceTransaction) => Promise<T>,
  ): Promise<{ status: 'authorized'; value: T } | { status: 'denied' }> {
    const identity = authenticatedIdentitySchema.parse(operation.identity);
    const organizationId = organizationIdSchema
      .parse(operation.organizationId)
      .toLowerCase();
    if (!['create', 'read'].includes(operation.action))
      throw new Error('Invalid diagnostic action');
    const start = performance.now();
    const client = await this.pool.connect();
    let started = false;
    let active = false;
    let discard = false;
    let released = false;
    const pending = new Set<Promise<unknown>>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = (destroy: boolean) => {
      if (!released) {
        released = true;
        client.release(destroy);
      }
    };
    const connectionError = () => {
      discard = true;
    };
    client.on('error', connectionError);
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => {
          active = false;
          discard = true;
          reject(new Error('Diagnostic operation deadline exceeded'));
          release(true);
        },
        Math.max(1, 10000 - (performance.now() - start)),
      );
    });
    const perform = async (): Promise<
      { status: 'authorized'; value: T } | { status: 'denied' }
    > => {
      await this.assertPrivileges(client);
      const baseline = await client.query<{ tenant: string | null }>(
        "SELECT nullif(current_setting('tax.tenant_id',true),'') AS tenant",
      );
      if (baseline.rows[0]?.tenant !== null)
        throw new Error('Contaminated diagnostic connection');
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      started = true;
      await client.query(
        "SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='2000ms'; SET LOCAL transaction_timeout='5000ms'",
      );
      const commit = async () => {
        const result = await client.query('COMMIT');
        if (result.command !== 'COMMIT')
          throw new Error('Diagnostic transaction not committed');
        started = false;
      };
      const authorized = await new OrganizationOperationStore(client).authorize(
        identity,
        organizationId,
        operation.action,
      );
      if (!authorized) {
        await commit();
        return { status: 'denied' };
      }
      const scope = Object.freeze({ ...authorized });
      await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
        scope.organizationId,
      ]);
      active = true;
      const insertedIds = new Set<string>();
      const recordedIds = new Set<string>();
      const check = () => {
        if (!active || released)
          throw new Error('Diagnostic transaction is no longer active');
      };
      const tracked = <V>(call: () => Promise<V>): Promise<V> => {
        const promise = (async () => {
          check();
          return call();
        })();
        pending.add(promise);
        void promise.then(
          () => pending.delete(promise),
          () => pending.delete(promise),
        );
        return promise;
      };
      const read = async (column: 'id' | 'batch_id', id: string) => {
        check();
        const parsedId = organizationIdSchema.parse(id).toLowerCase();
        const result = await client.query<{
          id: string;
          batch_id: string;
          rule_id: string;
          rule_version: string;
          created_at: Date;
          result: unknown;
        }>(
          `SELECT id,batch_id,rule_id,rule_version,created_at,result FROM tax_intelligence.synthetic_diagnostic_runs WHERE tenant_id=$1 AND ${column}=$2 AND rule_id='DEMO-TOTAL-001' AND rule_version='1.0.0'`,
          [scope.organizationId, parsedId],
        );
        const row = result.rows[0];
        return row
          ? syntheticDiagnosticExecutionDetailSchema.parse({
              id: row.id,
              batchId: row.batch_id,
              ruleId: row.rule_id,
              ruleVersion: row.rule_version,
              createdAt: row.created_at.toISOString(),
              diagnostic: row.result,
            })
          : undefined;
      };
      const capabilities: DiagnosticPersistenceTransaction = Object.freeze({
        scope,
        readBatch: (batchId: string) =>
          tracked(async () => {
            check();
            return new SyntheticBatchSnapshotStore(client, scope).get(
              organizationIdSchema.parse(batchId).toLowerCase(),
            );
          }),
        findExecution: (batchId: string) =>
          tracked(() => read('batch_id', batchId)),
        readExecution: (executionId: string) =>
          tracked(() => read('id', executionId)),
        insertExecution: (command: {
          batchId: string;
          diagnostic: SyntheticDiagnostic;
        }) =>
          tracked(async () => {
            check();
            if (operation.action !== 'create')
              throw new Error('Read-only diagnostic operation');
            const batchId = organizationIdSchema
              .parse(command.batchId)
              .toLowerCase();
            const diagnostic = syntheticDiagnosticSchema.parse(
              command.diagnostic,
            );
            const json = JSON.stringify(diagnostic);
            if (Buffer.byteLength(json, 'utf8') > 16384)
              throw new Error('Diagnostic result too large');
            const inserted = await client.query<{
              id: string;
              created_at: Date;
            }>(
              "INSERT INTO tax_intelligence.synthetic_diagnostic_runs(tenant_id,batch_id,actor_id,rule_id,rule_version,result) VALUES($1,$2,$3,'DEMO-TOTAL-001','1.0.0',$4::jsonb) RETURNING id,created_at",
              [scope.organizationId, batchId, scope.actorId, json],
            );
            insertedIds.add(inserted.rows[0]!.id);
            return syntheticDiagnosticExecutionDetailSchema.parse({
              id: inserted.rows[0]!.id,
              batchId,
              ruleId: 'DEMO-TOTAL-001',
              ruleVersion: '1.0.0',
              createdAt: inserted.rows[0]!.created_at.toISOString(),
              diagnostic,
            });
          }),
        recordCreation: (command: { executionId: string; requestId: string }) =>
          tracked(async () => {
            check();
            if (operation.action !== 'create')
              throw new Error('Read-only diagnostic operation');
            const executionId = organizationIdSchema
              .parse(command.executionId)
              .toLowerCase();
            if (!insertedIds.has(executionId) || recordedIds.has(executionId))
              throw new Error('Invalid diagnostic audit target');
            await new SyntheticDiagnosticAuditStore(client).record(
              scope,
              executionId,
              organizationIdSchema.parse(command.requestId).toLowerCase(),
            );
            recordedIds.add(executionId);
          }),
      });
      const value = await work(capabilities);
      active = false;
      if (pending.size) throw new Error('Unfinished diagnostic operation');
      if (insertedIds.size !== recordedIds.size)
        throw new Error('Incomplete diagnostic audit');
      await commit();
      return { status: 'authorized', value };
    };
    try {
      return await Promise.race([perform(), timeout]);
    } catch (error) {
      active = false;
      if (pending.size) {
        discard = true;
        release(true);
      }
      if (started && !released) {
        try {
          await client.query('ROLLBACK');
        } catch {
          discard = true;
        }
      } else discard = true;
      throw error;
    } finally {
      active = false;
      if (timer) clearTimeout(timer);
      release(discard);
      client.removeListener('error', connectionError);
    }
  }
}
