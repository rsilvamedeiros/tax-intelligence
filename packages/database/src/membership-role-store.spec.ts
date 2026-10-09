import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createDatabase,
  type Database,
  MembershipRoleStore,
  MembershipRevocationStore,
  MembershipStore,
} from './index';
describe('Atomic membership role changes with restricted runtime', () => {
  let owner: Database;
  let runtime: Database;
  let roles: MembershipRoleStore;
  const login = `role_change_test_${randomBytes(8).toString('hex')}`;
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
      `GRANT INSERT ON organization_access.membership_role_changes,organization_access.membership_revocations TO ${login}`,
    );
    const connection = new URL(url);
    connection.username = login;
    connection.password = password;
    runtime = createDatabase(connection.href);
    roles = new MembershipRoleStore(runtime.pool);
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
    for (const [i, actor] of actors.entries())
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
    targetActorId = actors[2]!,
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
      'SELECT * FROM organization_access.membership_role_changes WHERE organization_id=$1',
      [org],
    );
  it('changes role with atomic audit and leaves retries unchanged', async () => {
    const input = command();
    expect(await roles.changeRole(input)).toBe('changed');
    expect(
      (await new MembershipStore(runtime.pool).get(actors[2]!, org))?.role,
    ).toBe('analyst');
    expect((await audit()).rows).toMatchObject([
      {
        organization_id: org,
        initiating_actor_id: actors[0],
        target_actor_id: actors[2],
        previous_role: 'viewer',
        new_role: 'analyst',
        request_id: input.requestId,
      },
    ]);
    expect(await roles.changeRole(command())).toBe('unchanged');
    expect((await audit()).rows).toHaveLength(1);
  });
  it.each(['viewer', 'other organization', 'unknown', 'revoked'])(
    'denies %s without effects',
    async (kind) => {
      const initiator =
        kind === 'viewer'
          ? actors[2]
          : kind === 'other organization'
            ? actors[3]
            : kind === 'unknown'
              ? randomUUID()
              : actors[0];
      if (kind === 'revoked')
        await owner.pool.query(
          'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
          [org, initiator],
        );
      expect(await roles.changeRole(command(initiator))).toBe('denied');
      expect((await audit()).rows).toHaveLength(0);
    },
  );
  it('does not create or reactivate missing and revoked targets', async () => {
    expect(await roles.changeRole(command(actors[0], randomUUID()))).toBe(
      'not_found',
    );
    await owner.pool.query(
      'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
      [org, actors[2]],
    );
    expect(await roles.changeRole(command())).toBe('not_found');
    expect((await audit()).rows).toHaveLength(0);
  });
  it('protects the last administrator and revalidates after self demotion', async () => {
    expect(
      await roles.changeRole(command(actors[0], actors[0], 'viewer')),
    ).toBe('changed');
    expect(
      await roles.changeRole(command(actors[1], actors[1], 'viewer')),
    ).toBe('last_admin');
    expect(await roles.changeRole(command())).toBe('denied');
    expect((await audit()).rows).toHaveLength(1);
  });
  it('rolls back role on audit failure and allows recovery', async () => {
    await owner.pool.query(
      `REVOKE INSERT ON organization_access.membership_role_changes FROM ${login}`,
    );
    try {
      await expect(roles.changeRole(command())).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await owner.pool.query(
        `GRANT INSERT ON organization_access.membership_role_changes TO ${login}`,
      );
    }
    expect(
      (await new MembershipStore(runtime.pool).get(actors[2]!, org))?.role,
    ).toBe('viewer');
    expect((await audit()).rows).toHaveLength(0);
    expect(await roles.changeRole(command())).toBe('changed');
  });
  it('serializes role changes with revocation to preserve an administrator', async () => {
    const revocations = new MembershipRevocationStore(runtime.pool);
    const results = await Promise.all([
      roles.changeRole(command(actors[0], actors[0], 'viewer')),
      revocations.revoke(command(actors[1], actors[1])),
    ]);
    expect(results.filter((result) => result === 'last_admin')).toHaveLength(1);
    expect(
      results.filter((result) => result === 'changed' || result === 'revoked'),
    ).toHaveLength(1);
    const admins = await owner.pool.query(
      "SELECT count(*)::integer AS count FROM organization_access.memberships WHERE organization_id=$1 AND role='organization_admin' AND revoked_at IS NULL",
      [org],
    );
    expect(admins.rows[0].count).toBe(1);
  });
  it('permits administrator promotion but denies viewer self elevation', async () => {
    expect(
      await roles.changeRole(
        command(actors[2], actors[2], 'organization_admin'),
      ),
    ).toBe('denied');
    expect(
      await roles.changeRole(
        command(actors[0], actors[2], 'organization_admin'),
      ),
    ).toBe('changed');
    expect(
      await roles.changeRole(command(actors[2], actors[0], 'reviewer')),
    ).toBe('changed');
  });
  it('keeps audit append only and rejects cross organization or unchanged events', async () => {
    for (const sql of [
      'SELECT * FROM organization_access.membership_role_changes',
      'UPDATE organization_access.membership_role_changes SET request_id=request_id',
      'DELETE FROM organization_access.membership_role_changes',
      'TRUNCATE organization_access.membership_role_changes',
      "INSERT INTO identity_access.actors(id,issuer,subject) VALUES(gen_random_uuid(),'synthetic','synthetic')",
      'DELETE FROM organization_access.memberships',
    ])
      await expect(runtime.pool.query(sql)).rejects.toMatchObject({
        code: '42501',
      });
    const sql =
      'INSERT INTO organization_access.membership_role_changes(organization_id,initiating_actor_id,target_actor_id,previous_role,new_role,request_id) VALUES($1,$2,$3,$4,$5,$6)';
    await expect(
      owner.pool.query(sql, [
        org,
        actors[0],
        actors[3],
        'viewer',
        'analyst',
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      owner.pool.query(sql, [
        org,
        actors[0],
        actors[2],
        'viewer',
        'viewer',
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      roles.changeRole(command(actors[0], actors[2], 'super_admin')),
    ).rejects.toMatchObject({ code: '23514' });
    expect((await audit()).rows).toHaveLength(0);
  });
  it('revalidates administrator role after waiting for a concurrent demotion', async () => {
    const holder = await owner.pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN');
      await holder.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
        [org],
      );
      pending = roles.changeRole(command());
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
      }
      expect(blocked).toBe(true);
      await holder.query(
        'UPDATE organization_access.memberships SET role=$3 WHERE organization_id=$1 AND actor_id=$2',
        [org, actors[0], 'viewer'],
      );
      await holder.query('COMMIT');
      expect(await pending).toBe('denied');
      expect((await audit()).rows).toHaveLength(0);
      expect(
        (await new MembershipStore(runtime.pool).get(actors[2]!, org))?.role,
      ).toBe('viewer');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
      await pending;
    }
  });
});
