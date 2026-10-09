import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createDatabase,
  type Database,
  MembershipRevocationStore,
  MembershipStore,
} from './index';
describe('Transactional membership revocation with restricted PostgreSQL runtime', () => {
  let owner: Database;
  let runtime: Database;
  let store: MembershipRevocationStore;
  const role = `revocation_test_${randomBytes(8).toString('hex')}`;
  let org: string;
  let otherOrg: string;
  let actors: string[];
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
      `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`,
    );
    await owner.pool.query(
      `GRANT USAGE ON SCHEMA identity_access, organization_access TO ${role}`,
    );
    await owner.pool.query(
      `GRANT SELECT ON identity_access.actors, organization_access.organizations, organization_access.memberships TO ${role}`,
    );
    await owner.pool.query(
      `GRANT UPDATE(revoked_at) ON organization_access.memberships TO ${role}`,
    );
    await owner.pool.query(
      `GRANT INSERT ON organization_access.membership_revocations TO ${role}`,
    );
    const connection = new URL(url);
    connection.username = role;
    connection.password = password;
    runtime = createDatabase(connection.href);
    store = new MembershipRevocationStore(runtime.pool);
  });
  beforeEach(async () => {
    org = randomUUID();
    otherOrg = randomUUID();
    actors = Array.from({ length: 4 }, () => randomUUID());
    for (const actor of actors)
      await owner.pool.query(
        'INSERT INTO identity_access.actors VALUES($1,$2,$3)',
        [actor, `https://${org}.example.invalid`, actor],
      );
    for (const id of [org, otherOrg])
      await owner.pool.query(
        'INSERT INTO organization_access.organizations VALUES($1,$2)',
        [id, 'Synthetic'],
      );
    for (const [index, actor] of actors.entries())
      await owner.pool.query(
        'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
        [
          index === 3 ? otherOrg : org,
          actor,
          index === 2 ? 'viewer' : 'organization_admin',
        ],
      );
  });
  afterEach(async () => {
    await owner.pool.query(
      'DELETE FROM organization_access.membership_revocations WHERE organization_id=ANY($1::uuid[])',
      [[org, otherOrg]],
    );
    await owner.pool.query(
      'DELETE FROM organization_access.memberships WHERE organization_id=ANY($1::uuid[])',
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
  });
  afterAll(async () => {
    await runtime?.pool.end();
    if (owner) {
      await owner.pool.query(`DROP OWNED BY ${role}`);
      await owner.pool.query(`DROP ROLE ${role}`);
      await owner.pool.end();
    }
  });
  const command = (
    initiatingActorId = actors[0]!,
    targetActorId = actors[2]!,
    organizationId = org,
  ) => ({
    organizationId,
    initiatingActorId,
    targetActorId,
    requestId: randomUUID(),
  });
  const audit = () =>
    owner.pool.query(
      'SELECT * FROM organization_access.membership_revocations WHERE organization_id=$1',
      [org],
    );
  it('revokes and records verified actors and correlation atomically; retries do not duplicate events', async () => {
    const input = command();
    expect(await store.revoke(input)).toBe('revoked');
    expect(
      await new MembershipStore(runtime.pool).get(actors[2]!, org),
    ).toBeUndefined();
    const events = await audit();
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toMatchObject({
      organization_id: org,
      initiating_actor_id: actors[0],
      target_actor_id: actors[2],
      request_id: input.requestId,
      previous_role: 'viewer',
    });
    expect(await store.revoke(command())).toBe('unchanged');
    expect(await store.revoke(command(actors[0], randomUUID()))).toBe(
      'unchanged',
    );
    expect((await audit()).rows).toHaveLength(1);
  });
  it.each(['viewer', 'other organization', 'unprovisioned', 'revoked'])(
    'denies %s without effects',
    async (kind) => {
      const initiator =
        kind === 'viewer'
          ? actors[2]
          : kind === 'other organization'
            ? actors[3]
            : kind === 'unprovisioned'
              ? randomUUID()
              : actors[0];
      if (kind === 'revoked')
        await owner.pool.query(
          'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
          [org, initiator],
        );
      expect(await store.revoke(command(initiator))).toBe('denied');
      expect((await audit()).rows).toHaveLength(0);
      expect(
        await new MembershipStore(runtime.pool).get(actors[2]!, org),
      ).toBeDefined();
    },
  );
  it('protects the last administrator and allows self revocation when another remains', async () => {
    expect(await store.revoke(command(actors[0], actors[0]))).toBe('revoked');
    expect(await store.revoke(command(actors[1], actors[1]))).toBe(
      'last_admin',
    );
    expect((await audit()).rows).toHaveLength(1);
    expect(await store.revoke(command(actors[0], actors[2]))).toBe('denied');
  });
  it('rolls back revoked_at when audit insert fails and keeps the pool usable', async () => {
    await owner.pool.query(
      `REVOKE INSERT ON organization_access.membership_revocations FROM ${role}`,
    );
    try {
      await expect(store.revoke(command())).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await owner.pool.query(
        `GRANT INSERT ON organization_access.membership_revocations TO ${role}`,
      );
    }
    expect(
      await new MembershipStore(runtime.pool).get(actors[2]!, org),
    ).toBeDefined();
    expect((await audit()).rows).toHaveLength(0);
    expect(await store.revoke(command())).toBe('revoked');
  });
  it('never grants role changes, membership creation, audit reads or audit mutation', async () => {
    const ownership = await runtime.pool.query(
      "SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname IN ('identity_access','organization_access') AND tableowner=current_user",
    );
    expect(ownership.rows).toEqual([{ count: 0 }]);
    expect(
      (
        await runtime.pool.query(
          'SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
        )
      ).rows,
    ).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    for (const sql of [
      'UPDATE organization_access.memberships SET role=role',
      'DELETE FROM organization_access.memberships',
      'SELECT * FROM organization_access.membership_revocations',
      'UPDATE organization_access.membership_revocations SET request_id=request_id',
      'DELETE FROM organization_access.membership_revocations',
      'TRUNCATE organization_access.membership_revocations',
      'SELECT * FROM auth_bff.entries',
    ])
      await expect(runtime.pool.query(sql)).rejects.toMatchObject({
        code: '42501',
      });
    await expect(
      runtime.pool.query(
        'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
        [org, actors[3], 'viewer'],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('serializes simultaneous administrator revocations so one administrator remains', async () => {
    const results = await Promise.all([
      store.revoke(command(actors[0], actors[0])),
      store.revoke(command(actors[1], actors[1])),
    ]);
    expect(results.sort()).toEqual(['last_admin', 'revoked']);
    const active = await owner.pool.query(
      "SELECT count(*)::integer AS count FROM organization_access.memberships WHERE organization_id=$1 AND role='organization_admin' AND revoked_at IS NULL",
      [org],
    );
    expect(active.rows[0].count).toBe(1);
    expect((await audit()).rows).toHaveLength(1);
  });
  it('records one event when the same target is revoked concurrently', async () => {
    expect(
      (
        await Promise.all([store.revoke(command()), store.revoke(command())])
      ).sort(),
    ).toEqual(['revoked', 'unchanged']);
    expect((await audit()).rows).toHaveLength(1);
  });
  it('waits for an authorized operation holding the target membership and denies later reads', async () => {
    const holder = await owner.pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT actor_id FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 FOR SHARE',
        [org, actors[2]],
      );
      pending = store.revoke(command());
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await owner.pool.query(
          'SELECT count(*)::integer AS count FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0',
          [role],
        );
        if (waiting.rows[0].count > 0) {
          blocked = true;
          break;
        }
      }
      expect(blocked).toBe(true);
      expect((await audit()).rows).toHaveLength(0);
      await holder.query('COMMIT');
      expect(await pending).toBe('revoked');
      expect(
        await new MembershipStore(runtime.pool).get(actors[2]!, org),
      ).toBeUndefined();
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
      await pending;
    }
  });
  it('canonicalizes the organization lock and releases it after a timeout', async () => {
    const holder = await owner.pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
        [org],
      );
      await expect(
        store.revoke(command(actors[0], actors[2], org.toUpperCase())),
      ).rejects.toMatchObject({ code: '55P03' });
      expect((await audit()).rows).toHaveLength(0);
      expect(
        await new MembershipStore(runtime.pool).get(actors[2]!, org),
      ).toBeDefined();
      await holder.query('ROLLBACK');
      expect(await store.revoke(command())).toBe('revoked');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
  it('rechecks initiating administrator after waiting for a concurrent revocation', async () => {
    const holder = await owner.pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
        [org],
      );
      pending = store.revoke(command());
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await owner.pool.query(
          'SELECT count(*)::integer AS count FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0',
          [role],
        );
        if (waiting.rows[0].count > 0) {
          blocked = true;
          break;
        }
      }
      expect(blocked).toBe(true);
      await holder.query(
        'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
        [org, actors[0]],
      );
      await holder.query('COMMIT');
      expect(await pending).toBe('denied');
      expect((await audit()).rows).toHaveLength(0);
      expect(
        await new MembershipStore(runtime.pool).get(actors[2]!, org),
      ).toBeDefined();
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
      await pending;
    }
  });
  it('rejects audit references to memberships in a different organization', async () => {
    await expect(
      owner.pool.query(
        'INSERT INTO organization_access.membership_revocations(organization_id,initiating_actor_id,target_actor_id,previous_role,request_id) VALUES($1,$2,$3,$4,$5)',
        [org, actors[0], actors[3], 'viewer', randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect((await audit()).rows).toHaveLength(0);
  });
});
