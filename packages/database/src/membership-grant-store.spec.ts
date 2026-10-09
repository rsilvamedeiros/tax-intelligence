import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createDatabase,
  type Database,
  MembershipGrantStore,
  MembershipRevocationStore,
  MembershipStore,
} from './index';
describe('Atomic membership grants with restricted runtime', () => {
  let owner: Database;
  let runtime: Database;
  let grants: MembershipGrantStore;
  const login = `membership_grant_test_${randomBytes(8).toString('hex')}`;
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
      `CREATE ROLE ${login} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`,
    );
    await owner.pool.query(
      `GRANT USAGE ON SCHEMA identity_access,organization_access TO ${login}`,
    );
    await owner.pool.query(
      `GRANT SELECT ON identity_access.actors,organization_access.organizations,organization_access.memberships TO ${login}`,
    );
    await owner.pool.query(
      `GRANT UPDATE(role,revoked_at) ON organization_access.memberships TO ${login}`,
    );
    await owner.pool.query(
      `GRANT INSERT ON organization_access.membership_grants,organization_access.membership_revocations TO ${login}`,
    );
    await owner.pool.query(
      `GRANT INSERT(organization_id,actor_id,role) ON organization_access.memberships TO ${login}`,
    );
    const connection = new URL(url);
    connection.username = login;
    connection.password = password;
    runtime = createDatabase(connection.href);
    grants = new MembershipGrantStore(runtime.pool);
  });
  beforeEach(async () => {
    org = randomUUID();
    otherOrg = randomUUID();
    actors = Array.from({ length: 5 }, () => randomUUID());
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
    for (const [i, actor] of actors.slice(0, 4).entries())
      await owner.pool.query(
        'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
        [
          i === 3 ? otherOrg : org,
          actor,
          i === 2 ? 'viewer' : 'organization_admin',
        ],
      );
  });
  afterEach(async () => {
    for (const table of [
      'membership_grants',
      'membership_role_changes',
      'membership_revocations',
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
  });
  afterAll(async () => {
    await runtime?.pool.end();
    if (owner) {
      await owner.pool.query(`DROP OWNED BY ${login}`);
      await owner.pool.query(`DROP ROLE ${login}`);
      await owner.pool.end();
    }
  });
  const command = (
    initiatingActorId = actors[0]!,
    targetActorId = actors[4]!,
    role = 'analyst',
  ) => ({
    organizationId: org,
    initiatingActorId,
    targetActorId,
    role,
    requestId: randomUUID(),
  });
  const audit = () =>
    owner.pool.query(
      'SELECT * FROM organization_access.membership_grants WHERE organization_id=$1',
      [org],
    );
  it.each(['organization_admin', 'analyst', 'reviewer', 'viewer'])(
    'grants %s atomically and leaves retry unchanged',
    async (role) => {
      const input = command(actors[0], actors[4], role);
      expect(await grants.grant(input)).toBe('granted');
      expect(
        (await new MembershipStore(runtime.pool).get(actors[4]!, org))?.role,
      ).toBe(role);
      expect((await audit()).rows).toMatchObject([
        {
          organization_id: org,
          initiating_actor_id: actors[0],
          target_actor_id: actors[4],
          granted_role: role,
          request_id: input.requestId,
        },
      ]);
      expect(await grants.grant(input)).toBe('unchanged');
      expect((await audit()).rows).toHaveLength(1);
    },
  );
  it.each([0, 1, 2, 3])(
    'denies untrusted administrator case %s before target disclosure',
    async (variant) => {
      if (variant === 0)
        await owner.pool.query(
          'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
          [org, actors[0]],
        );
      const initiating =
        variant === 0
          ? actors[0]
          : variant === 1
            ? actors[2]
            : variant === 2
              ? actors[3]
              : randomUUID();
      expect(await grants.grant(command(initiating, randomUUID()))).toBe(
        'denied',
      );
      expect((await audit()).rows).toHaveLength(0);
    },
  );
  it('reports absent actor only to an authorized administrator', async () => {
    expect(await grants.grant(command(actors[0], randomUUID()))).toBe(
      'not_found',
    );
    expect((await audit()).rows).toHaveLength(0);
  });
  it('preserves existing roles and accepts identical existing membership without audit', async () => {
    expect(await grants.grant(command(actors[0], actors[2], 'viewer'))).toBe(
      'unchanged',
    );
    expect(await grants.grant(command(actors[0], actors[2], 'analyst'))).toBe(
      'conflict',
    );
    expect(
      (await new MembershipStore(runtime.pool).get(actors[2]!, org))?.role,
    ).toBe('viewer');
    expect((await audit()).rows).toHaveLength(0);
  });
  it('never reactivates a revoked membership', async () => {
    await owner.pool.query(
      'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
      [org, actors[2]],
    );
    expect(await grants.grant(command(actors[0], actors[2], 'viewer'))).toBe(
      'conflict',
    );
    expect(
      await new MembershipStore(runtime.pool).get(actors[2]!, org),
    ).toBeUndefined();
    expect((await audit()).rows).toHaveLength(0);
  });
  it('rolls back membership when audit insertion fails', async () => {
    await owner.pool.query(
      `REVOKE INSERT ON organization_access.membership_grants FROM ${login}`,
    );
    try {
      await expect(grants.grant(command())).rejects.toMatchObject({
        code: '42501',
      });
      expect(
        await new MembershipStore(runtime.pool).get(actors[4]!, org),
      ).toBeUndefined();
      expect((await audit()).rows).toHaveLength(0);
    } finally {
      await owner.pool.query(
        `GRANT INSERT ON organization_access.membership_grants TO ${login}`,
      );
    }
  });
  it.each([false, true])(
    'serializes simultaneous grants with differing roles %s',
    async (different) => {
      const results = await Promise.all([
        grants.grant(command()),
        grants.grant(
          command(actors[1], actors[4], different ? 'viewer' : 'analyst'),
        ),
      ]);
      expect(results.sort()).toEqual(
        (different ? ['granted', 'conflict'] : ['granted', 'unchanged']).sort(),
      );
      expect((await audit()).rows).toHaveLength(1);
    },
  );
  it('preserves SQL privileges and audit integrity', async () => {
    await expect(
      runtime.pool.query(
        'INSERT INTO organization_access.memberships(organization_id,actor_id,role,revoked_at) VALUES($1,$2,$3,NULL)',
        [org, actors[4], 'viewer'],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    for (const sql of [
      'SELECT * FROM organization_access.membership_grants',
      'UPDATE organization_access.membership_grants SET granted_role=granted_role',
      'DELETE FROM organization_access.membership_grants',
      'TRUNCATE organization_access.membership_grants',
      'DELETE FROM organization_access.memberships',
      "INSERT INTO identity_access.actors VALUES(gen_random_uuid(),'https://synthetic.example.invalid','synthetic')",
    ]) {
      await expect(runtime.pool.query(sql)).rejects.toMatchObject({
        code: '42501',
      });
    }
    await expect(
      grants.grant(command(actors[0], actors[4], 'super_admin')),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      await new MembershipStore(runtime.pool).get(actors[4]!, org),
    ).toBeUndefined();
    await expect(
      owner.pool.query(
        'INSERT INTO organization_access.membership_grants(organization_id,initiating_actor_id,target_actor_id,granted_role,request_id) VALUES($1,$2,$3,$4,$5)',
        [org, actors[0], actors[3], 'viewer', randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('allows an existing global actor to join another organization', async () => {
    expect(await grants.grant(command(actors[0], actors[3], 'viewer'))).toBe(
      'granted',
    );
    expect(
      await new MembershipStore(runtime.pool).list(actors[3]!, 25),
    ).toHaveLength(2);
  });
  it('grants a second administrator before permitting removal of the original', async () => {
    await owner.pool.query(
      'DELETE FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2',
      [org, actors[1]],
    );
    const revocations = new MembershipRevocationStore(runtime.pool);
    expect(await revocations.revoke(command(actors[0], actors[0]))).toBe(
      'last_admin',
    );
    expect(
      await grants.grant(command(actors[0], actors[4], 'organization_admin')),
    ).toBe('granted');
    expect(await revocations.revoke(command(actors[0], actors[0]))).toBe(
      'revoked',
    );
    expect(await grants.grant(command())).toBe('denied');
    expect(
      await grants.grant(command(actors[4], actors[0], 'organization_admin')),
    ).toBe('conflict');
  });
  it('serializes grant and revocation according to commit order', async () => {
    const [granted, revoked] = await Promise.all([
      grants.grant(command()),
      new MembershipRevocationStore(runtime.pool).revoke(command(actors[1])),
    ]);
    expect(granted).toBe('granted');
    expect(['revoked', 'unchanged']).toContain(revoked);
    const membership = await new MembershipStore(runtime.pool).get(
      actors[4]!,
      org,
    );
    if (revoked === 'revoked') expect(membership).toBeUndefined();
    else expect(membership?.role).toBe('analyst');
    expect((await audit()).rows).toHaveLength(1);
  });
  it('revalidates a revoked initiator after acquiring the shared lock', async () => {
    const holder = await owner.pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
        [org],
      );
      pending = grants.grant(command());
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await owner.pool.query(
          'SELECT count(*)::integer AS count FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0',
          [login],
        );
        if (waiting.rows[0].count > 0) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await holder.query(
        'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
        [org, actors[0]],
      );
      await holder.query('COMMIT');
      expect(await pending).toBe('denied');
      expect(
        await new MembershipStore(runtime.pool).get(actors[4]!, org),
      ).toBeUndefined();
      expect((await audit()).rows).toHaveLength(0);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
      await pending;
    }
  });
});
