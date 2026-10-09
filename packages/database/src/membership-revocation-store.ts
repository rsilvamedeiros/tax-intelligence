import type { Pool } from 'pg';
import {
  administerMembership,
  isLastAdministrator,
  type StoredAdministrationCommand,
} from './membership-administration';
export type StoredRevocationCommand = StoredAdministrationCommand;
export type RevocationResult =
  'revoked' | 'unchanged' | 'denied' | 'last_admin';
export class MembershipRevocationStore {
  constructor(private readonly pool: Pool) {}
  async revoke(command: StoredRevocationCommand): Promise<RevocationResult> {
    return administerMembership(this.pool, command, async (client, target) => {
      if (!target) return 'unchanged';
      if (
        target.role === 'organization_admin' &&
        (await isLastAdministrator(client, command.organizationId))
      )
        return 'last_admin';
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
          target.role,
          command.requestId,
        ],
      );
      return 'revoked';
    });
  }
}
