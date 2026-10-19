import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, type Database } from './index';

describe('Synthetic PostgreSQL RLS proof (not application isolation)', () => {
  const suffix = randomBytes(8).toString('hex');
  const schema = `rls_proof_${suffix}`;
  const login = `rls_runtime_${suffix}`;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const recordA = randomUUID();
  const recordB = randomUUID();
  let owner: Database;
  let runtime: Pool;
  let ownerName: string;
  let schemaCreated = false;
  let roleCreated = false;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error('Isolated TEST_DATABASE_URL ending in _test required');
    owner = createDatabase(url);
    await migrate(owner.db, {
      migrationsFolder: resolve(__dirname, '../migrations'),
    });
    ownerName = (
      await owner.pool.query<{ name: string }>('SELECT current_user AS name')
    ).rows[0]!.name;
    await owner.pool.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    const password = randomBytes(32).toString('hex');
    await owner.pool.query(
      `CREATE ROLE ${login} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`,
    );
    roleCreated = true;
    await owner.pool.query(`
      CREATE TABLE ${schema}.records (tenant_id uuid NOT NULL, id uuid NOT NULL, value integer NOT NULL, PRIMARY KEY (tenant_id,id));
      CREATE TABLE ${schema}.links (tenant_id uuid NOT NULL, id uuid NOT NULL, record_id uuid NOT NULL, PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,record_id) REFERENCES ${schema}.records(tenant_id,id));
      CREATE TABLE ${schema}.events (tenant_id uuid NOT NULL, id uuid NOT NULL, record_id uuid NOT NULL, PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,record_id) REFERENCES ${schema}.records(tenant_id,id));
      GRANT USAGE ON SCHEMA ${schema} TO ${login};
      GRANT SELECT,INSERT,UPDATE,DELETE ON ${schema}.records TO ${login};
      GRANT SELECT,INSERT ON ${schema}.links TO ${login};
      GRANT INSERT ON ${schema}.events TO ${login};
    `);
    await owner.pool.query(
      `INSERT INTO ${schema}.records VALUES ($1,$2,10),($3,$4,20)`,
      [tenantA, recordA, tenantB, recordB],
    );
    await owner.pool.query(
      `INSERT INTO ${schema}.links VALUES($1,$2,$3),($4,$5,$6)`,
      [tenantA, randomUUID(), recordA, tenantB, randomUUID(), recordB],
    );
    const connection = new URL(url);
    connection.username = login;
    connection.password = password;
    runtime = new Pool({
      connectionString: connection.href,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    const identity = await runtime.query<{
      name: string;
      superuser: boolean;
      bypass: boolean;
      create_role: boolean;
      create_db: boolean;
      replication: boolean;
      inherits: boolean;
      owner_member: boolean;
    }>(
      `SELECT current_user AS name, rolsuper AS superuser, rolbypassrls AS bypass, rolcreaterole AS create_role, rolcreatedb AS create_db, rolreplication AS replication, rolinherit AS inherits, pg_has_role(current_user,$1,'MEMBER') AS owner_member FROM pg_roles WHERE rolname=current_user`,
      [ownerName],
    );
    expect(identity.rows).toEqual([
      {
        name: login,
        superuser: false,
        bypass: false,
        create_role: false,
        create_db: false,
        replication: false,
        inherits: false,
        owner_member: false,
      },
    ]);
    expect(
      (
        await runtime.query(
          'SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)',
        )
      ).rows,
    ).toHaveLength(0);
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const privileges = await runtime.query<{ allowed: boolean }>(
        'SELECT has_table_privilege(current_user,$1,$2) AS allowed',
        [`${schema}.records`, privilege],
      );
      expect(privileges.rows[0]!.allowed).toBe(true);
    }
    const ownership = await owner.pool.query<{ owner: string }>(
      'SELECT tableowner AS owner FROM pg_tables WHERE schemaname=$1',
      [schema],
    );
    expect(ownership.rows).toHaveLength(3);
    expect(ownership.rows.every((row) => row.owner === ownerName)).toBe(true);
    const predicate =
      "tenant_id = nullif(current_setting('tax.tenant_id',true),'')::uuid";
    for (const table of ['records', 'links', 'events']) {
      await owner.pool.query(
        `ALTER TABLE ${schema}.${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${schema}.${table} FORCE ROW LEVEL SECURITY`,
      );
      if (table !== 'events')
        await owner.pool.query(
          `CREATE POLICY read_tenant ON ${schema}.${table} FOR SELECT TO ${login} USING (${predicate})`,
        );
      await owner.pool.query(
        `CREATE POLICY insert_tenant ON ${schema}.${table} FOR INSERT TO ${login} WITH CHECK (${predicate})`,
      );
    }
    await owner.pool.query(
      `CREATE POLICY update_tenant ON ${schema}.records FOR UPDATE TO ${login} USING (${predicate}) WITH CHECK (${predicate}); CREATE POLICY delete_tenant ON ${schema}.records FOR DELETE TO ${login} USING (${predicate})`,
    );
    console.info(
      `Synthetic RLS proof: PostgreSQL ${(await owner.pool.query<{ version: string }>("SELECT current_setting('server_version') AS version")).rows[0]!.version}; authenticated restricted runtime; test fixtures only`,
    );
  });

  beforeEach(async () => {
    const tables = await runtime.query<{
      enabled: boolean;
      forced: boolean;
      owner: string;
    }>(
      `SELECT c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'`,
      [schema],
    );
    expect(tables.rows).toHaveLength(3);
    for (const table of tables.rows)
      expect(table).toEqual({ enabled: true, forced: true, owner: ownerName });
    const policies = await runtime.query<{ roles: string[] }>(
      'SELECT roles::text[] AS roles FROM pg_policies WHERE schemaname=$1',
      [schema],
    );
    expect(policies.rows).toHaveLength(7);
    expect(
      policies.rows.every(
        (policy) => policy.roles.length === 1 && policy.roles[0] === login,
      ),
    ).toBe(true);
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      await runtime?.end();
    } catch (error) {
      errors.push(error);
    }
    if (owner) {
      if (schemaCreated) {
        try {
          await owner.pool.query(`DROP SCHEMA ${schema} CASCADE`);
        } catch (error) {
          errors.push(error);
        }
      }
      if (roleCreated) {
        try {
          await owner.pool.query(`DROP ROLE ${login}`);
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        expect(
          (
            await owner.pool.query(
              'SELECT 1 FROM pg_namespace WHERE nspname=$1',
              [schema],
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await owner.pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [
              login,
            ])
          ).rows,
        ).toHaveLength(0);
      } catch (error) {
        errors.push(error);
      }
      try {
        await owner.pool.end();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Synthetic RLS fixture cleanup failed');
  });

  async function transaction<T>(
    tenant: string | undefined,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await runtime.connect();
    let started = false;
    let discard = false;
    try {
      const baseline = await client.query<{ tenant: string | null }>(
        "SELECT nullif(current_setting('tax.tenant_id',true),'') AS tenant",
      );
      if (baseline.rows[0]!.tenant !== null)
        throw new Error('Contaminated synthetic connection');
      await client.query('BEGIN');
      started = true;
      if (tenant !== undefined)
        await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
          tenant,
        ]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (started) {
        try {
          await client.query('ROLLBACK');
        } catch {
          discard = true;
        }
      } else {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  it('RLS-01 restricts unfiltered reads, counts and known foreign IDs to A', async () => {
    await transaction(tenantA, async (client) => {
      expect(
        (await client.query(`SELECT tenant_id,id,value FROM ${schema}.records`))
          .rows,
      ).toEqual([{ tenant_id: tenantA, id: recordA, value: 10 }]);
      expect(
        (
          await client.query(
            `SELECT count(*)::integer AS count FROM ${schema}.records`,
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (
          await client.query(`SELECT id FROM ${schema}.records WHERE id=$1`, [
            recordB,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (await client.query(`SELECT record_id FROM ${schema}.links`)).rows,
      ).toEqual([{ record_id: recordA }]);
    });
  });
  it('RLS-03 rejects cross-tenant inserts and leaves no record or event', async () => {
    const added = randomUUID();
    await expect(
      transaction(tenantA, async (client) => {
        await client.query(`INSERT INTO ${schema}.records VALUES($1,$2,99)`, [
          tenantB,
          added,
        ]);
        await client.query(`INSERT INTO ${schema}.events VALUES($1,$2,$3)`, [
          tenantB,
          randomUUID(),
          added,
        ]);
      }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(
      (
        await owner.pool.query(`SELECT id FROM ${schema}.records WHERE id=$1`, [
          added,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await owner.pool.query(
          `SELECT id FROM ${schema}.events WHERE record_id=$1`,
          [added],
        )
      ).rows,
    ).toHaveLength(0);
    for (const table of ['links', 'events']) {
      const id = randomUUID();
      await expect(
        transaction(tenantA, (client) =>
          client.query(`INSERT INTO ${schema}.${table} VALUES($1,$2,$3)`, [
            tenantB,
            id,
            recordB,
          ]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (
          await owner.pool.query(
            `SELECT id FROM ${schema}.${table} WHERE id=$1`,
            [id],
          )
        ).rows,
      ).toHaveLength(0);
    }
  });
  it('RLS-02 denies missing, empty and malformed context without effects', async () => {
    for (const context of [undefined, '']) {
      await transaction(context, async (client) => {
        expect(
          (await client.query(`SELECT id FROM ${schema}.records`)).rows,
        ).toHaveLength(0);
        expect(
          (await client.query(`SELECT id FROM ${schema}.links`)).rows,
        ).toHaveLength(0);
        expect(
          (await client.query(`UPDATE ${schema}.records SET value=99`))
            .rowCount,
        ).toBe(0);
        expect(
          (await client.query(`DELETE FROM ${schema}.records`)).rowCount,
        ).toBe(0);
      });
      await expect(
        transaction(context, (client) =>
          client.query(`INSERT INTO ${schema}.records VALUES($1,$2,99)`, [
            tenantA,
            randomUUID(),
          ]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    }
    await expect(
      transaction(undefined, async (client) => {
        await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
          'invalid-uuid',
        ]);
        await client.query(`SELECT id FROM ${schema}.records`);
      }),
    ).rejects.toMatchObject({ code: '22P02' });
    expect(
      (
        await owner.pool.query(
          `SELECT value FROM ${schema}.records ORDER BY value`,
        )
      ).rows,
    ).toEqual([{ value: 10 }, { value: 20 }]);
  });
  it('RLS-04 permits matching writes but rejects tenant changes and foreign mutations', async () => {
    const rollback = new Error('Rollback matching write');
    await expect(
      transaction(tenantA, async (client) => {
        const added = randomUUID();
        expect(
          (
            await client.query(
              `INSERT INTO ${schema}.records VALUES($1,$2,30)`,
              [tenantA, added],
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await client.query(
              `INSERT INTO ${schema}.events VALUES($1,$2,$3)`,
              [tenantA, randomUUID(), added],
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await client.query(
              `UPDATE ${schema}.records SET value=11 WHERE id=$1 RETURNING value`,
              [recordA],
            )
          ).rows,
        ).toEqual([{ value: 11 }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    await expect(
      transaction(tenantA, async (client) => {
        expect(
          (
            await client.query(
              `UPDATE ${schema}.records SET value=99 WHERE id=$1`,
              [recordB],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (
            await client.query(`DELETE FROM ${schema}.records WHERE id=$1`, [
              recordB,
            ])
          ).rowCount,
        ).toBe(0);
        await client.query(
          `UPDATE ${schema}.records SET tenant_id=$1 WHERE id=$2`,
          [tenantB, recordA],
        );
      }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(
      (
        await owner.pool.query(
          `SELECT value FROM ${schema}.records ORDER BY value`,
        )
      ).rows,
    ).toEqual([{ value: 10 }, { value: 20 }]);
    expect(
      (await owner.pool.query(`SELECT id FROM ${schema}.events`)).rows,
    ).toHaveLength(0);
  });
  it('RLS-05 enforces the composite reference after passing the row policy', async () => {
    const rollback = new Error('Rollback matching reference');
    await expect(
      transaction(tenantA, async (client) => {
        expect(
          (
            await client.query(`INSERT INTO ${schema}.links VALUES($1,$2,$3)`, [
              tenantA,
              randomUUID(),
              recordA,
            ])
          ).rowCount,
        ).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    await expect(
      transaction(tenantA, (client) =>
        client.query(`INSERT INTO ${schema}.links VALUES($1,$2,$3)`, [
          tenantA,
          randomUUID(),
          recordB,
        ]),
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect(
      (await owner.pool.query(`SELECT id FROM ${schema}.links`)).rows,
    ).toHaveLength(2);
  });
  it('RLS-06 reuses one backend across commit, no context and tenant B', async () => {
    let pid: number;
    await transaction(tenantA, async (client) => {
      pid = (
        await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toEqual([{ id: recordA }]);
    });
    await transaction(undefined, async (client) => {
      expect(
        (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
      ).toBe(pid);
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toHaveLength(0);
    });
    await transaction(tenantB, async (client) => {
      expect(
        (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
      ).toBe(pid);
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toEqual([{ id: recordB }]);
    });
  });
  it('RLS-07 reuses the same backend cleanly after rollback and SQL error', async () => {
    const pid = (
      await runtime.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    ).rows[0]!.pid;
    const rollback = new Error('Controlled rollback');
    await expect(
      transaction(tenantA, async (client) => {
        await client.query(
          `UPDATE ${schema}.records SET value=99 WHERE id=$1`,
          [recordA],
        );
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    await expect(
      transaction(tenantA, (client) => client.query('SELECT 1/0')),
    ).rejects.toMatchObject({ code: '22012' });
    await transaction(undefined, async (client) => {
      expect(
        (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
      ).toBe(pid);
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toHaveLength(0);
    });
    await transaction(tenantB, async (client) => {
      expect(
        (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
      ).toBe(pid);
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toEqual([{ id: recordB }]);
    });
    expect(
      (
        await owner.pool.query(
          `SELECT value FROM ${schema}.records WHERE id=$1`,
          [recordA],
        )
      ).rows,
    ).toEqual([{ value: 10 }]);
  });
  it('RLS-10 rolls back a record change when the synthetic event cannot be written', async () => {
    expect(
      (
        await runtime.query<{ allowed: boolean }>(
          "SELECT has_table_privilege(current_user,$1,'INSERT') AS allowed",
          [`${schema}.events`],
        )
      ).rows[0]!.allowed,
    ).toBe(true);
    await owner.pool.query(`REVOKE INSERT ON ${schema}.events FROM ${login}`);
    try {
      await expect(
        transaction(tenantA, async (client) => {
          expect(
            (
              await client.query(
                `UPDATE ${schema}.records SET value=99 WHERE id=$1`,
                [recordA],
              )
            ).rowCount,
          ).toBe(1);
          await client.query(`INSERT INTO ${schema}.events VALUES($1,$2,$3)`, [
            tenantA,
            randomUUID(),
            recordA,
          ]);
        }),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (
          await owner.pool.query(
            `SELECT value FROM ${schema}.records WHERE id=$1`,
            [recordA],
          )
        ).rows,
      ).toEqual([{ value: 10 }]);
      expect(
        (await owner.pool.query(`SELECT id FROM ${schema}.events`)).rows,
      ).toHaveLength(0);
    } finally {
      await owner.pool.query(`GRANT INSERT ON ${schema}.events TO ${login}`);
    }
  });
  it('RLS-11 denies DDL, truncation, owner role and application schema access', async () => {
    const quotedOwner = `"${ownerName.replaceAll('"', '""')}"`;
    for (const sql of [
      `CREATE TABLE ${schema}.forbidden(id integer)`,
      `ALTER TABLE ${schema}.records DISABLE ROW LEVEL SECURITY`,
      `TRUNCATE ${schema}.records`,
      `SELECT * FROM ${schema}.events`,
      `SET LOCAL ROLE ${quotedOwner}`,
      'SELECT * FROM organization_access.memberships',
      'SELECT * FROM identity_access.actors',
      'SELECT * FROM auth_bff.sessions',
    ])
      await expect(
        transaction(undefined, (client) => client.query(sql)),
      ).rejects.toMatchObject({ code: '42501' });
  });
  it('RLS-12 documents that mutable settings do not authenticate the tenant', async () => {
    await transaction(tenantA, async (client) => {
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toEqual([{ id: recordA }]);
      await client.query("SELECT set_config('tax.tenant_id',$1,true)", [
        tenantB,
      ]);
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toEqual([{ id: recordB }]);
    });
  });
  it('RLS-08 rejects and discards session contamination before any work', async () => {
    const poisoned = await runtime.connect();
    const oldPid = (
      await poisoned.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    ).rows[0]!.pid;
    await poisoned.query("SELECT set_config('tax.tenant_id',$1,false)", [
      tenantA,
    ]);
    poisoned.release();
    let entered = false;
    await expect(
      transaction(undefined, async (client) => {
        entered = true;
        return client.query(`SELECT id FROM ${schema}.records`);
      }),
    ).rejects.toThrow('Contaminated synthetic connection');
    expect(entered).toBe(false);
    expect(
      (await runtime.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid,
    ).not.toBe(oldPid);
    await transaction(undefined, async (client) => {
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toHaveLength(0);
    });
    await transaction(tenantB, async (client) => {
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toEqual([{ id: recordB }]);
    });
  });
  it('RLS-09 discards its own closed connection when rollback cannot run', async () => {
    let oldPid: number;
    const closed = new Error('Synthetic connection deliberately closed');
    await expect(
      transaction(tenantA, async (client) => {
        oldPid = (
          await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]!.pid;
        await client.query(
          `UPDATE ${schema}.records SET value=99 WHERE id=$1`,
          [recordA],
        );
        await client.end();
        throw closed;
      }),
    ).rejects.toBe(closed);
    const newPid = (
      await runtime.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    ).rows[0]!.pid;
    expect(newPid).not.toBe(oldPid!);
    await transaction(undefined, async (client) => {
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toHaveLength(0);
    });
    await transaction(tenantB, async (client) => {
      expect(
        (await client.query(`SELECT id FROM ${schema}.records`)).rows,
      ).toEqual([{ id: recordB }]);
    });
    expect(
      (
        await owner.pool.query(
          `SELECT value FROM ${schema}.records WHERE id=$1`,
          [recordA],
        )
      ).rows,
    ).toEqual([{ value: 10 }]);
  });
});
