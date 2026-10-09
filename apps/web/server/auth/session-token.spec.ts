import { createTokenReader } from './session-token';
import type { AuthStore } from './handlers';
describe('Server-only access session reader', () => {
  const read = jest.fn();
  const store = { read } as unknown as AuthStore;
  const reader = createTokenReader(store);
  const request = (cookie = '') =>
    new Request('https://app.example.invalid', { headers: { cookie } });
  beforeEach(() => jest.resetAllMocks());
  it('does not read absent or duplicate session cookies', async () => {
    expect(await reader(request())).toBeUndefined();
    expect(
      await reader(request('tax_session=a; tax_session=b')),
    ).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
  it('reads only valid server session payloads', async () => {
    const data = {
      accessToken: 'server-only',
      csrfToken: 'synthetic',
      identity: {
        issuer: 'https://identity.example.invalid',
        subject: 'synthetic',
      },
    };
    read.mockResolvedValue(data);
    expect(await reader(request('tax_session=opaque'))).toEqual({
      accessToken: 'server-only',
    });
    for (const payload of [
      undefined,
      {},
      { ...data, accessToken: '' },
      { ...data, identity: {} },
      { ...data, csrfToken: undefined },
    ]) {
      read.mockResolvedValue(payload);
      expect(await reader(request('tax_session=opaque'))).toBeUndefined();
    }
  });
});
