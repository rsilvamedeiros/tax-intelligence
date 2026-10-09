import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createDatabase,
  type Database,
  IdentityStore,
  MembershipStore,
} from './index';

describe('Membership persistence with a read-only runtime connection', () => {
  let owner: Database;
  let runtime: Database;
  let identity: IdentityStore;
  let memberships: MembershipStore;
  const actor = randomUUID();
  const otherActor = randomUUID();
  const orgs = [randomUUID(), randomUUID(), randomUUID()].sort();
  const issuer = `https://${randomUUID()}.example.invalid`;
  const role = `membership_test_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error('Isolated TEST_DATABASE_URL ending in _test required');
    owner = createDatabase(url);
    await migrate(owner.db, {
      migrationsFolder: resolve(__dirname, '../migrations'),
    });
    // Use an ephemeral password, never a production credential or fixture secret.
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
    const runtimeUrl = new URL(url);
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    runtime = createDatabase(runtimeUrl.href);
    identity = new IdentityStore(runtime.pool);
    memberships = new MembershipStore(runtime.pool);
    await owner.pool.query(
      'INSERT INTO identity_access.actors(id,issuer,subject) VALUES ($1,$2,$3),($4,$5,$3)',
      [actor, issuer, 'opaque-subject', otherActor, `${issuer}/other`],
    );
    for (const [index, id] of orgs.entries()) {
      await owner.pool.query(
        'INSERT INTO organization_access.organizations(id,name) VALUES($1,$2)',
        [id, `Synthetic ${index}`],
      );
      await owner.pool.query(
        'INSERT INTO organization_access.memberships(organization_id,actor_id,role) VALUES($1,$2,$3)',
        [id, index === 2 ? otherActor : actor, 'viewer'],
      );
    }
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
        [[actor, otherActor]],
      );
      await owner.pool.query(`DROP ROLE IF EXISTS ${role}`).catch(async () => {
        await owner.pool.query(`DROP OWNED BY ${role}`);
        await owner.pool.query(`DROP ROLE ${role}`);
      });
      await owner.pool.end();
    }
  });
  it('resolves exact issuer and subject without creating actors', async () => {
    expect(
      await identity.findActor({ issuer, subject: 'opaque-subject' }),
    ).toBe(actor);
    expect(
      await identity.findActor({
        issuer: `${issuer}/other`,
        subject: 'opaque-subject',
      }),
    ).toBe(otherActor);
    expect(
      await identity.findActor({ issuer, subject: ' opaque-subject' }),
    ).toBeUndefined();
    expect(
      await identity.findActor({
        issuer: "' OR TRUE --",
        subject: 'opaque-subject',
      }),
    ).toBeUndefined();
  });
  it('paginates only active memberships for the resolved actor', async () => {
    const first = await memberships.list(actor, 1);
    expect(first.map((row) => row.id)).toEqual([orgs[0]]);
    expect(
      (await memberships.list(actor, 2, first[0]!.id)).map((row) => row.id),
    ).toEqual([orgs[1]]);
    expect(await memberships.get(actor, orgs[2]!)).toBeUndefined();
    expect(await memberships.get(actor, randomUUID())).toBeUndefined();
    expect((await memberships.get(actor, orgs[0]!))?.role).toBe('viewer');
  });
  it('observes committed revocation on the next query', async () => {
    await owner.pool.query(
      'UPDATE organization_access.memberships SET revoked_at=now() WHERE actor_id=$1 AND organization_id=$2',
      [actor, orgs[1]],
    );
    expect(await memberships.get(actor, orgs[1]!)).toBeUndefined();
    expect((await memberships.list(actor, 100)).map((row) => row.id)).toEqual([
      orgs[0],
    ]);
  });
  it('enforces uniqueness, foreign keys and closed role vocabulary', async () => {
    await expect(
      owner.pool.query('INSERT INTO identity_access.actors VALUES($1,$2,$3)', [
        randomUUID(),
        issuer,
        'opaque-subject',
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      owner.pool.query(
        'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
        [randomUUID(), actor, 'viewer'],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      owner.pool.query(
        'UPDATE organization_access.memberships SET role=$1 WHERE actor_id=$2',
        ['super_admin', actor],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      owner.pool.query('DELETE FROM identity_access.actors WHERE id=$1', [
        actor,
      ]),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^23/) });
    expect(
      await identity.findActor({ issuer, subject: 'opaque-subject' }),
    ).toBe(actor);
  });
  it('connects as a non-owner without elevated flags or write privileges', async () => {
    const flags = await runtime.pool.query(
      'SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user',
    );
    expect(flags.rows).toEqual([
      { name: role, rolsuper: false, rolbypassrls: false },
    ]);
    const tables = await runtime.pool.query(
      "SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname IN ('identity_access','organization_access') AND tableowner=current_user",
    );
    expect(tables.rows).toEqual([{ count: 0 }]);
    await expect(
      runtime.pool.query(
        'UPDATE organization_access.memberships SET revoked_at=now()',
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtime.pool.query(
        'INSERT INTO identity_access.actors VALUES($1,$2,$3)',
        [randomUUID(), issuer, 'forbidden'],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtime.pool.query('SELECT * FROM auth_bff.entries'),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
