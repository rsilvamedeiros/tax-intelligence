import {
  MembershipDenied,
  type ExternalIdentity,
} from './organizations.service';
export interface GrantCommand {
  organizationId: string;
  initiatingActorId: string;
  targetActorId: string;
  role: string;
  requestId: string;
}
export interface MembershipGrants {
  findActor(identity: ExternalIdentity): Promise<string | undefined>;
  grant(
    command: GrantCommand,
  ): Promise<'granted' | 'unchanged' | 'denied' | 'not_found' | 'conflict'>;
}
export class GrantTargetNotFound extends Error {}
export class MembershipGrantConflict extends Error {}
export class MembershipGrantService {
  constructor(private readonly grants: MembershipGrants) {}
  async grant(
    identity: ExternalIdentity,
    organizationId: string,
    targetActorId: string,
    role: string,
    requestId: string,
  ): Promise<void> {
    const initiatingActorId = await this.grants.findActor(identity);
    if (!initiatingActorId) throw new MembershipDenied();
    const result = await this.grants.grant({
      organizationId,
      initiatingActorId,
      targetActorId,
      role,
      requestId,
    });
    if (result === 'denied') throw new MembershipDenied();
    if (result === 'not_found') throw new GrantTargetNotFound();
    if (result === 'conflict') throw new MembershipGrantConflict();
    if (result !== 'granted' && result !== 'unchanged')
      throw new Error('Unsupported grant result');
  }
}
