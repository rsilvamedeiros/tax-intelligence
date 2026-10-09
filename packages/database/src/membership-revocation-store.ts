import type { Pool } from 'pg';
export interface StoredRevocationCommand {
  organizationId: string;
  initiatingActorId: string;
  targetActorId: string;
  requestId: string;
}
export type RevocationResult =
  'revoked' | 'unchanged' | 'denied' | 'last_admin';
export class MembershipRevocationStore {
  constructor(private readonly pool: Pool) {}
  async revoke(command: StoredRevocationCommand): Promise<RevocationResult> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query("SET LOCAL lock_timeout = '1500ms'");
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))',
        [command.organizationId],
      );
      const initiating = await client.query<{ role: string }>(
        'SELECT role FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 AND revoked_at IS NULL FOR UPDATE',
        [command.organizationId, command.initiatingActorId],
      );
      let result: RevocationResult = 'denied';
      if (initiating.rows[0]?.role === 'organization_admin') {
        const target = await client.query<{ role: string }>(
          'SELECT role FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 AND revoked_at IS NULL FOR UPDATE',
          [command.organizationId, command.targetActorId],
        );
        result = 'unchanged';
        if (target.rows[0]) {
          const admins =
            target.rows[0].role === 'organization_admin'
              ? await client.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM organization_access.memberships WHERE organization_id=$1 AND role='organization_admin' AND revoked_at IS NULL",
                  [command.organizationId],
                )
              : undefined;
          if (admins && admins.rows[0]!.count <= 1) result = 'last_admin';
          else {
            await client.query(
              'UPDATE organization_access.memberships SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND actor_id=$2',
              [command.organizationId, command.targetActorId],
            );
            await client.query(
              'INSERT INTO organization_access.membership_revocations(organization_id,initiating_actor_id,target_actor_id,previous_role,request_id) VALUES($1,$2,$3,$4,$5)',
              [
                command.organizationId,
                command.initiatingActorId,
                command.targetActorId,
                target.rows[0].role,
                command.requestId,
              ],
            );
            result = 'revoked';
          }
        }
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
}
