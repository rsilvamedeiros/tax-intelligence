import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { axe } from 'jest-axe';
import { MembershipPanel } from './membership-panel';

const org = '00000000-0000-4000-8000-000000000001';
const actor = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const csrf = 'a'.repeat(43);
const member = { actorId: actor, role: 'viewer', status: 'active' };
const page = { items: [member], nextCursor: null };
const reply = (body: unknown, status = 200) =>
  ({ status, ok: status < 300, json: async () => body }) as Response;
const props = {
  organizationId: org,
  csrfToken: csrf,
  onSessionExpired: jest.fn(),
};
const start = () => render(<MembershipPanel {...props} />);
const row = () => screen.getByRole('listitem');
const fillGrant = (id = other) => {
  fireEvent.change(screen.getByLabelText('UUID do ator existente'), {
    target: { value: id },
  });
  fireEvent.change(screen.getByLabelText('Papel para concessão'), {
    target: { value: 'analyst' },
  });
};
beforeEach(() => {
  props.onSessionExpired.mockClear();
  global.fetch = jest.fn().mockResolvedValue(reply(page));
});
it('announces loading and waits before exposing mutation controls', () => {
  jest.mocked(fetch).mockReturnValue(new Promise(() => {}));
  start();
  expect(screen.getByRole('status')).toHaveTextContent('Carregando membros');
  expect(
    screen.queryByRole('button', { name: 'Conceder acesso' }),
  ).not.toBeInTheDocument();
});
it('renders minimal members and validates bounded transport', async () => {
  start();
  expect(await screen.findByText(actor)).toBeInTheDocument();
  expect(within(row()).getByText('Ativo')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    `/api/organizations/${org}/memberships?limit=25`,
    expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }),
  );
});
it('represents an empty directory and supports grant', async () => {
  jest.mocked(fetch).mockResolvedValue(reply({ items: [], nextCursor: null }));
  start();
  expect(
    await screen.findByText('Nenhum membro nesta página.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Conceder acesso' })).toBeEnabled();
});
it('navigates forwards, backwards and refreshes from the first page', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply({ ...page, nextCursor: actor }))
    .mockResolvedValueOnce(
      reply({ ...page, items: [{ ...member, actorId: other }] }),
    )
    .mockResolvedValue(reply(page));
  start();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Próximos membros' }),
  );
  await screen.findByText(other);
  expect(fetch).toHaveBeenLastCalledWith(
    `/api/organizations/${org}/memberships?limit=25&cursor=${actor}`,
    expect.any(Object),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Membros anteriores' }));
  await screen.findByText(actor);
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar membros' }));
  await screen.findByText(actor);
  expect(fetch).toHaveBeenLastCalledWith(
    `/api/organizations/${org}/memberships?limit=25`,
    expect.any(Object),
  );
});
it.each([reply({}, 503), reply({ ...page, token: 'private-sentinel' })])(
  'sanitizes unavailable or malformed pages and offers recovery',
  async (response) => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(response)
      .mockResolvedValue(reply(page));
    start();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Membros indisponíveis',
    );
    expect(screen.queryByText('private-sentinel')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Consultar membros novamente' }),
    );
    await screen.findByText(actor);
  },
);
it('rejects invalid UUID before forwarding a grant', async () => {
  start();
  await screen.findByText(actor);
  fillGrant('invalid');
  fireEvent.submit(screen.getByRole('form', { name: 'Conceder acesso' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Informe um UUID válido',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('grants using bound CSRF and refreshes after an empty 204', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(page))
    .mockResolvedValueOnce(reply(null, 204))
    .mockResolvedValue(reply(page));
  start();
  await screen.findByText(actor);
  fillGrant();
  fireEvent.submit(screen.getByRole('form', { name: 'Conceder acesso' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(jest.mocked(fetch).mock.calls[1]).toEqual([
    `/api/organizations/${org}/memberships/${other}`,
    expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ role: 'analyst' }),
      cache: 'no-store',
    }),
  ]);
  await screen.findByText(actor);
  expect(screen.getByLabelText('UUID do ator existente')).toHaveValue('');
});
it('changes the selected role without an optimistic update', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(page))
    .mockResolvedValueOnce(reply(null, 204))
    .mockResolvedValue(
      reply({ ...page, items: [{ ...member, role: 'reviewer' }] }),
    );
  start();
  await screen.findByText(actor);
  fireEvent.change(within(row()).getByLabelText('Novo papel'), {
    target: { value: 'reviewer' },
  });
  fireEvent.click(within(row()).getByRole('button', { name: 'Salvar papel' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(jest.mocked(fetch).mock.calls[1]).toEqual([
    `/api/organizations/${org}/memberships/${actor}`,
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ role: 'reviewer' }),
    }),
  ]);
  await screen.findByText(actor);
  expect(within(row()).getByLabelText('Novo papel')).toHaveValue('reviewer');
});
it('requires confirmation, focuses cancel and sends bodyless DELETE', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(page))
    .mockResolvedValueOnce(reply(null, 204))
    .mockResolvedValue(
      reply({ ...page, items: [{ ...member, status: 'revoked' }] }),
    );
  start();
  await screen.findByText(actor);
  fireEvent.click(
    within(row()).getByRole('button', { name: 'Revogar acesso' }),
  );
  expect(
    screen.getByRole('button', { name: 'Cancelar revogação' }),
  ).toHaveFocus();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar revogação' }));
  expect(
    within(row()).getByRole('button', { name: 'Revogar acesso' }),
  ).toHaveFocus();
  fireEvent.click(
    within(row()).getByRole('button', { name: 'Revogar acesso' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  const init = jest.mocked(fetch).mock.calls[1]![1]!;
  expect(init.method).toBe('DELETE');
  expect(init.body).toBeUndefined();
  await screen.findByText('Revogado');
  expect(within(row()).queryByRole('button')).not.toBeInTheDocument();
});
it.each([401, 403])(
  'clears data and controls on authorization status %s',
  async (status) => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(reply({}, status));
    start();
    await screen.findByText(actor);
    fillGrant();
    fireEvent.submit(screen.getByRole('form', { name: 'Conceder acesso' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(actor)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Conceder acesso' }),
    ).not.toBeInTheDocument();
    expect(props.onSessionExpired).toHaveBeenCalledTimes(
      status === 401 ? 1 : 0,
    );
    expect(
      screen.queryByRole('button', { name: 'Consultar membros novamente' }),
    ).not.toBeInTheDocument();
  },
);
it.each([400, 404, 409, 503, 200])(
  'requires consultation after rejected/ambiguous mutation %s',
  async (status) => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply(page))
      .mockResolvedValueOnce(reply({ message: 'private-sentinel' }, status))
      .mockResolvedValue(reply(page));
    start();
    await screen.findByText(actor);
    fillGrant();
    fireEvent.submit(screen.getByRole('form', { name: 'Conceder acesso' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(actor)).not.toBeInTheDocument();
    expect(screen.queryByText('private-sentinel')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Consultar membros novamente' }),
    );
    await screen.findByText(actor);
  },
);
it('serializes pending writes and cancels transport on unmount', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(page))
    .mockReturnValue(new Promise(() => {}));
  const { unmount } = start();
  await screen.findByText(actor);
  fillGrant();
  const form = screen.getByRole('form', { name: 'Conceder acesso' });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole('button', { name: 'Conceder acesso' }),
  ).toBeDisabled();
  const signal = jest.mocked(fetch).mock.calls[1]![1]!.signal!;
  unmount();
  expect(signal.aborted).toBe(true);
});
it('ignores stale JSON after unmount', async () => {
  let resolve!: (value: unknown) => void;
  const json = new Promise((r) => {
    resolve = r;
  });
  jest
    .mocked(fetch)
    .mockResolvedValue({ ...reply(page), json: () => json } as Response);
  const { unmount } = start();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  unmount();
  await act(async () => {
    resolve(page);
  });
  expect(props.onSessionExpired).not.toHaveBeenCalled();
});
it('has no automated accessibility violations including confirmation', async () => {
  const { container } = start();
  await screen.findByText(actor);
  fireEvent.click(
    within(row()).getByRole('button', { name: 'Revogar acesso' }),
  );
  expect((await axe(container)).violations).toEqual([]);
});
it.each([401, 403])(
  'denies the initial directory on status %s',
  async (status) => {
    jest.mocked(fetch).mockResolvedValue(reply({}, status));
    start();
    await screen.findByRole('alert');
    expect(props.onSessionExpired).toHaveBeenCalledTimes(
      status === 401 ? 1 : 0,
    );
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  },
);
it('requires consultation after a network failure without retrying a write', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(page))
    .mockRejectedValueOnce(new Error('private-sentinel'));
  start();
  await screen.findByText(actor);
  fillGrant();
  fireEvent.submit(screen.getByRole('form', { name: 'Conceder acesso' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível confirmar',
  );
  expect(screen.queryByText(actor)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('ignores a late unauthorized write after the selection is unmounted', async () => {
  let resolve!: (value: Response) => void;
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(page))
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
  const { unmount } = start();
  await screen.findByText(actor);
  fillGrant();
  fireEvent.submit(screen.getByRole('form', { name: 'Conceder acesso' }));
  unmount();
  await act(async () => {
    resolve(reply({}, 401));
  });
  expect(props.onSessionExpired).not.toHaveBeenCalled();
});
