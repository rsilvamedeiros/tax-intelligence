import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './index';
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL obrigatória para migrations');
  const database = createDatabase(connectionString);
  try {
    await migrate(database.db, {
      migrationsFolder: resolve(__dirname, '../migrations'),
    });
    console.log('Migrations concluídas.');
  } finally {
    await database.pool.end();
  }
}
void main().catch(() => {
  console.error('Migration falhou; verifique configuração e acesso ao banco.');
  process.exitCode = 1;
});
