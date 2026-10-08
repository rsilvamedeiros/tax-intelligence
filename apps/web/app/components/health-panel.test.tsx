import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { axe } from 'jest-axe';
import { HealthPanel } from './health-panel';
const fetchMock = jest.fn();
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
});
afterEach(cleanup);
function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
describe('Health panel', () => {
  it('announces loading while the request is pending', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<HealthPanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Verificando');
  });
  it('shows a validated live status and passes automated accessibility checks', async () => {
    fetchMock.mockResolvedValue(
      response({
        status: 'ok',
        service: 'tax-intelligence-api',
        checks: { database: 'not_configured' },
      }),
    );
    const { container } = render(<HealthPanel />);
    expect(await screen.findByText('API disponível')).toBeInTheDocument();
    expect(screen.getByText(/Banco não configurado/)).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
  it('shows an empty state', async () => {
    fetchMock.mockResolvedValue(response(null, 204));
    render(<HealthPanel />);
    expect(
      await screen.findByText('Nenhum status disponível.'),
    ).toBeInTheDocument();
  });
  it.each([
    response({}, 503),
    response({ status: 'ok', service: 'wrong-service' }),
    response({ status: 'error', service: 'tax-intelligence-api' }),
  ])('handles failure and contract drift', async (result) => {
    fetchMock.mockResolvedValue(result);
    render(<HealthPanel />);
    expect(await screen.findByText(/API indisponível/)).toBeInTheDocument();
  });
  it('recovers after retry', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(
        response({ status: 'ok', service: 'tax-intelligence-api' }),
      );
    render(<HealthPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Tentar novamente' }),
    );
    expect(await screen.findByText('API disponível')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('cancels the request on unmount', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<HealthPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal: AbortSignal = fetchMock.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
