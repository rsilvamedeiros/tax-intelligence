import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 2000,
    statement_timeout: 2000,
  });
  // Idle connection failures are handled without exposing credentials or crashing the process.
  pool.on('error', () => {});
  return { pool, db: drizzle(pool) };
}
export type Database = ReturnType<typeof createDatabase>;
export { SessionStore } from './session-store';
export { IdentityStore, MembershipStore } from './membership-store';
export { MembershipRevocationStore } from './membership-revocation-store';
export { MembershipRoleStore } from './membership-role-store';
export { MembershipGrantStore } from './membership-grant-store';
export { AdministrativeMembershipStore } from './administrative-membership-store';
