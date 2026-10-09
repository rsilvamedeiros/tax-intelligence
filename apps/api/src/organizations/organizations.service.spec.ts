import {
  OrganizationsService,
  MembershipDenied,
  type MembershipDirectory,
} from './organizations.service';
describe('Organization membership queries', () => {
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic-subject',
  };
  const a = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Synthetic A',
    role: 'viewer',
  };
  const b = {
    ...a,
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Synthetic B',
  };
  let directory: jest.Mocked<MembershipDirectory>;
  let service: OrganizationsService;
  beforeEach(() => {
    directory = {
      findActor: jest.fn().mockResolvedValue('actor-a'),
      list: jest.fn().mockResolvedValue([a]),
      get: jest.fn().mockResolvedValue(a),
    };
    service = new OrganizationsService(directory);
  });
  it('lists memberships of the resolved actor and bounds the page', async () => {
    directory.list.mockResolvedValue([a, b]);
    expect(await service.list(identity, 1)).toEqual({
      items: [a],
      nextCursor: a.id,
    });
    expect(directory.findActor).toHaveBeenCalledWith(identity);
    expect(directory.list).toHaveBeenCalledWith('actor-a', 2, undefined);
  });
  it('passes the cursor and ends pagination without another row', async () => {
    expect(await service.list(identity, 25, b.id)).toEqual({
      items: [a],
      nextCursor: null,
    });
    expect(directory.list).toHaveBeenCalledWith('actor-a', 26, b.id);
  });
  it('does not create an actor when an identity is not provisioned', async () => {
    directory.findActor.mockResolvedValue(undefined);
    expect(await service.list(identity, 25)).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(directory.list).not.toHaveBeenCalled();
  });
  it('returns context only for an active membership', async () => {
    expect(await service.context(identity, a.id)).toEqual({
      organization: { id: a.id, name: a.name },
      role: a.role,
    });
    expect(directory.get).toHaveBeenCalledWith('actor-a', a.id);
  });
  it('denies unknown actors before consulting another organization', async () => {
    directory.findActor.mockResolvedValue(undefined);
    await expect(service.context(identity, b.id)).rejects.toBeInstanceOf(
      MembershipDenied,
    );
    expect(directory.get).not.toHaveBeenCalled();
  });
  it('denies missing or revoked membership without returning organization data', async () => {
    directory.get.mockResolvedValue(undefined);
    await expect(service.context(identity, b.id)).rejects.toBeInstanceOf(
      MembershipDenied,
    );
  });
  it('fails closed for an unsupported membership role', async () => {
    directory.get.mockResolvedValue({ ...a, role: 'super_admin' });
    await expect(service.context(identity, a.id)).rejects.toThrow();
    directory.list.mockResolvedValue([{ ...a, role: 'super_admin' }]);
    await expect(service.list(identity, 25)).rejects.toThrow();
  });
  it('propagates infrastructure failure without granting an empty context', async () => {
    directory.findActor.mockRejectedValue(new Error('synthetic unavailable'));
    await expect(service.list(identity, 25)).rejects.toThrow(
      'synthetic unavailable',
    );
  });
});
