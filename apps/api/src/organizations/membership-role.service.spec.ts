import { MembershipDenied } from './organizations.service';
import { LastAdministrator } from './membership-revocation.service';
import {
  MembershipRoleService,
  MembershipNotFound,
} from './membership-role.service';
describe('Administrative role changes', () => {
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const port = { findActor: jest.fn(), changeRole: jest.fn() };
  const service = new MembershipRoleService(port);
  beforeEach(() => {
    jest.resetAllMocks();
    port.findActor.mockResolvedValue('verified');
  });
  it.each(['changed', 'unchanged'])(
    'accepts %s with verified initiator',
    async (result) => {
      port.changeRole.mockResolvedValue(result);
      await expect(
        service.change(identity, 'org', 'target', 'viewer', 'request'),
      ).resolves.toBeUndefined();
      expect(port.changeRole).toHaveBeenCalledWith({
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
      service.change(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toBeInstanceOf(MembershipDenied);
    expect(port.changeRole).not.toHaveBeenCalled();
  });
  it.each([
    ['denied', MembershipDenied],
    ['not_found', MembershipNotFound],
    ['last_admin', LastAdministrator],
  ])('maps %s', async (result, error) => {
    port.changeRole.mockResolvedValue(result);
    await expect(
      service.change(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toBeInstanceOf(error);
  });
  it('preserves storage failures', async () => {
    port.changeRole.mockRejectedValue(new Error('storage failure'));
    await expect(
      service.change(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toThrow('storage failure');
  });
  it('rejects unsupported adapter results', async () => {
    port.changeRole.mockResolvedValue('unexpected');
    await expect(
      service.change(identity, 'org', 'target', 'viewer', 'request'),
    ).rejects.toThrow('Unsupported');
  });
});
