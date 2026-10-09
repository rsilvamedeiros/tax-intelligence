import type { Pool } from 'pg';
import {
  administerMembership,
  isLastAdministrator,
  type StoredAdministrationCommand,
} from './membership-administration';
export interface StoredRoleChangeCommand extends StoredAdministrationCommand {
  role: string;
}
export type RoleChangeResult =
  'changed' | 'unchanged' | 'denied' | 'not_found' | 'last_admin';
export class MembershipRoleStore {
  constructor(private readonly pool: Pool) {}
  async changeRole(
    command: StoredRoleChangeCommand,
  ): Promise<RoleChangeResult> {
    return administerMembership(this.pool, command, async (client, target) => {
      if (!target) return 'not_found';
      if (target.role === command.role) return 'unchanged';
      if (
        target.role === 'organization_admin' &&
        command.role !== 'organization_admin' &&
        (await isLastAdministrator(client, command.organizationId))
      )
        return 'last_admin';
      await client.query(
        'UPDATE organization_access.memberships SET role=$3 WHERE organization_id=$1 AND actor_id=$2',
        [command.organizationId, command.targetActorId, command.role],
      );
      await client.query(
        'INSERT INTO organization_access.membership_role_changes(organization_id,initiating_actor_id,target_actor_id,previous_role,new_role,request_id) VALUES($1,$2,$3,$4,$5,$6)',
        [
          command.organizationId,
          command.initiatingActorId,
          command.targetActorId,
          target.role,
          command.role,
          command.requestId,
        ],
      );
      return 'changed';
    });
  }
}
