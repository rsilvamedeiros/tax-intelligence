import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, type Database } from './index';
describe('PostgreSQL foundation (requires TEST_DATABASE_URL)', () => {
  let database: Database;
  beforeAll(() => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url)
      throw new Error(
        'TEST_DATABASE_URL obrigatória; este teste nunca usa banco de produção.',
      );
    database = createDatabase(url);
  });
  afterAll(async () => {
    if (database) await database.pool.end();
  });
  it('applies migrations twice without duplicate journal entries', async () => {
    const folder = resolve(__dirname, '../migrations');
    await migrate(database.db, { migrationsFolder: folder });
    const first = await database.pool.query<{ count: string }>(
      'SELECT count(*) FROM drizzle.__drizzle_migrations',
    );
    await migrate(database.db, { migrationsFolder: folder });
    const second = await database.pool.query<{ count: string }>(
      'SELECT count(*) FROM drizzle.__drizzle_migrations',
    );
    expect(second.rows).toEqual(first.rows);
    const schema = await database.pool.query<{ name: string }>(
      "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name = 'platform'",
    );
    expect(schema.rows).toEqual([{ name: 'platform' }]);
  });
  it('supports transactional rollback', async () => {
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'CREATE TABLE platform.synthetic_rollback_test (id integer)',
      );
      await client.query('ROLLBACK');
      const result = await client.query<{ relation: string | null }>(
        "SELECT to_regclass('platform.synthetic_rollback_test')::text AS relation",
      );
      expect(result.rows[0]?.relation).toBeNull();
    } finally {
      client.release();
    }
  });
});
