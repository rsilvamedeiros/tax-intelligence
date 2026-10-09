import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, type Database } from './index';
import { AdministrativeMembershipStore } from './administrative-membership-store';

describe('Administrative directory with restricted PostgreSQL access', () => {
  let owner: Database;
  let runtime: Database;
  let store: AdministrativeMembershipStore;
  const actors = Array.from({ length: 5 }, () => randomUUID()).sort();
  const orgs = [randomUUID(), randomUUID()];
  const role = `admin_directory_${randomBytes(8).toString('hex')}`;
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
      `GRANT USAGE ON SCHEMA organization_access TO ${role}`,
    );
    await owner.pool.query(
      `GRANT SELECT ON organization_access.memberships TO ${role}`,
    );
    const runtimeUrl = new URL(url);
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    runtime = createDatabase(runtimeUrl.href);
    store = new AdministrativeMembershipStore(runtime.pool);
    for (const id of actors)
      await owner.pool.query(
        'INSERT INTO identity_access.actors(id,issuer,subject) VALUES($1,$2,$3)',
        [id, 'https://directory.example.invalid', id],
      );
    for (const id of orgs)
      await owner.pool.query(
        'INSERT INTO organization_access.organizations(id,name) VALUES($1,$2)',
        [id, 'Synthetic'],
      );
    for (const [index, id] of actors.entries())
      await owner.pool.query(
        'INSERT INTO organization_access.memberships(organization_id,actor_id,role,revoked_at) VALUES($1,$2,$3,$4)',
        [
          orgs[0],
          id,
          index === 0
            ? 'organization_admin'
            : index === 1
              ? 'analyst'
              : index === 2
                ? 'reviewer'
                : 'viewer',
          index === 4 ? new Date() : null,
        ],
      );
    await owner.pool.query(
      'INSERT INTO organization_access.memberships(organization_id,actor_id,role) VALUES($1,$2,$3)',
      [orgs[1], actors[1], 'organization_admin'],
    );
  });
  afterAll(async () => {
    await runtime?.pool.end();
    if (owner) {
      await owner.pool.query(
        'DELETE FROM organization_access.memberships WHERE organization_id=ANY($1::uuid[])',
        [orgs],
      );
      await owner.pool.query(
        'DELETE FROM organization_access.organizations WHERE id=ANY($1::uuid[])',
        [orgs],
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
  it('lists only selected organization including revoked state, without identity privileges', async () => {
    expect(await store.listMembers(actors[0]!, orgs[0]!, 100)).toEqual(
      actors.map((actorId, i) => ({
        actorId,
        role:
          i === 0
            ? 'organization_admin'
            : i === 1
              ? 'analyst'
              : i === 2
                ? 'reviewer'
                : 'viewer',
        status: i === 4 ? 'revoked' : 'active',
      })),
    );
    await expect(
      runtime.pool.query('SELECT * FROM identity_access.actors'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtime.pool.query('SELECT * FROM organization_access.membership_grants'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtime.pool.query('UPDATE organization_access.memberships SET role=$1', [
        'viewer',
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('paginates by exclusive UUID and preserves an authorized empty page', async () => {
    expect(
      (await store.listMembers(actors[0]!, orgs[0]!, 2))?.map((x) => x.actorId),
    ).toEqual(actors.slice(0, 2));
    expect(
      (await store.listMembers(actors[0]!, orgs[0]!, 2, actors[1]))?.map(
        (x) => x.actorId,
      ),
    ).toEqual(actors.slice(2, 4));
    expect(await store.listMembers(actors[0]!, orgs[0]!, 2, actors[4])).toEqual(
      [],
    );
  });
  it.each([1, 2, 3, 4])(
    'denies a non-administrative or revoked initiator %s',
    async (i) => {
      expect(
        await store.listMembers(actors[i]!, orgs[0]!, 100),
      ).toBeUndefined();
    },
  );
  it('denies foreign, nonexistent organizations and unknown actors even with an empty cursor page', async () => {
    expect(
      await store.listMembers(actors[0]!, orgs[1]!, 100, actors[4]),
    ).toBeUndefined();
    expect(
      await store.listMembers(actors[0]!, randomUUID(), 100),
    ).toBeUndefined();
    expect(
      await store.listMembers(randomUUID(), orgs[0]!, 100),
    ).toBeUndefined();
    expect(
      (await store.listMembers(actors[1]!, orgs[1]!, 100))?.map(
        (x) => x.actorId,
      ),
    ).toEqual([actors[1]]);
  });
  it('reads committed permission while another connection holds an uncommitted revocation', async () => {
    const writer = await owner.pool.connect();
    try {
      await writer.query('BEGIN');
      await writer.query(
        'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
        [orgs[0], actors[0]],
      );
      expect((await store.listMembers(actors[0]!, orgs[0]!, 100))?.length).toBe(
        5,
      );
      await writer.query('ROLLBACK');
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
  });
  it('observes committed demotion and revocation on the following statement', async () => {
    await owner.pool.query(
      'UPDATE organization_access.memberships SET role=$1 WHERE organization_id=$2 AND actor_id=$3',
      ['viewer', orgs[0], actors[0]],
    );
    expect(await store.listMembers(actors[0]!, orgs[0]!, 100)).toBeUndefined();
    await owner.pool.query(
      'UPDATE organization_access.memberships SET role=$1,revoked_at=now() WHERE organization_id=$2 AND actor_id=$3',
      ['organization_admin', orgs[0], actors[0]],
    );
    expect(await store.listMembers(actors[0]!, orgs[0]!, 100)).toBeUndefined();
    await owner.pool.query(
      'UPDATE organization_access.memberships SET revoked_at=NULL WHERE organization_id=$1 AND actor_id=$2',
      [orgs[0], actors[0]],
    );
    expect((await store.listMembers(actors[0]!, orgs[0]!, 100))?.length).toBe(
      5,
    );
  });
});
