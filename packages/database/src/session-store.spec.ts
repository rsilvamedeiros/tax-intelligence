import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, type Database, SessionStore } from './index';
import { randomBytes, createHash } from 'node:crypto';
describe('BFF storage migration', () => {
  let database: Database;
  let store: SessionStore;
  const key = randomBytes(32);
  const ids: string[] = [];
  beforeAll(async () => {
    if (
      !process.env.TEST_DATABASE_URL ||
      !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
    )
      throw new Error(
        'An isolated TEST_DATABASE_URL ending in _test is required',
      );
    database = createDatabase(process.env.TEST_DATABASE_URL);
    await migrate(database.db, {
      migrationsFolder: resolve(__dirname, '../migrations'),
    });
    store = new SessionStore(database.pool, key);
  });
  afterAll(async () => {
    for (const id of ids) {
      await store.revoke('attempt', id);
      await store.revoke('session', id);
    }
    await database?.pool.end();
  });
  async function create(kind: 'attempt' | 'session' = 'session') {
    const id = await store.insert(
      kind,
      { token: 'synthetic-storage-token', subject: 'synthetic-subject' },
      new Date(Date.now() + 60_000),
    );
    ids.push(id);
    return id;
  }
  it('provides the dedicated encrypted session table', async () => {
    const result = await database.pool.query(
      "SELECT to_regclass('auth_bff.entries')::text AS relation",
    );
    expect(result.rows).toEqual([{ relation: 'auth_bff.entries' }]);
  });
  it('stores a hashed identifier and encrypted payload readable across instances', async () => {
    const id = await create();
    const hash = createHash('sha256').update(id).digest('hex');
    const rows = await database.pool.query(
      'SELECT * FROM auth_bff.entries WHERE id_hash=$1',
      [hash],
    );
    expect(JSON.stringify(rows.rows)).not.toContain('synthetic-storage-token');
    expect(JSON.stringify(rows.rows)).not.toContain('synthetic-subject');
    expect(JSON.stringify(rows.rows)).not.toContain(id);
    expect(
      await new SessionStore(database.pool, key).read('session', id),
    ).toEqual({
      token: 'synthetic-storage-token',
      subject: 'synthetic-subject',
    });
  });
  it('allows only one concurrent consumer of a login attempt', async () => {
    const id = await create('attempt');
    const results = await Promise.all([
      store.take('attempt', id),
      new SessionStore(database.pool, key).take('attempt', id),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.read('attempt', id)).toBeUndefined();
  });
  it('revokes a session for every store instance', async () => {
    const id = await create();
    await store.revoke('session', id);
    expect(
      await new SessionStore(database.pool, key).read('session', id),
    ).toBeUndefined();
  });
  it('rejects an expired session', async () => {
    const id = await create();
    await database.pool.query(
      "UPDATE auth_bff.entries SET expires_at=now()-interval '1 second' WHERE id_hash=$1",
      [createHash('sha256').update(id).digest('hex')],
    );
    expect(await store.read('session', id)).toBeUndefined();
  });
  it('does not consume a session through the attempt interface', async () => {
    const id = await create();
    expect(await store.take('attempt', id)).toBeUndefined();
    expect(await store.read('session', id)).toBeDefined();
  });
  it('detects an incorrect encryption key', async () => {
    const id = await create();
    await expect(
      new SessionStore(database.pool, randomBytes(32)).read('session', id),
    ).rejects.toThrow();
  });
  it('detects ciphertext moved to another kind', async () => {
    const id = await create();
    await database.pool.query(
      "UPDATE auth_bff.entries SET kind='attempt' WHERE id_hash=$1",
      [createHash('sha256').update(id).digest('hex')],
    );
    await expect(store.read('attempt', id)).rejects.toThrow();
  });
  it('rejects unsafe payload sizes and expired inserts', async () => {
    await expect(
      store.insert(
        'session',
        { token: 'x'.repeat(65537) },
        new Date(Date.now() + 60_000),
      ),
    ).rejects.toThrow();
    await expect(store.insert('session', {}, new Date(0))).rejects.toThrow();
    expect(() => new SessionStore(database.pool, Buffer.alloc(1))).toThrow();
    expect(await store.read('session', 'malformed')).toBeUndefined();
  });
});
