import type { Pool } from 'pg';
import {
  administerMembership,
  type StoredAdministrationCommand,
} from './membership-administration';
export interface StoredGrantCommand extends StoredAdministrationCommand {
  role: string;
}
export type GrantResult =
  'granted' | 'unchanged' | 'denied' | 'not_found' | 'conflict';
export class MembershipGrantStore {
  constructor(private readonly pool: Pool) {}
  async grant(command: StoredGrantCommand): Promise<GrantResult> {
    return administerMembership(this.pool, command, async (client, target) => {
      if (target)
        return target.role === command.role ? 'unchanged' : 'conflict';
      const revoked = await client.query(
        'SELECT 1 FROM organization_access.memberships WHERE organization_id=$1 AND actor_id=$2 FOR UPDATE',
        [command.organizationId, command.targetActorId],
      );
      if (revoked.rowCount) return 'conflict';
      const actor = await client.query(
        'SELECT 1 FROM identity_access.actors WHERE id=$1',
        [command.targetActorId],
      );
      if (!actor.rowCount) return 'not_found';
      await client.query(
        'INSERT INTO organization_access.memberships(organization_id,actor_id,role) VALUES($1,$2,$3)',
        [command.organizationId, command.targetActorId, command.role],
      );
      await client.query(
        'INSERT INTO organization_access.membership_grants(organization_id,initiating_actor_id,target_actor_id,granted_role,request_id) VALUES($1,$2,$3,$4,$5)',
        [
          command.organizationId,
          command.initiatingActorId,
          command.targetActorId,
          command.role,
          command.requestId,
        ],
      );
      return 'granted';
    });
  }
}
