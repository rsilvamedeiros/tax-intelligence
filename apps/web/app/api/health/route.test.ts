/** @jest-environment node */
import { GET } from './route';
const fetchMock = jest.fn();
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
});
describe('Server-side health proxy', () => {
  it('forwards only a validated health response and disables caching', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'tax-intelligence-api' }),
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'tax-intelligence-api',
    });
  });
  it.each([
    { ok: false },
    { ok: true, json: async () => ({ token: 'synthetic-secret' }) },
    {
      ok: true,
      json: async () => ({ status: 'error', service: 'tax-intelligence-api' }),
    },
  ])('returns a safe 503 for upstream failures', async (value) => {
    fetchMock.mockResolvedValue(value);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'API indisponível' });
  });
  it('handles network errors', async () => {
    fetchMock.mockRejectedValue(new Error('synthetic-secret-connection'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic-secret');
  });
});
