import {
  MembershipDenied,
  type ExternalIdentity,
} from './organizations.service';
import { LastAdministrator } from './membership-revocation.service';
export interface RoleChangeCommand {
  organizationId: string;
  initiatingActorId: string;
  targetActorId: string;
  requestId: string;
  role: string;
}
export interface MembershipRoleChanges {
  findActor(identity: ExternalIdentity): Promise<string | undefined>;
  changeRole(
    command: RoleChangeCommand,
  ): Promise<'changed' | 'unchanged' | 'denied' | 'not_found' | 'last_admin'>;
}
export class MembershipNotFound extends Error {}
export class MembershipRoleService {
  constructor(private readonly roles: MembershipRoleChanges) {}
  async change(
    identity: ExternalIdentity,
    organizationId: string,
    targetActorId: string,
    role: string,
    requestId: string,
  ): Promise<void> {
    const initiatingActorId = await this.roles.findActor(identity);
    if (!initiatingActorId) throw new MembershipDenied();
    const result = await this.roles.changeRole({
      organizationId,
      initiatingActorId,
      targetActorId,
      role,
      requestId,
    });
    if (result === 'denied') throw new MembershipDenied();
    if (result === 'not_found') throw new MembershipNotFound();
    if (result === 'last_admin') throw new LastAdministrator();
    if (result !== 'changed' && result !== 'unchanged')
      throw new Error('Unsupported role change result');
  }
}
