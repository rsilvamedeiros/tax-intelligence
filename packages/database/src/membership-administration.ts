import type { Pool, PoolClient } from 'pg';
export interface StoredAdministrationCommand {
  organizationId: string;
  initiatingActorId: string;
  targetActorId: string;
  requestId: string;
}
export async function administerMembership<T extends string>(
  pool: Pool,
  command: StoredAdministrationCommand,
  work: (
    client: PoolClient,
    target: { role: string } | undefined,
  ) => Promise<T>,
): Promise<T | 'denied'> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL lock_timeout = '1500ms'");
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
      [command.organizationId],
    );
    const initiating = await client.query<{ role: string }>(
      'SELECT role FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 AND revoked_at IS NULL FOR UPDATE',
      [command.organizationId, command.initiatingActorId],
    );
    let result: T | 'denied' = 'denied';
    if (initiating.rows[0]?.role === 'organization_admin') {
      const target = await client.query<{ role: string }>(
        'SELECT role FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 AND revoked_at IS NULL FOR UPDATE',
        [command.organizationId, command.targetActorId],
      );
      result = await work(client, target.rows[0]);
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
export async function isLastAdministrator(
  client: PoolClient,
  organizationId: string,
) {
  const admins = await client.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM organization_access.memberships WHERE organization_id=$1 AND role='organization_admin' AND revoked_at IS NULL",
    [organizationId],
  );
  return admins.rows[0]!.count <= 1;
}
