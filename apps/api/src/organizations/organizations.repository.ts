import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  createDatabase,
  IdentityStore,
  MembershipStore,
  MembershipRevocationStore,
  MembershipRoleStore,
  MembershipGrantStore,
  type Database,
} from '@tax/database';
import type {
  MembershipDirectory,
  ExternalIdentity,
} from './organizations.service';
import type { RevocationCommand } from './membership-revocation.service';
import type { RoleChangeCommand } from './membership-role.service';
import type { GrantCommand } from './membership-grant.service';
@Injectable()
export class OrganizationsRepository
  implements MembershipDirectory, OnModuleDestroy
{
  private readonly database: Database | undefined;
  constructor() {
    if (process.env.DATABASE_URL)
      this.database = createDatabase(process.env.DATABASE_URL);
  }
  private pool() {
    if (!this.database) throw new Error('Membership storage unavailable');
    return this.database.pool;
  }
  findActor(identity: ExternalIdentity) {
    return new IdentityStore(this.pool()).findActor(identity);
  }
  list(actorId: string, limit: number, cursor?: string) {
    return new MembershipStore(this.pool()).list(actorId, limit, cursor);
  }
  get(actorId: string, organizationId: string) {
    return new MembershipStore(this.pool()).get(actorId, organizationId);
  }
  revoke(command: RevocationCommand) {
    return new MembershipRevocationStore(this.pool()).revoke(command);
  }
  changeRole(command: RoleChangeCommand) {
    return new MembershipRoleStore(this.pool()).changeRole(command);
  }
  grant(command: GrantCommand) {
    return new MembershipGrantStore(this.pool()).grant(command);
  }
  async onModuleDestroy() {
    await this.database?.pool.end();
  }
}
