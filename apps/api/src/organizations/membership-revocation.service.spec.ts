import { MembershipDenied } from './organizations.service';
import {
  LastAdministrator,
  MembershipRevocationService,
} from './membership-revocation.service';
describe('Administrative membership revocation', () => {
  const identity = {
    issuer: 'https://identity.example.invalid',
    subject: 'synthetic',
  };
  const port = { findActor: jest.fn(), revoke: jest.fn() };
  const service = new MembershipRevocationService(port);
  beforeEach(() => {
    jest.resetAllMocks();
    port.findActor.mockResolvedValue('verified-actor');
  });
  it.each(['revoked', 'unchanged'])(
    'accepts atomic result %s using only verified identity',
    async (result) => {
      port.revoke.mockResolvedValue(result);
      await expect(
        service.revoke(identity, 'org', 'target', 'request'),
      ).resolves.toBeUndefined();
      expect(port.findActor).toHaveBeenCalledWith(identity);
      expect(port.revoke).toHaveBeenCalledWith({
        organizationId: 'org',
        initiatingActorId: 'verified-actor',
        targetActorId: 'target',
        requestId: 'request',
      });
    },
  );
  it('denies unprovisioned identities without performing mutation', async () => {
    port.findActor.mockResolvedValue(undefined);
    await expect(
      service.revoke(identity, 'org', 'target', 'request'),
    ).rejects.toBeInstanceOf(MembershipDenied);
    expect(port.revoke).not.toHaveBeenCalled();
  });
  it('preserves transactional authorization denial', async () => {
    port.revoke.mockResolvedValue('denied');
    await expect(
      service.revoke(identity, 'org', 'target', 'request'),
    ).rejects.toBeInstanceOf(MembershipDenied);
  });
  it('reports last administrator conflict', async () => {
    port.revoke.mockResolvedValue('last_admin');
    await expect(
      service.revoke(identity, 'org', 'target', 'request'),
    ).rejects.toBeInstanceOf(LastAdministrator);
  });
  it('fails closed on storage failure', async () => {
    port.revoke.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      service.revoke(identity, 'org', 'target', 'request'),
    ).rejects.toThrow('storage unavailable');
  });
  it('rejects unsupported adapter results', async () => {
    port.revoke.mockResolvedValue('unexpected');
    await expect(
      service.revoke(identity, 'org', 'target', 'request'),
    ).rejects.toThrow('Unsupported');
  });
});
