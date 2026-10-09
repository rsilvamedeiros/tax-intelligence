import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccessPanel } from './access-panel';
describe('Account and organization composition', () => {
  const session = {
    authenticated: true,
    identity: {
      issuer: 'https://identity.example.invalid',
      subject: 'synthetic',
    },
    csrfToken: 'x'.repeat(43),
  };
  const id = '00000000-0000-4000-8000-000000000001';
  const page = {
    items: [{ id, name: 'Synthetic A', role: 'viewer' }],
    nextCursor: null,
  };
  const reply = (body: unknown, status = 200) =>
    ({ ok: status < 300, status, json: async () => body }) as Response;
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('removes organization data immediately when logout starts', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(session))
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(reply({}, 204));
    render(<AccessPanel />);
    await screen.findByRole('button', { name: 'Selecionar Synthetic A' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.queryByText('Synthetic A')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Entrar' }),
    ).toBeInTheDocument();
  });
  it('replaces the account boundary on upstream unauthorized status', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(session))
      .mockResolvedValueOnce(reply({}, 401));
    render(<AccessPanel />);
    expect(
      await screen.findByRole('link', { name: 'Entrar' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Organizações' }),
    ).not.toBeInTheDocument();
  });
  it('clears the previous account when a different session arrives', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(session))
      .mockResolvedValueOnce(reply(page));
    render(<AccessPanel />);
    await screen.findByRole('button', { name: 'Selecionar Synthetic A' });
    jest
      .mocked(fetch)
      .mockImplementation(async (url) =>
        reply(
          String(url).includes('/auth/session')
            ? { ...session, csrfToken: 'y'.repeat(43) }
            : { items: [], nextCursor: null },
        ),
      );
    fireEvent(window, new Event('focus'));
    await waitFor(() =>
      expect(screen.queryByText('Synthetic A')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText('Nenhuma organização disponível para sua conta.'),
    ).toBeInTheDocument();
  });
});
