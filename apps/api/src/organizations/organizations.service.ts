export interface ExternalIdentity {
  issuer: string;
  subject: string;
}
export interface DirectoryMembership {
  id: string;
  name: string;
  role: string;
}
export interface MembershipDirectory {
  findActor(identity: ExternalIdentity): Promise<string | undefined>;
  list(
    actorId: string,
    limit: number,
    cursor?: string,
  ): Promise<DirectoryMembership[]>;
  get(
    actorId: string,
    organizationId: string,
  ): Promise<DirectoryMembership | undefined>;
}
export class MembershipDenied extends Error {}
const roles = ['organization_admin', 'analyst', 'reviewer', 'viewer'];
function validateMembership(row: DirectoryMembership): DirectoryMembership {
  if (!roles.includes(row.role)) throw new Error('Unsupported membership role');
  return row;
}
export class OrganizationsService {
  constructor(private readonly directory: MembershipDirectory) {}
  async list(
    identity: ExternalIdentity,
    limit: number,
    cursor?: string,
  ): Promise<{ items: DirectoryMembership[]; nextCursor: string | null }> {
    const actorId = await this.directory.findActor(identity);
    if (!actorId) return { items: [], nextCursor: null };
    const rows = await this.directory.list(actorId, limit + 1, cursor);
    const items = rows.slice(0, limit).map(validateMembership);
    return {
      items,
      nextCursor: rows.length > limit ? items[items.length - 1]!.id : null,
    };
  }
  async context(
    identity: ExternalIdentity,
    organizationId: string,
  ): Promise<{ organization: { id: string; name: string }; role: string }> {
    const actorId = await this.directory.findActor(identity);
    if (!actorId) throw new MembershipDenied();
    const row = await this.directory.get(actorId, organizationId);
    if (!row) throw new MembershipDenied();
    validateMembership(row);
    return { organization: { id: row.id, name: row.name }, role: row.role };
  }
}
