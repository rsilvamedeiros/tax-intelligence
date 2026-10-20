import type { PoolClient } from 'pg';
import { IdentityStore } from './membership-store';

export interface AuthorizedOrganizationOperation {
  organizationId: string;
  actorId: string;
}

// Infrastructure composition supplies an active transaction, never a domain SQL callback.
export class OrganizationOperationStore {
  constructor(private readonly client: PoolClient) {}

  async authorize(
    identity: { issuer: string; subject: string },
    organizationId: string,
    action: 'create' | 'read',
  ): Promise<AuthorizedOrganizationOperation | undefined> {
    const roles =
      action === 'create'
        ? ['organization_admin', 'analyst']
        : ['organization_admin', 'analyst', 'reviewer', 'viewer'];
    const find = async () => {
      const actorId = await new IdentityStore(this.client).findActor(identity);
      if (!actorId) return undefined;
      const membership = await this.client.query<{
        organization_id: string;
        actor_id: string;
      }>(
        'SELECT organization_id,actor_id FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 AND revoked_at IS NULL AND role=ANY($3::text[])',
        [organizationId, actorId, roles],
      );
      const row = membership.rows[0];
      return row
        ? { organizationId: row.organization_id, actorId: row.actor_id }
        : undefined;
    };
    const preliminary = await find();
    if (!preliminary) return undefined;
    await this.client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',
      [preliminary.organizationId],
    );
    return find();
  }
}
