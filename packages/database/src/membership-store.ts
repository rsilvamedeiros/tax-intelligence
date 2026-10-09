import type { Pool } from 'pg';

export interface StoredMembership {
  id: string;
  name: string;
  role: string;
}
export class IdentityStore {
  constructor(private readonly pool: Pool) {}
  async findActor(identity: {
    issuer: string;
    subject: string;
  }): Promise<string | undefined> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM identity_access.actors WHERE issuer=$1 AND subject=$2',
      [identity.issuer, identity.subject],
    );
    return result.rows[0]?.id;
  }
}
export class MembershipStore {
  constructor(private readonly pool: Pool) {}
  async list(
    actorId: string,
    limit: number,
    cursor?: string,
  ): Promise<StoredMembership[]> {
    const result = await this.pool.query<StoredMembership>(
      `SELECT o.id, o.name, m.role FROM organization_access.memberships m
       JOIN organization_access.organizations o ON o.id=m.organization_id
       WHERE m.actor_id=$1 AND m.revoked_at IS NULL AND ($3::uuid IS NULL OR o.id>$3::uuid)
       ORDER BY o.id LIMIT $2`,
      [actorId, limit, cursor ?? null],
    );
    return result.rows;
  }
  async get(
    actorId: string,
    organizationId: string,
  ): Promise<StoredMembership | undefined> {
    const result = await this.pool.query<StoredMembership>(
      `SELECT o.id, o.name, m.role FROM organization_access.memberships m
       JOIN organization_access.organizations o ON o.id=m.organization_id
       WHERE m.actor_id=$1 AND m.organization_id=$2 AND m.revoked_at IS NULL`,
      [actorId, organizationId],
    );
    return result.rows[0];
  }
}
