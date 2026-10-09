import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  createDatabase,
  IdentityStore,
  MembershipStore,
  type Database,
} from '@tax/database';
import type {
  MembershipDirectory,
  ExternalIdentity,
} from './organizations.service';
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
  async onModuleDestroy() {
    await this.database?.pool.end();
  }
}
