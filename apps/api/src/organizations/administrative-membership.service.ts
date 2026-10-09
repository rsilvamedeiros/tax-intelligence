import {
  MembershipDenied,
  type ExternalIdentity,
} from './organizations.service';

export interface AdministrativeMember {
  actorId: string;
  role: string;
  status: string;
}
export interface AdministrativeMembershipDirectory {
  findActor(identity: ExternalIdentity): Promise<string | undefined>;
  listMembers(
    actorId: string,
    organizationId: string,
    limit: number,
    cursor?: string,
  ): Promise<AdministrativeMember[] | undefined>;
}
export class AdministrativeMembershipService {
  constructor(private readonly directory: AdministrativeMembershipDirectory) {}
  async list(
    identity: ExternalIdentity,
    organizationId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: AdministrativeMember[]; nextCursor: string | null }> {
    const actorId = await this.directory.findActor(identity);
    if (!actorId) throw new MembershipDenied();
    const rows = await this.directory.listMembers(
      actorId,
      organizationId,
      limit + 1,
      cursor,
    );
    if (!rows) throw new MembershipDenied();
    const items = rows.slice(0, limit).map((row) => {
      if (
        !['organization_admin', 'analyst', 'reviewer', 'viewer'].includes(
          row.role,
        ) ||
        !['active', 'revoked'].includes(row.status)
      )
        throw new Error('Unsupported membership values');
      return { actorId: row.actorId, role: row.role, status: row.status };
    });
    return {
      items,
      nextCursor: rows.length > limit ? items[items.length - 1]!.actorId : null,
    };
  }
}
