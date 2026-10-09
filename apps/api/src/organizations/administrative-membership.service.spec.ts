import { AdministrativeMembershipService } from './administrative-membership.service';
import { MembershipDenied } from './organizations.service';

describe('Administrative membership directory', () => {
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const org = '00000000-0000-4000-8000-000000000001';
  const ids = [2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
  const findActor = jest.fn();
  const listMembers = jest.fn();
  const service = new AdministrativeMembershipService({
    findActor,
    listMembers,
  });
  beforeEach(() => {
    jest.resetAllMocks();
    findActor.mockResolvedValue('verified-actor');
  });
  it('uses verified identity and bounds the page with one extra member', async () => {
    listMembers.mockResolvedValue(
      ids.map((actorId, i) => ({
        actorId,
        role: 'viewer',
        status: i === 1 ? 'revoked' : 'active',
      })),
    );
    const page = await service.list(identity, org, 2, ids[0]);
    expect(findActor).toHaveBeenCalledWith(identity);
    expect(listMembers).toHaveBeenCalledWith('verified-actor', org, 3, ids[0]);
    expect(page).toEqual({
      items: [
        { actorId: ids[0], role: 'viewer', status: 'active' },
        { actorId: ids[1], role: 'viewer', status: 'revoked' },
      ],
      nextCursor: ids[1],
    });
  });
  it('distinguishes an authorized empty page from denial', async () => {
    listMembers.mockResolvedValue([]);
    expect(await service.list(identity, org, 25)).toEqual({
      items: [],
      nextCursor: null,
    });
    listMembers.mockResolvedValue(undefined);
    await expect(service.list(identity, org, 25)).rejects.toBeInstanceOf(
      MembershipDenied,
    );
  });
  it('denies an unprovisioned identity without querying memberships', async () => {
    findActor.mockResolvedValue(undefined);
    await expect(service.list(identity, org, 25)).rejects.toBeInstanceOf(
      MembershipDenied,
    );
    expect(listMembers).not.toHaveBeenCalled();
  });
  it('projects only public fields and ends an exact page', async () => {
    listMembers.mockResolvedValue([
      {
        actorId: ids[0],
        role: 'organization_admin',
        status: 'active',
        subject: 'private-subject',
      },
    ]);
    expect(await service.list(identity, org, 1)).toEqual({
      items: [
        { actorId: ids[0], role: 'organization_admin', status: 'active' },
      ],
      nextCursor: null,
    });
  });
  it.each([
    { role: 'super_admin', status: 'active' },
    { role: 'viewer', status: 'unknown' },
  ])('fails closed on unsupported storage values %#', async (fields) => {
    listMembers.mockResolvedValue([{ actorId: ids[0], ...fields }]);
    await expect(service.list(identity, org, 25)).rejects.toThrow(
      'Unsupported',
    );
  });
  it('propagates a storage failure for sanitized transport mapping', async () => {
    const error = new Error('private-storage');
    listMembers.mockRejectedValue(error);
    await expect(service.list(identity, org, 25)).rejects.toBe(error);
  });
});
