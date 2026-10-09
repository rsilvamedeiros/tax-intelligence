import {
  MembershipDenied,
  type ExternalIdentity,
} from './organizations.service';
export interface RevocationCommand {
  organizationId: string;
  initiatingActorId: string;
  targetActorId: string;
  requestId: string;
}
export interface MembershipRevocations {
  findActor(identity: ExternalIdentity): Promise<string | undefined>;
  revoke(
    command: RevocationCommand,
  ): Promise<'revoked' | 'unchanged' | 'denied' | 'last_admin'>;
}
export class LastAdministrator extends Error {}
export class MembershipRevocationService {
  constructor(private readonly revocations: MembershipRevocations) {}
  async revoke(
    identity: ExternalIdentity,
    organizationId: string,
    targetActorId: string,
    requestId: string,
  ): Promise<void> {
    const initiatingActorId = await this.revocations.findActor(identity);
    if (!initiatingActorId) throw new MembershipDenied();
    const result = await this.revocations.revoke({
      organizationId,
      initiatingActorId,
      targetActorId,
      requestId,
    });
    if (result === 'denied') throw new MembershipDenied();
    if (result === 'last_admin') throw new LastAdministrator();
    if (result !== 'revoked' && result !== 'unchanged')
      throw new Error('Unsupported revocation result');
  }
}
