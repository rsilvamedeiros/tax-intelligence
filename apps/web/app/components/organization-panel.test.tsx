import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { axe } from 'jest-axe';
import { OrganizationPanel } from './organization-panel';
describe('Accessible organization selection', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const row = { id, name: 'Synthetic A', role: 'viewer' };
  const page = { items: [row], nextCursor: null };
  const context = { organization: { id, name: row.name }, role: row.role };
  const reply = (body: unknown, status = 200) =>
    ({ ok: status === 200, status, json: async () => body }) as Response;
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(reply(page));
  });
  it('announces loading without an authorized selection', () => {
    jest.mocked(fetch).mockReturnValue(new Promise(() => {}));
    render(<OrganizationPanel />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Carregando organizações',
    );
    expect(
      screen.queryByText(/Organização selecionada/),
    ).not.toBeInTheDocument();
  });
  it('loads allowed organizations and verifies context on selection', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(reply(context));
    render(<OrganizationPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    expect(
      await screen.findByText('Organização selecionada: Synthetic A'),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/organizations/${id}/context`,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.getByText('Leitura')).toBeInTheDocument();
  });
  it('offers an empty state without automatic membership creation', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValue(reply({ items: [], nextCursor: null }));
    render(<OrganizationPanel />);
    expect(
      await screen.findByText('Nenhuma organização disponível para sua conta.'),
    ).toBeInTheDocument();
  });
  it('supports retry and bounded pagination', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply({}, 503))
      .mockResolvedValueOnce(reply({ ...page, nextCursor: id }))
      .mockResolvedValueOnce(
        reply({ items: [{ ...row, name: 'Synthetic B' }], nextCursor: null }),
      );
    render(<OrganizationPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Tentar novamente' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Próximas organizações' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Selecionar Synthetic B' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/organizations?limit=25&cursor=${id}`,
      expect.any(Object),
    );
  });
  it('denies selection when the membership was revoked after listing', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(reply({}, 403))
      .mockResolvedValueOnce(reply({ items: [], nextCursor: null }));
    render(<OrganizationPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Acesso a esta organização indisponível',
    );
    expect(
      screen.queryByText(/Organização selecionada/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Atualizar organizações' }),
    );
    expect(
      await screen.findByText('Nenhuma organização disponível para sua conta.'),
    ).toBeInTheDocument();
  });
  it('expires the account boundary on unauthorized responses', async () => {
    const expire = jest.fn();
    jest.mocked(fetch).mockResolvedValue(reply({}, 401));
    render(<OrganizationPanel onSessionExpired={expire} />);
    await waitFor(() => expect(expire).toHaveBeenCalledTimes(1));
  });
  it('rejects unexpected success payloads', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValue(reply({ ...page, accessToken: 'private-sentinel' }));
    render(<OrganizationPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Organizações indisponíveis',
    );
    expect(screen.queryByText('private-sentinel')).not.toBeInTheDocument();
  });
  it('clears selected organization when focus refreshes the account', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(reply(context))
      .mockResolvedValueOnce(reply({ items: [], nextCursor: null }));
    render(<OrganizationPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    await screen.findByText(/Organização selecionada/);
    fireEvent(window, new Event('focus'));
    expect(
      await screen.findByText('Nenhuma organização disponível para sua conta.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Organização selecionada/),
    ).not.toBeInTheDocument();
  });
  it('does not restore an old selection after a refresh', async () => {
    let resolveContext!: (value: Response) => void;
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(page))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveContext = resolve;
          }),
      )
      .mockResolvedValueOnce(reply({ items: [], nextCursor: null }));
    render(<OrganizationPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    fireEvent(window, new Event('focus'));
    await screen.findByText('Nenhuma organização disponível para sua conta.');
    await act(async () => {
      resolveContext(reply(context));
    });
    await waitFor(() =>
      expect(
        screen.queryByText(/Organização selecionada/),
      ).not.toBeInTheDocument(),
    );
  });
  it('has no automated accessibility violations', async () => {
    const { container } = render(<OrganizationPanel />);
    await screen.findByRole('button', { name: 'Selecionar Synthetic A' });
    expect((await axe(container)).violations).toEqual([]);
  });
  it('does not accept a different organization or a failed context lookup', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(
        reply({
          ...context,
          organization: {
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Other',
          },
        }),
      )
      .mockResolvedValueOnce(reply({}, 503));
    render(<OrganizationPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível selecionar',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Selecionar Synthetic A' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível selecionar',
    );
    expect(
      screen.queryByText(/Organização selecionada/),
    ).not.toBeInTheDocument();
  });
  it('returns to the previous page and cancels pending transport on unmount', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply({ ...page, nextCursor: id }))
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(reply({ ...page, nextCursor: id }));
    const { unmount } = render(<OrganizationPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Próximas organizações' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Organizações anteriores' }),
    );
    await screen.findByRole('button', { name: 'Selecionar Synthetic A' });
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/organizations?limit=25',
      expect.any(Object),
    );
    const signal = jest.mocked(fetch).mock.calls.at(-1)![1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
