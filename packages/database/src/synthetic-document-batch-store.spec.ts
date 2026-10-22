import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { syntheticDocumentBatchReceiptSchema } from '@tax/contracts';
import {
  createDatabase,
  type Database,
  SyntheticDocumentBatchStore,
  MembershipRevocationStore,
  MembershipRoleStore,
} from './index';

describe('Synthetic batches with real restricted PostgreSQL runtime', () => {
  let owner: Database;
  let runtime: Pool;
  let store: SyntheticDocumentBatchStore;
  let runtimeConnection: string;
  const role = `batch_runtime_${randomBytes(8).toString('hex')}`;
  const org = randomUUID();
  const otherOrg = randomUUID();
  const actors = Array.from({ length: 5 }, () => randomUUID());
  const issuer = `https://${org}.example.invalid`;
  const input = {
    schemaVersion: 'synthetic-document-batch-v1' as const,
    documents: [
      {
        reference: 'demo-a',
        declaredTotalCents: 999,
        lineAmountsCents: [100, 200],
      },
      { reference: 'demo-b', declaredTotalCents: 0, lineAmountsCents: [0] },
    ],
  };
  const command = (index = 1, organizationId = org) => ({
    identity: { issuer, subject: actors[index]! },
    organizationId,
    input: structuredClone(input),
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
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
      `GRANT USAGE ON SCHEMA identity_access,organization_access,fiscal_compliance,audit_compliance TO ${role}`,
    );
    await owner.pool.query(
      `GRANT SELECT ON identity_access.actors,organization_access.memberships TO ${role}`,
    );
    await owner.pool.query(
      `GRANT SELECT,INSERT ON fiscal_compliance.synthetic_batches,fiscal_compliance.synthetic_documents,fiscal_compliance.synthetic_lines TO ${role}`,
    );
    await owner.pool.query(
      `GRANT INSERT(tenant_id,actor_id,batch_id,request_id) ON audit_compliance.synthetic_batch_creations TO ${role}`,
    );
    const connection = new URL(url);
    connection.username = role;
    connection.password = password;
    runtimeConnection = connection.href;
    runtime = new Pool({
      connectionString: connection.href,
      max: 1,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      application_name: role,
    });
    runtime.on('error', () => {});
    store = new SyntheticDocumentBatchStore(runtime);
    for (const id of [org, otherOrg])
      await owner.pool.query(
        'INSERT INTO organization_access.organizations VALUES($1,$2)',
        [id, 'Synthetic batch test'],
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
          index === 4 ? otherOrg : org,
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
    await owner.pool.query(
      'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
      [otherOrg, actors[1], 'analyst'],
    );
    const identity = await runtime.query(
      'SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit FROM pg_roles WHERE rolname=current_user',
    );
    expect(identity.rows).toEqual([
      {
        name: role,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolinherit: false,
      },
    ]);
  });

  beforeEach(async () => {
    await owner.pool.query(
      "UPDATE organization_access.memberships SET revoked_at=NULL,role=CASE actor_id WHEN $1::uuid THEN 'analyst' WHEN $2::uuid THEN 'viewer' WHEN $3::uuid THEN 'reviewer' ELSE 'organization_admin' END WHERE organization_id=ANY($4::uuid[])",
      [actors[1], actors[2], actors[3], [org, otherOrg]],
    );
  });
  afterEach(async () => {
    for (const table of [
      'fiscal_compliance.synthetic_lines',
      'fiscal_compliance.synthetic_documents',
      'audit_compliance.synthetic_batch_creations',
      'fiscal_compliance.synthetic_batches',
    ])
      await owner.pool.query(
        `DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,
        [[org, otherOrg]],
      );
  });
  afterAll(async () => {
    await runtime?.end();
    if (owner) {
      for (const table of [
        'membership_role_changes',
        'membership_revocations',
        'membership_grants',
        'memberships',
      ])
        await owner.pool.query(
          `DELETE FROM organization_access.${table} WHERE organization_id=ANY($1::uuid[])`,
          [[org, otherOrg]],
        );
      await owner.pool.query(
        'DELETE FROM organization_access.organizations WHERE id=ANY($1::uuid[])',
        [[org, otherOrg]],
      );
      await owner.pool.query(
        'DELETE FROM identity_access.actors WHERE id=ANY($1::uuid[])',
        [actors],
      );
      await owner.pool.query(
        `REVOKE INSERT(tenant_id,actor_id,batch_id,request_id) ON audit_compliance.synthetic_batch_creations FROM ${role}`,
      );
      await owner.pool.query(
        `REVOKE ALL ON fiscal_compliance.synthetic_batches,fiscal_compliance.synthetic_documents,fiscal_compliance.synthetic_lines,identity_access.actors,organization_access.memberships FROM ${role}`,
      );
      await owner.pool.query(
        `REVOKE ALL ON SCHEMA identity_access,organization_access,fiscal_compliance,audit_compliance FROM ${role}`,
      );
      await owner.pool.query(`DROP ROLE ${role}`);
      await owner.pool.end();
    }
  });

  it('accepts the dedicated runtime privilege profile and rejects the database owner', async () => {
    await expect(store.assertRuntimePrivileges()).resolves.toBeUndefined();
    await expect(
      new SyntheticDocumentBatchStore(owner.pool).assertRuntimePrivileges(),
    ).rejects.toThrow('Unsafe');
  });

  it('requires INSERT independently from SELECT in the runtime profile', async () => {
    await owner.pool.query(
      `REVOKE INSERT ON fiscal_compliance.synthetic_lines FROM ${role}`,
    );
    try {
      await expect(store.assertRuntimePrivileges()).rejects.toThrow('Unsafe');
    } finally {
      await owner.pool.query(
        `GRANT INSERT ON fiscal_compliance.synthetic_lines TO ${role}`,
      );
    }
    await expect(store.assertRuntimePrivileges()).resolves.toBeUndefined();
  });

  it('creates one normalized batch and an atomic minimal audit event', async () => {
    const cmd = command();
    const result = await store.create(cmd);
    expect(result.status).toBe('created');
    if (!('receipt' in result)) throw new Error('Batch creation missing');
    expect(syntheticDocumentBatchReceiptSchema.parse(result.receipt)).toEqual(
      result.receipt,
    );
    const records = await owner.pool.query(
      'SELECT document_count FROM fiscal_compliance.synthetic_batches WHERE tenant_id=$1',
      [org],
    );
    expect(records.rows).toEqual([{ document_count: 2 }]);
    const audit = await owner.pool.query(
      'SELECT tenant_id,batch_id,actor_id,request_id FROM audit_compliance.synthetic_batch_creations WHERE tenant_id=$1',
      [org],
    );
    expect(audit.rows).toEqual([
      {
        tenant_id: org,
        batch_id: result.receipt.id,
        actor_id: actors[1],
        request_id: cmd.requestId,
      },
    ]);
  });

  it('replays an equivalent command and conflicts on changed values or array order', async () => {
    const cmd = command();
    const first = await store.create(cmd);
    if (!('receipt' in first)) throw new Error('Creation missing');
    const equivalent = {
      ...cmd,
      organizationId: org.toUpperCase(),
      idempotencyKey: cmd.idempotencyKey.toUpperCase(),
      requestId: randomUUID(),
      input: {
        documents: cmd.input.documents.map((document) => ({
          lineAmountsCents: document.lineAmountsCents,
          reference: document.reference,
          declaredTotalCents: document.declaredTotalCents,
        })),
        schemaVersion: cmd.input.schemaVersion,
      },
    };
    expect(await store.create(equivalent)).toEqual({
      status: 'replayed',
      receipt: first.receipt,
    });
    for (const changed of [
      { ...cmd.input, documents: [...cmd.input.documents].reverse() },
      {
        ...cmd.input,
        documents: [
          { ...cmd.input.documents[0]!, lineAmountsCents: [200, 100] },
          cmd.input.documents[1]!,
        ],
      },
      {
        ...cmd.input,
        documents: [
          { ...cmd.input.documents[0]!, declaredTotalCents: 1000 },
          cmd.input.documents[1]!,
        ],
      },
    ])
      expect(await store.create({ ...cmd, input: changed })).toEqual({
        status: 'conflict',
      });
    const audit = await owner.pool.query(
      'SELECT request_id FROM audit_compliance.synthetic_batch_creations WHERE tenant_id=$1',
      [org],
    );
    expect(audit.rows).toEqual([{ request_id: cmd.requestId }]);
  });

  it('reads only a closed normalized batch and preserves divergent totals', async () => {
    const cmd = command();
    const result = await store.create(cmd);
    if (!('receipt' in result)) throw new Error('Creation missing');
    expect(await store.get({ ...cmd, batchId: result.receipt.id })).toEqual({
      status: 'found',
      batch: { ...result.receipt, documents: input.documents },
    });
  });

  const receipt = async (cmd = command()) => {
    const result = await store.create(cmd);
    if (!('receipt' in result)) throw new Error('Expected authorized creation');
    return result.receipt;
  };
  async function scoped(
    tenant: string | undefined,
    work: (client: PoolClient) => Promise<void>,
  ) {
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      if (tenant !== undefined)
        await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
          tenant,
        ]);
      await work(client);
    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  }
  async function blockedBy(
    blocker: number,
    application?: string,
  ): Promise<number> {
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
      const result = await owner.pool.query<{ pid: number }>(
        'SELECT pid FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid)) AND ($2::text IS NULL OR application_name=$2)',
        [blocker, application ?? null],
      );
      if (result.rows[0]) return result.rows[0].pid;
    }
    throw new Error('Expected real PostgreSQL lock wait');
  }

  it.each([0, 1])(
    'allows creation by administrator/analyst %s',
    async (actor) => {
      expect((await store.create(command(actor))).status).toBe('created');
    },
  );
  it('rejects unknown identities, foreign organizations, viewer/reviewer writes and revoked replay', async () => {
    for (const cmd of [
      command(2),
      command(3),
      command(4),
      { ...command(), identity: { issuer, subject: randomUUID() } },
      {
        ...command(),
        identity: { issuer: issuer + '/other', subject: actors[1]! },
      },
    ]) {
      expect(await store.create(cmd)).toEqual({ status: 'denied' });
    }
    const cmd = command();
    const batch = await receipt(cmd);
    for (const index of [0, 1, 2, 3])
      expect(
        (await store.get({ ...command(index), batchId: batch.id })).status,
      ).toBe('found');
    expect(
      await new MembershipRevocationStore(owner.pool).revoke({
        organizationId: org,
        initiatingActorId: actors[0]!,
        targetActorId: actors[1]!,
        requestId: randomUUID(),
      }),
    ).toBe('revoked');
    expect(await store.create(cmd)).toEqual({ status: 'denied' });
    expect(await store.get({ ...cmd, batchId: batch.id })).toEqual({
      status: 'denied',
    });
  });
  it('keeps resource IDs opaque across tenants and idempotency scoped by tenant and actor', async () => {
    const cmd = command();
    const a = await receipt(cmd);
    const b = await receipt({ ...cmd, organizationId: otherOrg });
    const otherActor = await receipt({ ...cmd, identity: command(0).identity });
    expect(new Set([a.id, b.id, otherActor.id]).size).toBe(3);
    expect(await store.get({ ...cmd, batchId: b.id })).toEqual({
      status: 'not_found',
    });
    expect(await store.get({ ...cmd, batchId: randomUUID() })).toEqual({
      status: 'not_found',
    });
    expect(await store.get({ ...command(4), batchId: a.id })).toEqual({
      status: 'denied',
    });
  });
  it('serializes duplicate commands on distinct authenticated backend connections', async () => {
    const second = new Pool({ connectionString: runtimeConnection, max: 1 });
    try {
      const pidA = (await runtime.query('SELECT pg_backend_pid() AS pid'))
        .rows[0].pid;
      const pidB = (await second.query('SELECT pg_backend_pid() AS pid'))
        .rows[0].pid;
      expect(pidA).not.toBe(pidB);
      const cmd = command();
      const results = await Promise.all([
        store.create(cmd),
        new SyntheticDocumentBatchStore(second).create(cmd),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([
        'created',
        'replayed',
      ]);
      expect(results[0]).toMatchObject({
        receipt: 'receipt' in results[1]! ? results[1].receipt : undefined,
      });
      expect(
        (
          await owner.pool.query(
            'SELECT 1 FROM audit_compliance.synthetic_batch_creations WHERE tenant_id=$1',
            [org],
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      await second.end();
    }
  });
  it('rolls all writes back when event insertion fails and reuses a clean connection', async () => {
    const pid = (await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0]
      .pid;
    await owner.pool.query(
      `REVOKE INSERT(tenant_id,actor_id,batch_id,request_id) ON audit_compliance.synthetic_batch_creations FROM ${role}`,
    );
    try {
      await expect(store.create(command())).rejects.toMatchObject({
        code: '42501',
      });
      for (const table of [
        'fiscal_compliance.synthetic_batches',
        'fiscal_compliance.synthetic_documents',
        'fiscal_compliance.synthetic_lines',
        'audit_compliance.synthetic_batch_creations',
      ])
        expect(
          (
            await owner.pool.query(
              `SELECT 1 FROM ${table} WHERE tenant_id=$1`,
              [org],
            )
          ).rows,
        ).toHaveLength(0);
      expect(
        (
          await runtime.query(
            "SELECT pg_backend_pid() AS pid,nullif(current_setting('tax.tenant_id',true),'') AS tenant",
          )
        ).rows,
      ).toEqual([{ pid, tenant: null }]);
    } finally {
      await owner.pool.query(
        `GRANT INSERT(tenant_id,actor_id,batch_id,request_id) ON audit_compliance.synthetic_batch_creations TO ${role}`,
      );
    }
    expect((await store.create(command())).status).toBe('created');
  });
  it('uses FORCE RLS for unfiltered reads, cross-tenant inserts and composite references', async () => {
    await receipt();
    const b = await receipt(command(1, otherOrg));
    const tables = await runtime.query(
      "SELECT c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ((n.nspname='fiscal_compliance' AND c.relname IN ('synthetic_batches','synthetic_documents','synthetic_lines')) OR (n.nspname='audit_compliance' AND c.relname='synthetic_batch_creations')) AND c.relkind='r'",
    );
    expect(tables.rows).toHaveLength(4);
    for (const table of tables.rows) {
      expect(table).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
      expect(table.owner).not.toBe(role);
    }
    expect(
      (
        await runtime.query(
          'SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)',
        )
      ).rows,
    ).toHaveLength(0);
    for (const table of [
      'synthetic_batches',
      'synthetic_documents',
      'synthetic_lines',
    ])
      expect(
        (await runtime.query(`SELECT * FROM fiscal_compliance.${table}`)).rows,
      ).toHaveLength(0);
    await scoped(org, async (client) => {
      expect(
        (
          await client.query(
            'SELECT tenant_id FROM fiscal_compliance.synthetic_batches',
          )
        ).rows,
      ).toEqual([{ tenant_id: org }]);
      expect(
        (
          await client.query(
            'SELECT * FROM fiscal_compliance.synthetic_documents',
          )
        ).rows,
      ).toHaveLength(2);
      expect(
        (await client.query('SELECT * FROM fiscal_compliance.synthetic_lines'))
          .rows,
      ).toHaveLength(3);
      expect(
        (
          await client.query(
            'SELECT id FROM fiscal_compliance.synthetic_batches WHERE id=$1',
            [b.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
    await expect(
      scoped(org, async (client) => {
        await client.query(
          'INSERT INTO fiscal_compliance.synthetic_batches(tenant_id,actor_id,idempotency_key,document_count) VALUES($1,$2,$3,1)',
          [otherOrg, actors[1], randomUUID()],
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      scoped(org, async (client) => {
        await client.query(
          'INSERT INTO fiscal_compliance.synthetic_documents VALUES($1,$2,1,$3,0,1)',
          [org, b.id, 'cross-tenant'],
        );
      }),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      scoped(org, async (client) => {
        await client.query(
          'INSERT INTO audit_compliance.synthetic_batch_creations(tenant_id,actor_id,batch_id,request_id) VALUES($1,$2,$3,$4)',
          [otherOrg, actors[1], b.id, randomUUID()],
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('fails closed without context, with empty context or malformed UUID context', async () => {
    await receipt();
    for (const tenant of [undefined, '']) {
      await scoped(tenant, async (client) =>
        expect(
          (
            await client.query(
              'SELECT * FROM fiscal_compliance.synthetic_batches',
            )
          ).rows,
        ).toHaveLength(0),
      );
      await expect(
        scoped(tenant, async (client) => {
          await client.query(
            'INSERT INTO fiscal_compliance.synthetic_batches(tenant_id,actor_id,idempotency_key,document_count) VALUES($1,$2,$3,1)',
            [org, actors[1], randomUUID()],
          );
        }),
      ).rejects.toMatchObject({ code: '42501' });
    }
    await expect(
      scoped('invalid', async (client) => {
        await client.query('SELECT * FROM fiscal_compliance.synthetic_batches');
      }),
    ).rejects.toMatchObject({ code: '22P02' });
  });
  it('denies DDL, membership mutation, audit reads and changes to domain data', async () => {
    await receipt();
    for (const sql of [
      'UPDATE fiscal_compliance.synthetic_batches SET document_count=1',
      'DELETE FROM fiscal_compliance.synthetic_documents',
      'TRUNCATE fiscal_compliance.synthetic_lines',
      'SELECT * FROM audit_compliance.synthetic_batch_creations',
      'UPDATE audit_compliance.synthetic_batch_creations SET request_id=request_id',
      'DELETE FROM audit_compliance.synthetic_batch_creations',
      'TRUNCATE audit_compliance.synthetic_batch_creations',
      'UPDATE organization_access.memberships SET revoked_at=NULL',
      'DELETE FROM organization_access.memberships',
      'SELECT * FROM auth_bff.entries',
      'ALTER TABLE fiscal_compliance.synthetic_batches DISABLE ROW LEVEL SECURITY',
      'CREATE TABLE fiscal_compliance.unexpected(id integer)',
    ])
      await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
  });
  it('detects incomplete aggregates before returning or replaying them', async () => {
    const cmd = command();
    const batch = await receipt(cmd);
    await owner.pool.query(
      'DELETE FROM fiscal_compliance.synthetic_lines WHERE tenant_id=$1 AND batch_id=$2 AND document_ordinal=1 AND ordinal=1',
      [org, batch.id],
    );
    await expect(store.get({ ...cmd, batchId: batch.id })).rejects.toThrow(
      'Incomplete synthetic document',
    );
    await expect(store.create(cmd)).rejects.toThrow(
      'Incomplete synthetic document',
    );
    await owner.pool.query(
      'DELETE FROM fiscal_compliance.synthetic_lines WHERE tenant_id=$1 AND batch_id=$2',
      [org, batch.id],
    );
    await owner.pool.query(
      'DELETE FROM fiscal_compliance.synthetic_documents WHERE tenant_id=$1 AND batch_id=$2',
      [org, batch.id],
    );
    await expect(store.get({ ...cmd, batchId: batch.id })).rejects.toThrow(
      'Incomplete synthetic batch',
    );
  });
  it('discards a connection contaminated by a session-level tenant setting', async () => {
    const client = await runtime.connect();
    const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0]
      .pid;
    await client.query("SELECT set_config('tax.tenant_id',$1,false)", [org]);
    client.release();
    await expect(store.create(command())).rejects.toThrow(
      'Contaminated batch connection',
    );
    expect(
      (
        await runtime.query(
          "SELECT pg_backend_pid() AS pid,nullif(current_setting('tax.tenant_id',true),'') AS tenant",
        )
      ).rows[0],
    ).toMatchObject({ tenant: null });
    expect(
      (await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
    ).not.toBe(pid);
    expect((await store.create(command(1, otherOrg))).status).toBe('created');
  });

  it('rejects an unauthorized write before contending for the organization lock', async () => {
    const holder = await owner.pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
        [org],
      );
      expect(await store.create(command(2))).toEqual({ status: 'denied' });
      expect(
        (
          await owner.pool.query(
            'SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND cardinality(pg_blocking_pids(pid))>0',
            [role],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
  it.each(['revoke', 'demote'] as const)(
    'revalidates after an actual administrative %s held the shared lock',
    async (action) => {
      const holder = await owner.pool.connect();
      let administrative: Promise<unknown> | undefined;
      let operation: Promise<unknown> | undefined;
      try {
        await holder.query('BEGIN');
        const pid = (await holder.query('SELECT pg_backend_pid() AS pid'))
          .rows[0].pid;
        await holder.query(
          'SELECT actor_id FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 FOR UPDATE',
          [org, actors[1]],
        );
        const administrativeCommand = {
          organizationId: org,
          initiatingActorId: actors[0]!,
          targetActorId: actors[1]!,
          requestId: randomUUID(),
        };
        administrative =
          action === 'revoke'
            ? new MembershipRevocationStore(owner.pool).revoke(
                administrativeCommand,
              )
            : new MembershipRoleStore(owner.pool).changeRole({
                ...administrativeCommand,
                role: 'viewer',
              });
        administrative.catch(() => {});
        const administrativePid = await blockedBy(pid);
        operation = store.create(command());
        operation.catch(() => {});
        await blockedBy(administrativePid, role);
        await holder.query('COMMIT');
        expect(await administrative).toBe(
          action === 'revoke' ? 'revoked' : 'changed',
        );
        expect(await operation).toEqual({ status: 'denied' });
        expect(
          (
            await owner.pool.query(
              'SELECT 1 FROM fiscal_compliance.synthetic_batches WHERE tenant_id=$1',
              [org],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
        await Promise.allSettled([administrative, operation]);
      }
    },
  );
  it('commits an authorized write before the waiting administrative revocation', async () => {
    const holder = await owner.pool.connect();
    let operation:
      Promise<Awaited<ReturnType<typeof store.create>>> | undefined;
    let revocation: Promise<unknown> | undefined;
    const cmd = command();
    try {
      await holder.query('BEGIN');
      const pid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0]
        .pid;
      await holder.query(
        'LOCK TABLE audit_compliance.synthetic_batch_creations IN ACCESS EXCLUSIVE MODE',
      );
      operation = store.create(cmd);
      operation.catch(() => {});
      const operationPid = await blockedBy(pid, role);
      revocation = new MembershipRevocationStore(owner.pool).revoke({
        organizationId: org,
        initiatingActorId: actors[0]!,
        targetActorId: actors[1]!,
        requestId: randomUUID(),
      });
      revocation.catch(() => {});
      await blockedBy(operationPid);
      await holder.query('COMMIT');
      const result = await operation;
      expect(result.status).toBe('created');
      expect(await revocation).toBe('revoked');
      if (!('receipt' in result)) throw new Error('Creation missing');
      expect(await store.get({ ...cmd, batchId: result.receipt.id })).toEqual({
        status: 'denied',
      });
      expect(
        (
          await owner.pool.query(
            'SELECT 1 FROM audit_compliance.synthetic_batch_creations WHERE tenant_id=$1',
            [org],
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
      await Promise.allSettled([operation, revocation]);
    }
  });
  it('preserves the original database error and discards a terminated own connection when rollback is impossible', async () => {
    const holder = await owner.pool.connect();
    let operation: Promise<unknown> | undefined;
    let failedPid: number | undefined;
    try {
      await holder.query('BEGIN');
      const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid'))
        .rows[0].pid;
      await holder.query(
        'LOCK TABLE audit_compliance.synthetic_batch_creations IN ACCESS EXCLUSIVE MODE',
      );
      operation = store.create(command());
      operation.catch(() => {});
      failedPid = await blockedBy(holderPid, role);
      const terminated = await owner.pool.query(
        'SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND application_name=$2 AND usename=$2',
        [failedPid, role],
      );
      expect(terminated.rows).toEqual([{ terminated: true }]);
      await expect(operation).rejects.toMatchObject({ code: '57P01' });
      await holder.query('COMMIT');
      expect(
        (
          await runtime.query(
            "SELECT pg_backend_pid() AS pid,nullif(current_setting('tax.tenant_id',true),'') AS tenant",
          )
        ).rows[0],
      ).toMatchObject({ tenant: null });
      expect(
        (await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
      ).not.toBe(failedPid);
      expect(
        (
          await owner.pool.query(
            'SELECT 1 FROM fiscal_compliance.synthetic_batches WHERE tenant_id=$1',
            [org],
          )
        ).rows,
      ).toHaveLength(0);
      expect((await store.create(command(1, otherOrg))).status).toBe('created');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
      await Promise.allSettled([operation]);
    }
  });
  it('enforces document/line bounds, unique references and composite audit identity', async () => {
    const batch = await receipt();
    const b = await receipt(command(1, otherOrg));
    for (const sql of [
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_documents VALUES($1,$2,3,$3,-1,1)',
        values: [org, batch.id, 'negative'],
        code: '23514',
      },
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_documents VALUES($1,$2,3,$3,1000000001,1)',
        values: [org, batch.id, 'overflow'],
        code: '23514',
      },
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_documents VALUES($1,$2,11,$3,0,1)',
        values: [org, batch.id, 'ordinal'],
        code: '23514',
      },
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_documents VALUES($1,$2,3,$3,0,1)',
        values: [org, batch.id, 'demo-a'],
        code: '23505',
      },
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_lines VALUES($1,$2,1,3,-1)',
        values: [org, batch.id],
        code: '23514',
      },
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_lines VALUES($1,$2,3,1,0)',
        values: [org, batch.id],
        code: '23503',
      },
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_lines VALUES($1,$2,1,3,1000000001)',
        values: [org, batch.id],
        code: '23514',
      },
      {
        query:
          'INSERT INTO fiscal_compliance.synthetic_documents VALUES($1,$2,1,$3,0,1)',
        values: [org, b.id, 'cross'],
        code: '23503',
      },
    ])
      await expect(
        scoped(org, async (client) => {
          await client.query(sql.query, sql.values);
        }),
      ).rejects.toMatchObject({ code: sql.code });
    const unauditedId = randomUUID();
    await owner.pool.query(
      'INSERT INTO fiscal_compliance.synthetic_batches(tenant_id,id,actor_id,idempotency_key,document_count) VALUES($1,$2,$3,$4,1)',
      [org, unauditedId, actors[1], randomUUID()],
    );
    await expect(
      scoped(org, async (client) => {
        await client.query(
          'INSERT INTO audit_compliance.synthetic_batch_creations(tenant_id,actor_id,batch_id,request_id) VALUES($1,$2,$3,$4)',
          [org, actors[0], unauditedId, randomUUID()],
        );
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('keeps context clean across commit, reads, denial and tenant changes on one PID', async () => {
    const pid = (await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0]
      .pid;
    const a = await receipt();
    const b = await receipt(command(1, otherOrg));
    expect((await store.get({ ...command(), batchId: a.id })).status).toBe(
      'found',
    );
    expect(
      (await store.get({ ...command(1, otherOrg), batchId: b.id })).status,
    ).toBe('found');
    expect(await store.create(command(2))).toEqual({ status: 'denied' });
    expect(
      (
        await runtime.query(
          "SELECT pg_backend_pid() AS pid,nullif(current_setting('tax.tenant_id',true),'') AS tenant",
        )
      ).rows,
    ).toEqual([{ pid, tenant: null }]);
    expect(
      (await runtime.query('SELECT * FROM fiscal_compliance.synthetic_batches'))
        .rows,
    ).toHaveLength(0);
  });
  it('records mutable SQL context as a limitation rather than claiming it authenticates the actor', async () => {
    const b = await receipt(command(1, otherOrg));
    await scoped(org, async (client) => {
      await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
        otherOrg,
      ]);
      expect(
        (
          await client.query(
            'SELECT id FROM fiscal_compliance.synthetic_batches',
          )
        ).rows,
      ).toEqual([{ id: b.id }]);
    });
  });
  it('treats negative zero as the same canonical JSON command as zero', async () => {
    const cmd = {
      ...command(),
      input: {
        schemaVersion: input.schemaVersion,
        documents: [
          { reference: 'zero', declaredTotalCents: -0, lineAmountsCents: [-0] },
        ],
      },
    };
    const first = await receipt(cmd);
    expect(await store.create(cmd)).toEqual({
      status: 'replayed',
      receipt: first,
    });
    expect(
      await store.create({
        ...cmd,
        input: {
          ...cmd.input,
          documents: [
            { reference: 'zero', declaredTotalCents: 0, lineAmountsCents: [0] },
          ],
        },
      }),
    ).toEqual({ status: 'replayed', receipt: first });
  });
  it('applies the additive migration idempotently without changing existing rows', async () => {
    const batch = await receipt();
    await migrate(owner.db, {
      migrationsFolder: resolve(__dirname, '../migrations'),
    });
    expect((await store.get({ ...command(), batchId: batch.id })).status).toBe(
      'found',
    );
  });
});
