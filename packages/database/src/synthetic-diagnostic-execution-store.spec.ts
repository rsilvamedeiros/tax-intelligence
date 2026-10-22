import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createDatabase,
  SyntheticDocumentBatchStore,
  type Database,
} from './index';
import {
  SyntheticDiagnosticExecutionStore,
  type DiagnosticPersistenceTransaction,
} from './synthetic-diagnostic-execution-store';
import {
  syntheticDiagnosticExecutionDetailSchema,
  type SyntheticDiagnostic,
} from '@tax/contracts';

describe('Synthetic diagnostic execution with an authenticated restricted PostgreSQL login', () => {
  let owner: Database;
  let runtime: Pool;
  let store: SyntheticDiagnosticExecutionStore;
  let batchId: string;
  const role = `diagnostic_runtime_${randomBytes(8).toString('hex')}`;
  const organizations = [randomUUID(), randomUUID()];
  const org = organizations[0]!;
  const actors = Array.from({ length: 5 }, () => randomUUID());
  const issuer = `https://${org}.example.invalid`;
  const documents = [
    {
      reference: 'demo',
      declaredTotalCents: 301,
      lineAmountsCents: [100, 200],
    },
  ];
  const diagnostic: SyntheticDiagnostic = {
    schemaVersion: 'synthetic-document-diagnostic-v1',
    rule: {
      id: 'DEMO-TOTAL-001',
      version: '1.0.0',
      source: 'project-fixture-specification',
      fiscalValidity: 'none',
    },
    documents: [
      {
        ...documents[0]!,
        computedTotalCents: 300,
        differenceCents: 1,
        outcome: 'mismatch',
      },
    ],
  };
  const operation = (
    index = 1,
    organizationId = org,
    action: 'create' | 'read' = 'create',
  ) => ({
    identity: { issuer, subject: actors[index]! },
    organizationId,
    action,
  });
  const execute = (index = 1, selected = store) =>
    selected.run(operation(index), async (transaction) => {
      const previous = await transaction.findExecution(batchId);
      if (previous !== undefined)
        return syntheticDiagnosticExecutionDetailSchema.parse(previous);
      const inserted = syntheticDiagnosticExecutionDetailSchema.parse(
        await transaction.insertExecution({ batchId, diagnostic }),
      );
      await transaction.recordCreation({
        executionId: inserted.id,
        requestId: randomUUID(),
      });
      return inserted;
    });
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error('Isolated TEST_DATABASE_URL ending in _test required');
    owner = createDatabase(url);
    await migrate(owner.db, {
      migrationsFolder: resolve(__dirname, '../migrations'),
    });
    const password = randomBytes(32).toString('hex');
    await owner.pool.query(
      `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`,
    );
    await owner.pool.query(
      `GRANT USAGE ON SCHEMA identity_access,organization_access,fiscal_compliance,tax_intelligence,audit_compliance TO ${role}`,
    );
    await owner.pool.query(
      `GRANT SELECT ON identity_access.actors,organization_access.memberships,fiscal_compliance.synthetic_batches,fiscal_compliance.synthetic_documents,fiscal_compliance.synthetic_lines TO ${role}`,
    );
    await owner.pool.query(
      `GRANT SELECT,INSERT ON tax_intelligence.synthetic_diagnostic_runs TO ${role}`,
    );
    await owner.pool.query(
      `GRANT INSERT(tenant_id,actor_id,execution_id,request_id) ON audit_compliance.synthetic_diagnostic_creations TO ${role}`,
    );
    const connection = new URL(url);
    connection.username = role;
    connection.password = password;
    runtime = new Pool({
      connectionString: connection.href,
      max: 1,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      application_name: role,
    });
    runtime.on('error', () => {});
    store = new SyntheticDiagnosticExecutionStore(runtime);
    for (const id of organizations)
      await owner.pool.query(
        'INSERT INTO organization_access.organizations VALUES($1,$2)',
        [id, 'Synthetic diagnostic test'],
      );
    for (const id of actors)
      await owner.pool.query(
        'INSERT INTO identity_access.actors VALUES($1,$2,$3)',
        [id, issuer, id],
      );
    for (const [index, id] of actors.entries())
      await owner.pool.query(
        'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
        [
          index === 4 ? organizations[1] : org,
          id,
          [
            'organization_admin',
            'analyst',
            'viewer',
            'reviewer',
            'organization_admin',
          ][index],
        ],
      );
  });
  beforeEach(async () => {
    await owner.pool.query(
      "UPDATE organization_access.memberships SET revoked_at=NULL,role=CASE actor_id WHEN $1::uuid THEN 'analyst' WHEN $2::uuid THEN 'viewer' WHEN $3::uuid THEN 'reviewer' ELSE 'organization_admin' END WHERE organization_id=ANY($4::uuid[])",
      [actors[1], actors[2], actors[3], organizations],
    );
    const batch = await new SyntheticDocumentBatchStore(owner.pool).create({
      identity: operation(0).identity,
      organizationId: org,
      input: { schemaVersion: 'synthetic-document-batch-v1', documents },
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
    });
    if (batch.status !== 'created')
      throw new Error('Synthetic batch fixture failed');
    batchId = batch.receipt.id;
  });
  afterEach(async () => {
    for (const table of [
      'audit_compliance.synthetic_diagnostic_creations',
      'tax_intelligence.synthetic_diagnostic_runs',
      'fiscal_compliance.synthetic_lines',
      'fiscal_compliance.synthetic_documents',
      'audit_compliance.synthetic_batch_creations',
      'fiscal_compliance.synthetic_batches',
    ])
      await owner.pool.query(
        `DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,
        [organizations],
      );
  });
  afterAll(async () => {
    await runtime?.end();
    if (owner) {
      for (const table of [
        'membership_revocations',
        'membership_role_changes',
        'membership_grants',
        'memberships',
      ])
        await owner.pool.query(
          `DELETE FROM organization_access.${table} WHERE organization_id=ANY($1::uuid[])`,
          [organizations],
        );
      await owner.pool.query(
        'DELETE FROM organization_access.organizations WHERE id=ANY($1::uuid[])',
        [organizations],
      );
      await owner.pool.query(
        'DELETE FROM identity_access.actors WHERE id=ANY($1::uuid[])',
        [actors],
      );
      await owner.pool.query(`DROP OWNED BY ${role}`);
      await owner.pool.query(`DROP ROLE ${role}`);
      await owner.pool.end();
    }
  });
  it('commits a versioned execution and exactly one Audit event with the restricted login', async () => {
    const result = await execute();
    expect(result.status).toBe('authorized');
    const events = await owner.pool.query(
      'SELECT actor_id FROM audit_compliance.synthetic_diagnostic_creations WHERE tenant_id=$1',
      [org],
    );
    expect(events.rows).toEqual([{ actor_id: actors[1] }]);
  });
  it('requires ENABLE and FORCE RLS on both new diagnostic relations', async () => {
    const tables = await owner.pool.query(
      "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='tax_intelligence' AND c.relname='synthetic_diagnostic_runs') OR (n.nspname='audit_compliance' AND c.relname='synthetic_diagnostic_creations') ORDER BY c.relname",
    );
    expect(tables.rows).toHaveLength(2);
    for (const table of tables.rows) {
      expect(table.relrowsecurity).toBe(true);
      expect(table.relforcerowsecurity).toBe(true);
      expect(table.owner).not.toBe(role);
    }
  });
  it('rolls back an execution if a callback forgets to record its creation event', async () => {
    await expect(
      store.run(operation(), (transaction) =>
        transaction.insertExecution({ batchId, diagnostic }),
      ),
    ).rejects.toThrow('Incomplete diagnostic audit');
    const rows = await owner.pool.query(
      'SELECT count(*)::integer AS count FROM tax_intelligence.synthetic_diagnostic_runs WHERE tenant_id=$1',
      [org],
    );
    expect(rows.rows[0].count).toBe(0);
  });
  it('refuses to commit when a defective callback leaves an insertion unawaited', async () => {
    let insertion: Promise<unknown> | undefined;
    await expect(
      store.run(operation(), async (transaction) => {
        insertion = transaction.insertExecution({ batchId, diagnostic });
        void insertion.catch(() => {});
      }),
    ).rejects.toThrow('Unfinished diagnostic operation');
    await insertion?.catch(() => {});
    expect(
      (
        await owner.pool.query(
          'SELECT count(*)::integer AS count FROM tax_intelligence.synthetic_diagnostic_runs WHERE tenant_id=$1',
          [org],
        )
      ).rows[0].count,
    ).toBe(0);
    await expect(execute()).resolves.toMatchObject({ status: 'authorized' });
  });
  it.each([0, 1])(
    'allows creation for persisted write role %s',
    async (index) => {
      await expect(execute(index)).resolves.toMatchObject({
        status: 'authorized',
      });
    },
  );
  it.each([2, 3, 4])(
    'denies creation before capabilities for persisted actor %s',
    async (index) => {
      const work = jest.fn();
      await expect(store.run(operation(index), work)).resolves.toEqual({
        status: 'denied',
      });
      expect(work).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2, 3])(
    'allows persisted read role %s to inspect the execution',
    async (index) => {
      const created = await execute();
      if (created.status !== 'authorized') throw new Error('Fixture denied');
      await expect(
        store.run(operation(index, org, 'read'), (transaction) =>
          transaction.readExecution(created.value.id),
        ),
      ).resolves.toMatchObject({ status: 'authorized', value: created.value });
    },
  );
  it('replays naturally for another authorized actor without changing original provenance', async () => {
    const first = await execute(1);
    await expect(execute(0)).resolves.toEqual(first);
    const events = await owner.pool.query(
      'SELECT actor_id FROM audit_compliance.synthetic_diagnostic_creations WHERE tenant_id=$1',
      [org],
    );
    expect(events.rows).toEqual([{ actor_id: actors[1] }]);
  });
  it('keeps an execution and its Fiscal snapshot invisible to an authorized actor in another organization', async () => {
    const created = await execute();
    if (created.status !== 'authorized') throw new Error('Fixture denied');
    await expect(
      store.run(
        operation(4, organizations[1], 'read'),
        async (transaction) => ({
          execution: await transaction.readExecution(created.value.id),
          batch: await transaction.readBatch(batchId),
        }),
      ),
    ).resolves.toEqual({
      status: 'authorized',
      value: { execution: undefined, batch: undefined },
    });
  });
  it('enforces RLS on SQL without tenant filters and rejects a cross-tenant insertion', async () => {
    await execute();
    expect(
      (
        await runtime.query(
          'SELECT id FROM tax_intelligence.synthetic_diagnostic_runs',
        )
      ).rows,
    ).toEqual([]);
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
        organizations[1],
      ]);
      expect(
        (
          await client.query(
            'SELECT id FROM tax_intelligence.synthetic_diagnostic_runs',
          )
        ).rows,
      ).toEqual([]);
      await expect(
        client.query(
          "INSERT INTO tax_intelligence.synthetic_diagnostic_runs(tenant_id,batch_id,actor_id,rule_id,rule_version,result) VALUES($1,$2,$3,'DEMO-TOTAL-001','1.0.0',$4)",
          [org, batchId, actors[1], diagnostic],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
  it('rejects a cross-tenant batch reference even under a matching RLS tenant context', async () => {
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
        organizations[1],
      ]);
      await expect(
        client.query(
          "INSERT INTO tax_intelligence.synthetic_diagnostic_runs(tenant_id,batch_id,actor_id,rule_id,rule_version,result) VALUES($1,$2,$3,'DEMO-TOTAL-001','1.0.0',$4)",
          [organizations[1], batchId, actors[4], diagnostic],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
  it('rejects owner, writable Fiscal grants, audit SELECT and extra event columns in the effective privilege profile', async () => {
    await expect(
      new SyntheticDiagnosticExecutionStore(owner.pool).run(
        operation(),
        async () => undefined,
      ),
    ).rejects.toThrow('Unsafe');
    for (const [grant, revoke] of [
      [
        `GRANT INSERT ON fiscal_compliance.synthetic_batches TO ${role}`,
        `REVOKE INSERT ON fiscal_compliance.synthetic_batches FROM ${role}`,
      ],
      [
        `GRANT SELECT ON audit_compliance.synthetic_diagnostic_creations TO ${role}`,
        `REVOKE SELECT ON audit_compliance.synthetic_diagnostic_creations FROM ${role}`,
      ],
      [
        `GRANT INSERT(occurred_at) ON audit_compliance.synthetic_diagnostic_creations TO ${role}`,
        `REVOKE INSERT(occurred_at) ON audit_compliance.synthetic_diagnostic_creations FROM ${role}`,
      ],
      [
        `GRANT UPDATE ON tax_intelligence.synthetic_diagnostic_runs TO ${role}`,
        `REVOKE UPDATE ON tax_intelligence.synthetic_diagnostic_runs FROM ${role}`,
      ],
    ]) {
      await owner.pool.query(grant!);
      try {
        await expect(
          store.run(operation(), async () => undefined),
        ).rejects.toThrow('Unsafe');
      } finally {
        await owner.pool.query(revoke!);
      }
    }
  });
  it('rejects missing required grants and inherited-role capability', async () => {
    await owner.pool.query(
      `REVOKE SELECT ON fiscal_compliance.synthetic_lines FROM ${role}`,
    );
    try {
      await expect(
        store.run(operation(), async () => undefined),
      ).rejects.toThrow('Unsafe');
    } finally {
      await owner.pool.query(
        `GRANT SELECT ON fiscal_compliance.synthetic_lines TO ${role}`,
      );
    }
    const parent = `diagnostic_parent_${randomBytes(8).toString('hex')}`;
    await owner.pool.query(`CREATE ROLE ${parent} NOLOGIN`);
    try {
      await owner.pool.query(`GRANT ${parent} TO ${role}`);
      await expect(
        store.run(operation(), async () => undefined),
      ).rejects.toThrow('Unsafe');
    } finally {
      await owner.pool.query(`REVOKE ${parent} FROM ${role}`);
      await owner.pool.query(`DROP ROLE ${parent}`);
    }
  });
  it('detects an excessive privilege inherited from PUBLIC', async () => {
    await owner.pool.query(
      'GRANT SELECT ON audit_compliance.synthetic_diagnostic_creations TO PUBLIC',
    );
    try {
      await expect(
        store.run(operation(), async () => undefined),
      ).rejects.toThrow('Unsafe');
    } finally {
      await owner.pool.query(
        'REVOKE SELECT ON audit_compliance.synthetic_diagnostic_creations FROM PUBLIC',
      );
    }
  });
  it('rolls back both records if the callback fails after their insertion', async () => {
    await expect(
      store.run(operation(), async (transaction) => {
        const inserted = syntheticDiagnosticExecutionDetailSchema.parse(
          await transaction.insertExecution({ batchId, diagnostic }),
        );
        await transaction.recordCreation({
          executionId: inserted.id,
          requestId: randomUUID(),
        });
        throw new Error('synthetic-failure-after-event');
      }),
    ).rejects.toThrow('synthetic-failure-after-event');
    expect(
      (
        await owner.pool.query(
          'SELECT count(*)::integer AS count FROM tax_intelligence.synthetic_diagnostic_runs WHERE tenant_id=$1',
          [org],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await owner.pool.query(
          'SELECT count(*)::integer AS count FROM audit_compliance.synthetic_diagnostic_creations WHERE tenant_id=$1',
          [org],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it('rolls back the execution when the real audit INSERT fails', async () => {
    try {
      await expect(
        store.run(operation(), async (transaction) => {
          const inserted = syntheticDiagnosticExecutionDetailSchema.parse(
            await transaction.insertExecution({ batchId, diagnostic }),
          );
          await owner.pool.query(
            `REVOKE INSERT(tenant_id,actor_id,execution_id,request_id) ON audit_compliance.synthetic_diagnostic_creations FROM ${role}`,
          );
          await transaction.recordCreation({
            executionId: inserted.id,
            requestId: randomUUID(),
          });
        }),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await owner.pool.query(
        `GRANT INSERT(tenant_id,actor_id,execution_id,request_id) ON audit_compliance.synthetic_diagnostic_creations TO ${role}`,
      );
    }
    expect(
      (
        await owner.pool.query(
          'SELECT count(*)::integer AS count FROM tax_intelligence.synthetic_diagnostic_runs WHERE tenant_id=$1',
          [org],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it('does not report successful commit if a callback swallows an aborted SQL transaction', async () => {
    await expect(
      store.run(operation(), async (transaction) => {
        try {
          await transaction.insertExecution({
            batchId: randomUUID(),
            diagnostic,
          });
        } catch {
          /* Deliberately defective consumer. */
        }
        return 'uncommitted-success';
      }),
    ).rejects.toThrow('not committed');
  });
  it('keeps creation capabilities unavailable in a read operation', async () => {
    await expect(
      store.run(operation(1, org, 'read'), (transaction) =>
        transaction.insertExecution({ batchId, diagnostic }),
      ),
    ).rejects.toThrow('Read-only');
  });
  it('invalidates retained capabilities after commit', async () => {
    let retained: DiagnosticPersistenceTransaction | undefined;
    await store.run(operation(), async (transaction) => {
      retained = transaction;
    });
    await expect(retained!.readBatch(batchId)).rejects.toThrow(
      'no longer active',
    );
    await expect(
      retained!.insertExecution({ batchId, diagnostic }),
    ).rejects.toThrow('no longer active');
  });
  it('discards a contaminated connection and recovers with a clean tenant context', async () => {
    const previous = (await runtime.query('SELECT pg_backend_pid() AS pid'))
      .rows[0].pid;
    await runtime.query("SELECT set_config('tax.tenant_id',$1,false)", [org]);
    await expect(execute()).rejects.toThrow('Contaminated');
    const clean = await runtime.query(
      "SELECT pg_backend_pid() AS pid,nullif(current_setting('tax.tenant_id',true),'') AS tenant",
    );
    expect(clean.rows[0].pid).not.toBe(previous);
    expect(clean.rows[0].tenant).toBeNull();
    await expect(execute()).resolves.toMatchObject({ status: 'authorized' });
  });
  it('reuses the same backend without retaining tenant context after commit and rollback', async () => {
    const pid = (await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0]
      .pid;
    await execute();
    await expect(
      store.run(operation(), async () => {
        throw new Error('synthetic-rollback');
      }),
    ).rejects.toThrow('synthetic-rollback');
    const clean = await runtime.query(
      "SELECT pg_backend_pid() AS pid,nullif(current_setting('tax.tenant_id',true),'') AS tenant",
    );
    expect(clean.rows[0]).toEqual({ pid, tenant: null });
  });
  it('enforces the JSONB byte CHECK independently of application schema validation', async () => {
    await expect(
      owner.pool.query(
        "INSERT INTO tax_intelligence.synthetic_diagnostic_runs(tenant_id,batch_id,actor_id,rule_id,rule_version,result) VALUES($1,$2,$3,'DEMO-TOTAL-001','1.0.0',$4)",
        [org, batchId, actors[1], { oversized: 'x'.repeat(17000) }],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('serializes two authenticated connections into one natural execution and one event', async () => {
    const second = new Pool({ ...runtime.options, max: 1 });
    second.on('error', () => {});
    try {
      const values = await Promise.all([
        execute(0),
        execute(1, new SyntheticDiagnosticExecutionStore(second)),
      ]);
      expect(values[0]).toEqual(values[1]);
      expect(
        (
          await owner.pool.query(
            'SELECT count(*)::integer AS count FROM audit_compliance.synthetic_diagnostic_creations WHERE tenant_id=$1',
            [org],
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      await second.end();
    }
  });
  it.each(['revoke', 'demote'] as const)(
    'revalidates after the organization lock wait and observes %s',
    async (action) => {
      const blocker = await owner.pool.connect();
      let pending: Promise<unknown> | undefined;
      const work = jest.fn();
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
          [org],
        );
        pending = store.run(operation(), work);
        void pending.catch(() => {});
        let waiting = false;
        const limit = Date.now() + 1000;
        while (Date.now() < limit) {
          const locks = await owner.pool.query(
            "SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=$1 AND l.locktype='advisory' AND NOT l.granted",
            [role],
          );
          if (locks.rowCount) {
            waiting = true;
            break;
          }
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        expect(waiting).toBe(true);
        await blocker.query(
          action === 'revoke'
            ? 'UPDATE organization_access.memberships SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND actor_id=$2'
            : "UPDATE organization_access.memberships SET role='viewer' WHERE organization_id=$1 AND actor_id=$2",
          [org, actors[1]],
        );
        await blocker.query('COMMIT');
        await expect(pending).resolves.toEqual({ status: 'denied' });
        expect(work).not.toHaveBeenCalled();
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        if (pending) await pending.catch(() => {});
      }
    },
  );
  it('denies a viewer before contending for an already-held organization lock', async () => {
    const blocker = await owner.pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
        [org],
      );
      await expect(
        store.run(operation(2), async () => undefined),
      ).resolves.toEqual({ status: 'denied' });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
  });
  it('enforces the lock timeout and recovers without partial records', async () => {
    const blocker = await owner.pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
        [org],
      );
      await expect(execute()).rejects.toMatchObject({ code: '55P03' });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
    await expect(execute()).resolves.toMatchObject({ status: 'authorized' });
  });
  it('preserves the original callback error when a terminated backend makes rollback impossible', async () => {
    const pid = (await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0]
      .pid;
    const failure = new Error('synthetic-original-failure');
    await expect(
      store.run(operation(), async (transaction) => {
        await transaction.insertExecution({ batchId, diagnostic });
        await owner.pool.query('SELECT pg_terminate_backend($1)', [pid]);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(
      (await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
    ).not.toBe(pid);
    await expect(execute()).resolves.toMatchObject({ status: 'authorized' });
  });
  it('lets an authorized operation commit before a later revocation acquires its organization lock', async () => {
    const revoke = await owner.pool.connect();
    let lock: Promise<unknown> | undefined;
    const result = await store
      .run(operation(), async (transaction) => {
        const inserted = syntheticDiagnosticExecutionDetailSchema.parse(
          await transaction.insertExecution({ batchId, diagnostic }),
        );
        await transaction.recordCreation({
          executionId: inserted.id,
          requestId: randomUUID(),
        });
        await revoke.query('BEGIN');
        lock = revoke.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
          [org],
        );
        void lock.catch(() => {});
        const pid = revoke.processID;
        let waiting = false;
        const limit = Date.now() + 1000;
        while (Date.now() < limit) {
          const locks = await owner.pool.query(
            "SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted",
            [pid],
          );
          if (locks.rowCount) {
            waiting = true;
            break;
          }
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        expect(waiting).toBe(true);
        return inserted;
      })
      .finally(async () => {
        try {
          if (lock) {
            await lock;
            await revoke.query(
              'UPDATE organization_access.memberships SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND actor_id=$2',
              [org, actors[1]],
            );
            await revoke.query('COMMIT');
          }
        } finally {
          await revoke.query('ROLLBACK');
          revoke.release();
        }
      });
    expect(result.status).toBe('authorized');
    await expect(execute()).resolves.toEqual({ status: 'denied' });
    expect(
      (
        await owner.pool.query(
          'SELECT count(*)::integer AS count FROM audit_compliance.synthetic_diagnostic_creations WHERE tenant_id=$1',
          [org],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it('bounds a stalled callback and rolls back its writes when the connection is destroyed', async () => {
    await expect(
      store.run(operation(), async (transaction) => {
        const inserted = syntheticDiagnosticExecutionDetailSchema.parse(
          await transaction.insertExecution({ batchId, diagnostic }),
        );
        await transaction.recordCreation({
          executionId: inserted.id,
          requestId: randomUUID(),
        });
        return new Promise<never>(() => {});
      }),
    ).rejects.toThrow('deadline exceeded');
    expect(
      (
        await owner.pool.query(
          'SELECT count(*)::integer AS count FROM tax_intelligence.synthetic_diagnostic_runs WHERE tenant_id=$1',
          [org],
        )
      ).rows[0].count,
    ).toBe(0);
    await expect(execute()).resolves.toMatchObject({ status: 'authorized' });
  }, 15000);
});
