import type { Pool } from 'pg';
export interface StoredAdministrativeMember {
  actorId: string;
  role: string;
  status: string;
}
export class AdministrativeMembershipStore {
  constructor(private readonly pool: Pool) {}
  async listMembers(
    actorId: string,
    organizationId: string,
    limit: number,
    cursor?: string,
  ): Promise<StoredAdministrativeMember[] | undefined> {
    const result = await this.pool.query<{
      actorId: string | null;
      role: string | null;
      status: string | null;
    }>(
      `SELECT member.actor_id AS "actorId", member.role,
        CASE WHEN member.actor_id IS NULL THEN NULL
          WHEN member.revoked_at IS NULL THEN 'active' ELSE 'revoked' END AS status
       FROM organization_access.memberships administrator
       LEFT JOIN LATERAL (
         SELECT actor_id, role, revoked_at FROM organization_access.memberships
         WHERE organization_id=$2 AND ($4::uuid IS NULL OR actor_id>$4::uuid)
         ORDER BY actor_id LIMIT $3
       ) member ON true
       WHERE administrator.organization_id=$2 AND administrator.actor_id=$1
         AND administrator.role='organization_admin' AND administrator.revoked_at IS NULL
       ORDER BY member.actor_id`,
      [actorId, organizationId, limit, cursor ?? null],
    );
    if (result.rows.length === 0) return undefined;
    return result.rows.flatMap((row) =>
      row.actorId === null
        ? []
        : [
            {
              actorId: row.actorId,
              role: row.role!,
              status: row.status!,
            },
          ],
    );
  }
}
