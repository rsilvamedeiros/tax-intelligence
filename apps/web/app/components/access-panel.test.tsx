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
  it('composes administration only after verified admin selection and clears it on refresh', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(session))
      .mockResolvedValueOnce(
        reply({
          ...page,
          items: [{ ...page.items[0], role: 'organization_admin' }],
        }),
      )
      .mockResolvedValueOnce(
        reply({
          organization: { id, name: 'Synthetic A' },
          role: 'organization_admin',
        }),
      )
      .mockResolvedValueOnce(reply({ items: [], nextCursor: null }))
      .mockResolvedValue(reply(page));
    render(<AccessPanel />);
    expect(
      screen.queryByRole('heading', { name: 'Membros' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    await screen.findByRole('button', { name: 'Conceder acesso' });
    fireEvent.change(screen.getByLabelText('UUID do ator existente'), {
      target: { value: id },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Atualizar organizações' }),
    );
    expect(
      screen.queryByRole('heading', { name: 'Membros' }),
    ).not.toBeInTheDocument();
    await screen.findByRole('button', { name: 'Selecionar Synthetic A' });
  });
  it('does not offer administration to a verified viewer', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(session))
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(
        reply({ organization: { id, name: 'Synthetic A' }, role: 'viewer' }),
      );
    render(<AccessPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    await screen.findByText('Organização selecionada: Synthetic A');
    expect(
      screen.queryByRole('heading', { name: 'Membros' }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
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
