import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
const { createDatabase } = require('./dist/index.js');
function testDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(
    url && new URL(url).pathname.endsWith('_test'),
    'Isolated TEST_DATABASE_URL ending in _test required',
  );
  return url;
}
export async function createBrowserMembershipFixture(issuer, subject) {
  const url = testDatabase();
  const owner = createDatabase(url);
  const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
  const actors = [randomUUID(), randomUUID()];
  const roles = [];
  async function cleanup() {
    try {
      await owner.pool.query(
        'DELETE FROM organization_access.memberships WHERE organization_id=ANY($1::uuid[])',
        [ids],
      );
      await owner.pool.query(
        'DELETE FROM organization_access.organizations WHERE id=ANY($1::uuid[])',
        [ids],
      );
      await owner.pool.query(
        'DELETE FROM identity_access.actors WHERE id=ANY($1::uuid[])',
        [actors],
      );
      for (const role of roles) {
        await owner.pool.query(`DROP OWNED BY ${role}`);
        await owner.pool.query(`DROP ROLE ${role}`);
      }
    } finally {
      await owner.pool.end();
    }
  }
  async function runtimeRole(kind) {
    const role = `browser_${kind}_${randomBytes(8).toString('hex')}`;
    const password = randomBytes(32).toString('hex');
    await owner.pool.query(
      `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`,
    );
    roles.push(role);
    if (kind === 'api') {
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA identity_access, organization_access TO ${role}`,
      );
      await owner.pool.query(
        `GRANT SELECT ON identity_access.actors, organization_access.organizations, organization_access.memberships TO ${role}`,
      );
    } else {
      await owner.pool.query(`GRANT USAGE ON SCHEMA auth_bff TO ${role}`);
      await owner.pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON auth_bff.entries TO ${role}`,
      );
    }
    const connection = new URL(url);
    connection.username = role;
    connection.password = password;
    return connection.href;
  }
  try {
    const apiUrl = await runtimeRole('api');
    const bffUrl = await runtimeRole('bff');
    await owner.pool.query(
      'INSERT INTO identity_access.actors(id,issuer,subject) VALUES($1,$2,$3),($4,$2,$5)',
      [actors[0], issuer, subject, actors[1], `${subject}-synthetic-other`],
    );
    for (const [index, id] of ids.entries()) {
      await owner.pool.query(
        'INSERT INTO organization_access.organizations(id,name) VALUES($1,$2)',
        [id, ['Synthetic A', 'Synthetic Revoked', 'Synthetic B'][index]],
      );
      await owner.pool.query(
        'INSERT INTO organization_access.memberships(organization_id,actor_id,role) VALUES($1,$2,$3)',
        [id, index === 2 ? actors[1] : actors[0], 'viewer'],
      );
    }
    return { ids, apiUrl, bffUrl, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
export async function revokeBrowserMembership(id, allowedIds) {
  assert.ok(
    typeof id === 'string' &&
      Array.isArray(allowedIds) &&
      allowedIds.includes(id),
    'Unknown synthetic membership fixture',
  );
  const owner = createDatabase(testDatabase());
  try {
    await owner.pool.query(
      'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1',
      [id],
    );
    return null;
  } finally {
    await owner.pool.end();
  }
}
