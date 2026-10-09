import { MembershipDenied } from './organizations.service';
import {
  MembershipGrantService,
  MembershipGrantConflict,
  GrantTargetNotFound,
} from './membership-grant.service';
describe('Administrative membership grants', () => {
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const port = { findActor: jest.fn(), grant: jest.fn() };
  const service = new MembershipGrantService(port);
  beforeEach(() => {
    jest.resetAllMocks();
    port.findActor.mockResolvedValue('verified');
  });
  it.each(['granted', 'unchanged'])(
    'accepts %s with verified initiator',
    async (result) => {
      port.grant.mockResolvedValue(result);
      await expect(
        service.grant(identity, 'org', 'target', 'viewer', 'request'),
      ).resolves.toBeUndefined();
      expect(port.grant).toHaveBeenCalledWith({
        organizationId: 'org',
        initiatingActorId: 'verified',
        targetActorId: 'target',
        role: 'viewer',
        requestId: 'request',
      });
    },
  );
  it('denies unknown initiator without mutation', async () => {
    port.findActor.mockResolvedValue(undefined);
    await expect(
      service.grant(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toBeInstanceOf(MembershipDenied);
    expect(port.grant).not.toHaveBeenCalled();
  });
  it.each([
    ['denied', MembershipDenied],
    ['not_found', GrantTargetNotFound],
    ['conflict', MembershipGrantConflict],
  ])('maps %s', async (result, error) => {
    port.grant.mockResolvedValue(result);
    await expect(
      service.grant(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toBeInstanceOf(error);
  });
  it('preserves storage failures', async () => {
    port.grant.mockRejectedValue(new Error('storage failure'));
    await expect(
      service.grant(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toThrow('storage failure');
  });
  it('rejects unsupported adapter results', async () => {
    port.grant.mockResolvedValue('unexpected');
    await expect(
      service.grant(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toThrow('Unsupported');
  });
});
