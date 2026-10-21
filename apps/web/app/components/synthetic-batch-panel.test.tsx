import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { axe } from 'jest-axe';
import { SyntheticBatchPanel } from './synthetic-batch-panel';
it('requires an explicit new draft after success so a late double click cannot create a duplicate', async () => {
  jest
    .spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce(org)
    .mockReturnValueOnce(batch);
  render(<SyntheticBatchPanel {...props} />);
  fill();
  create();
  await screen.findByText(batch);
  expect(
    screen.getByRole('button', { name: 'Criar lote sintético' }),
  ).toBeDisabled();
  fireEvent.submit(screen.getByRole('form', { name: 'Criar lote sintético' }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Preparar novo lote' }));
  expect(screen.getByLabelText('Referência do documento 1')).toHaveValue('');
  fill();
  create();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(
    (jest.mocked(fetch).mock.calls[1]![1]!.headers as Record<string, string>)[
      'Idempotency-Key'
    ],
  ).toBe(batch);
});
const org = '00000000-0000-4000-8000-000000000001';
const batch = '00000000-0000-4000-8000-000000000002';
const props = {
  organizationId: org,
  csrfToken: 'a'.repeat(43),
  role: 'analyst' as const,
  onSessionExpired: jest.fn(),
};
const receipt = {
  id: batch,
  schemaVersion: 'synthetic-document-batch-v1',
  createdAt: '2026-10-21T00:00:00.000Z',
};
const reply = (body: unknown, status = 200) =>
  ({ status, ok: status < 300, json: async () => body }) as Response;
function fill() {
  fireEvent.change(screen.getByLabelText('Referência do documento 1'), {
    target: { value: 'demo-a' },
  });
  fireEvent.change(
    screen.getByLabelText('Total declarado em centavos do documento 1'),
    { target: { value: '999' } },
  );
  fireEvent.change(
    screen.getByLabelText('Valores das linhas em centavos do documento 1'),
    { target: { value: '100, 200' } },
  );
}
beforeEach(() => {
  jest.restoreAllMocks();
  props.onSessionExpired.mockClear();
  global.fetch = jest.fn().mockResolvedValue(reply(receipt, 201));
});
it('creates a validated synthetic batch through the BFF and shows its receipt', async () => {
  render(<SyntheticBatchPanel {...props} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Criar lote sintético' }));
  expect(await screen.findByText(batch)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    `/api/organizations/${org}/synthetic-document-batches`,
    expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': props.csrfToken,
        'Idempotency-Key': expect.stringMatching(/^[a-f0-9-]{36}$/i),
      },
      body: JSON.stringify({
        schemaVersion: 'synthetic-document-batch-v1',
        documents: [
          {
            reference: 'demo-a',
            declaredTotalCents: 999,
            lineAmountsCents: [100, 200],
          },
        ],
      }),
    }),
  );
});
it('retries an uncertain creation with exactly the same command and idempotency key', async () => {
  jest
    .mocked(fetch)
    .mockRejectedValueOnce(new Error('private-network'))
    .mockResolvedValueOnce(reply(receipt));
  render(<SyntheticBatchPanel {...props} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Criar lote sintético' }));
  await screen.findByText('Não foi possível confirmar a criação.');
  const first = jest.mocked(fetch).mock.calls[0]![1]!;
  fireEvent.click(
    screen.getByRole('button', { name: 'Repetir a mesma criação' }),
  );
  expect(await screen.findByText(batch)).toBeInTheDocument();
  const repeated = jest.mocked(fetch).mock.calls[1]![1]!;
  expect(repeated.body).toBe(first.body);
  expect(repeated.headers).toEqual(first.headers);
});
it('reads a batch by ID without exposing creation controls to a viewer', async () => {
  jest.mocked(fetch).mockResolvedValue(
    reply({
      ...receipt,
      documents: [
        {
          reference: 'stored-demo',
          declaredTotalCents: 999,
          lineAmountsCents: [100, 200],
        },
      ],
    }),
  );
  render(<SyntheticBatchPanel {...props} role="viewer" />);
  expect(
    screen.queryByRole('form', { name: 'Criar lote sintético' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Identificador do lote'), {
    target: { value: batch },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
  const detail = await screen.findByRole('region', { name: 'Detalhe do lote' });
  expect(within(detail).getByText('stored-demo')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    `/api/organizations/${org}/synthetic-document-batches/${batch}`,
    expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }),
  );
});
const documents = [
  {
    reference: 'stored-demo',
    declaredTotalCents: 999,
    lineAmountsCents: [100, 200],
  },
];
const create = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Criar lote sintético' }));
function lookup(id = batch) {
  fireEvent.change(screen.getByLabelText('Identificador do lote'), {
    target: { value: id },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
}
it.each(['organization_admin', 'analyst', 'reviewer', 'viewer'] as const)(
  'presents role-appropriate controls for %s',
  (role) => {
    render(<SyntheticBatchPanel {...props} role={role} />);
    expect(
      screen.queryByRole('form', { name: 'Criar lote sintético' }) !== null,
    ).toBe(['organization_admin', 'analyst'].includes(role));
    expect(
      screen.getByRole('form', { name: 'Consultar lote sintético' }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(['', '-1', '1.5', '1e2', 'NaN', '1000000001', '999999999999'])(
  'rejects invalid declared cents %s without transport',
  (value) => {
    render(<SyntheticBatchPanel {...props} />);
    fill();
    fireEvent.change(
      screen.getByLabelText('Total declarado em centavos do documento 1'),
      { target: { value } },
    );
    create();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(['', '1,', '1.2', '-1', '1000000001', Array(11).fill('1').join(',')])(
  'rejects invalid lines %#',
  (value) => {
    render(<SyntheticBatchPanel {...props} />);
    fill();
    fireEvent.change(
      screen.getByLabelText('Valores das linhas em centavos do documento 1'),
      { target: { value } },
    );
    create();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(['bad reference', 'UPPER', 'a'.repeat(41)])(
  'rejects invalid reference %#',
  (value) => {
    render(<SyntheticBatchPanel {...props} />);
    fill();
    fireEvent.change(screen.getByLabelText('Referência do documento 1'), {
      target: { value },
    });
    create();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('preserves inclusive integer bounds and does not calculate total discrepancies', async () => {
  render(<SyntheticBatchPanel {...props} />);
  fill();
  fireEvent.change(
    screen.getByLabelText('Total declarado em centavos do documento 1'),
    { target: { value: '1000000000' } },
  );
  fireEvent.change(
    screen.getByLabelText('Valores das linhas em centavos do documento 1'),
    { target: { value: '0, 1000000000' } },
  );
  create();
  await screen.findByText(batch);
  expect(
    JSON.parse(jest.mocked(fetch).mock.calls[0]![1]!.body as string)
      .documents[0],
  ).toEqual({
    reference: 'demo-a',
    declaredTotalCents: 1000000000,
    lineAmountsCents: [0, 1000000000],
  });
});
it('adds up to ten documents, focuses the new reference and removes only draft rows', async () => {
  render(<SyntheticBatchPanel {...props} />);
  fill();
  for (let index = 2; index <= 10; index++) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Adicionar documento' }),
    );
    expect(
      screen.getByLabelText(`Referência do documento ${index}`),
    ).toHaveFocus();
    fireEvent.change(
      screen.getByLabelText(`Referência do documento ${index}`),
      { target: { value: `demo-${index}` } },
    );
    fireEvent.change(
      screen.getByLabelText(
        `Total declarado em centavos do documento ${index}`,
      ),
      { target: { value: '0' } },
    );
    fireEvent.change(
      screen.getByLabelText(
        `Valores das linhas em centavos do documento ${index}`,
      ),
      { target: { value: '0' } },
    );
  }
  expect(
    screen.getByRole('button', { name: 'Adicionar documento' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remover documento 10' }));
  expect(
    screen.queryByLabelText('Referência do documento 10'),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Adicionar documento' }),
    ).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar documento' }));
  fireEvent.change(screen.getByLabelText('Referência do documento 10'), {
    target: { value: 'demo-10' },
  });
  fireEvent.change(
    screen.getByLabelText('Total declarado em centavos do documento 10'),
    { target: { value: '0' } },
  );
  fireEvent.change(
    screen.getByLabelText('Valores das linhas em centavos do documento 10'),
    { target: { value: '0' } },
  );
  create();
  await screen.findByText(batch);
  expect(
    JSON.parse(jest.mocked(fetch).mock.calls[0]![1]!.body as string).documents,
  ).toHaveLength(10);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects duplicate references across documents', () => {
  render(<SyntheticBatchPanel {...props} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar documento' }));
  fireEvent.change(screen.getByLabelText('Referência do documento 2'), {
    target: { value: 'demo-a' },
  });
  fireEvent.change(
    screen.getByLabelText('Total declarado em centavos do documento 2'),
    { target: { value: '0' } },
  );
  fireEvent.change(
    screen.getByLabelText('Valores das linhas em centavos do documento 2'),
    { target: { value: '0' } },
  );
  create();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
it('serializes submissions and lookups while a request is pending', async () => {
  let resolve!: (response: Response) => void;
  jest.mocked(fetch).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<SyntheticBatchPanel {...props} />);
  fill();
  create();
  expect(screen.getByRole('status')).toHaveTextContent('Criando lote');
  fireEvent.submit(screen.getByRole('form', { name: 'Criar lote sintético' }));
  fireEvent.submit(
    screen.getByRole('form', { name: 'Consultar lote sintético' }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Referência do documento 1')).toBeDisabled();
  await act(async () => resolve(reply(receipt, 201)));
  expect(await screen.findByText(batch)).toBeInTheDocument();
});
it.each([400, 413, 415])(
  'allows correction after definitive rejection %s with a new key',
  async (status) => {
    jest
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(org)
      .mockReturnValueOnce(batch);
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(reply({ secret: 'private-error' }, status))
      .mockResolvedValueOnce(reply(receipt, 201));
    render(<SyntheticBatchPanel {...props} />);
    fill();
    create();
    await screen.findByText(/Entrada rejeitada/);
    expect(screen.getByLabelText('Referência do documento 1')).toBeEnabled();
    create();
    await screen.findByText(batch);
    const calls = jest.mocked(fetch).mock.calls;
    expect(
      (calls[0]![1]!.headers as Record<string, string>)['Idempotency-Key'],
    ).toBe(org);
    expect(
      (calls[1]![1]!.headers as Record<string, string>)['Idempotency-Key'],
    ).toBe(batch);
    expect(screen.queryByText('private-error')).not.toBeInTheDocument();
  },
);
it.each([500, 503, 202])(
  'retains uncertain intent after %s and locks draft edits',
  async (status) => {
    jest
      .mocked(fetch)
      .mockResolvedValue(reply({ secret: 'private-error' }, status));
    render(<SyntheticBatchPanel {...props} />);
    fill();
    create();
    await screen.findByText('Não foi possível confirmar a criação.');
    expect(screen.getByLabelText('Referência do documento 1')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Criar lote sintético' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Repetir a mesma criação' }),
    ).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it('treats malformed success as uncertain and preserves the submitted intention', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(
      reply({ ...receipt, private: 'private-output' }, 201),
    )
    .mockResolvedValueOnce(reply(receipt));
  render(<SyntheticBatchPanel {...props} />);
  fill();
  create();
  await screen.findByText('Não foi possível confirmar a criação.');
  fireEvent.change(screen.getByLabelText('Referência do documento 1'), {
    target: { value: 'forged-change' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Repetir a mesma criação' }),
  );
  await screen.findByText(batch);
  const calls = jest.mocked(fetch).mock.calls;
  expect(calls[1]![1]!.body).toBe(calls[0]![1]!.body);
  expect(screen.queryByText('private-output')).not.toBeInTheDocument();
});
it('locks conflicted creation without replacing its key or automatically retrying', async () => {
  jest.mocked(fetch).mockResolvedValue(reply({}, 409));
  render(<SyntheticBatchPanel {...props} />);
  fill();
  create();
  await screen.findByText(/Conflito na criação/);
  expect(
    screen.queryByRole('button', { name: 'Repetir a mesma criação' }),
  ).not.toBeInTheDocument();
  fireEvent.submit(screen.getByRole('form', { name: 'Criar lote sintético' }));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(['create', 'lookup'] as const)(
  'expires the session and clears controls on %s 401',
  async (operation) => {
    jest.mocked(fetch).mockResolvedValue(reply({}, 401));
    render(<SyntheticBatchPanel {...props} />);
    if (operation === 'create') {
      fill();
      create();
    } else lookup();
    await screen.findByText('Sessão encerrada. Entre novamente.');
    expect(props.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  },
);
it.each(['create', 'lookup'] as const)(
  'clears the context without expiring the account on %s 403',
  async (operation) => {
    jest.mocked(fetch).mockResolvedValue(reply({}, 403));
    render(<SyntheticBatchPanel {...props} />);
    if (operation === 'create') {
      fill();
      create();
    } else lookup();
    await screen.findByText(/Acesso indisponível/);
    expect(props.onSessionExpired).not.toHaveBeenCalled();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  },
);
it('validates lookup ID locally and represents not found separately', async () => {
  render(<SyntheticBatchPanel {...props} />);
  lookup('bad');
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'identificador de lote válido',
  );
  jest.mocked(fetch).mockResolvedValue(reply({}, 404));
  lookup();
  await screen.findByText('Lote não encontrado nesta organização.');
  expect(
    screen.queryByRole('region', { name: 'Detalhe do lote' }),
  ).not.toBeInTheDocument();
});
it.each([500, 503, 201])('sanitizes lookup failure %s', async (status) => {
  jest
    .mocked(fetch)
    .mockResolvedValue(reply({ private: 'private-output' }, status));
  render(<SyntheticBatchPanel {...props} />);
  lookup();
  await screen.findByText('Consulta indisponível. Tente novamente.');
  expect(screen.queryByText('private-output')).not.toBeInTheDocument();
});
it.each([
  { ...receipt, documents: [] },
  { ...receipt, id: org, documents },
])('rejects invalid or mismatched lookup output %#', async (value) => {
  jest.mocked(fetch).mockResolvedValue(reply(value));
  render(<SyntheticBatchPanel {...props} />);
  lookup();
  await screen.findByText('Consulta indisponível. Tente novamente.');
  expect(
    screen.queryByRole('region', { name: 'Detalhe do lote' }),
  ).not.toBeInTheDocument();
});
it.each(['organization', 'session', 'role'] as const)(
  'clears completed data when %s changes',
  async (context) => {
    const view = render(<SyntheticBatchPanel {...props} />);
    fill();
    create();
    await screen.findByText(batch);
    view.rerender(
      <SyntheticBatchPanel
        {...props}
        organizationId={context === 'organization' ? batch : org}
        csrfToken={context === 'session' ? 'b'.repeat(43) : props.csrfToken}
        role={context === 'role' ? 'viewer' : props.role}
      />,
    );
    expect(screen.queryByText(batch)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Identificador do lote')).toHaveValue('');
    if (context !== 'role')
      expect(screen.getByLabelText('Referência do documento 1')).toHaveValue(
        '',
      );
  },
);
it.each(['create', 'lookup'] as const)(
  'aborts pending %s and ignores its late result after a context switch',
  async (operation) => {
    let resolve!: (response: Response) => void;
    jest.mocked(fetch).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<SyntheticBatchPanel {...props} />);
    if (operation === 'create') {
      fill();
      create();
    } else lookup();
    const signal = jest.mocked(fetch).mock.calls[0]![1]!.signal!;
    view.rerender(<SyntheticBatchPanel {...props} organizationId={batch} />);
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve(
        reply(
          operation === 'create' ? receipt : { ...receipt, documents },
          operation === 'create' ? 201 : 200,
        ),
      ),
    );
    expect(screen.queryByText(batch)).not.toBeInTheDocument();
    expect(screen.queryByText('stored-demo')).not.toBeInTheDocument();
  },
);
it.each(['create', 'lookup'] as const)(
  'ignores late %s JSON after unmount',
  async (operation) => {
    let resolve!: (body: unknown) => void;
    const json = jest.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    jest.mocked(fetch).mockResolvedValue({
      status: operation === 'create' ? 201 : 200,
      json,
    } as unknown as Response);
    const view = render(<SyntheticBatchPanel {...props} />);
    if (operation === 'create') {
      fill();
      create();
    } else lookup();
    await waitFor(() => expect(json).toHaveBeenCalled());
    const signal = jest.mocked(fetch).mock.calls[0]![1]!.signal!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve(operation === 'create' ? receipt : { ...receipt, documents }),
    );
    expect(props.onSessionExpired).not.toHaveBeenCalled();
  },
);
it('does not persist draft, receipt or idempotency key and has accessible controls', async () => {
  const storage = jest.spyOn(Storage.prototype, 'setItem');
  const view = render(<SyntheticBatchPanel {...props} />);
  expect((await axe(view.container)).violations).toEqual([]);
  fill();
  create();
  await screen.findByText(batch);
  jest.mocked(fetch).mockResolvedValue(reply({ ...receipt, documents }));
  lookup();
  await screen.findByRole('region', { name: 'Detalhe do lote' });
  expect((await axe(view.container)).violations).toEqual([]);
  expect(storage).not.toHaveBeenCalled();
});
it.each([401, 403])(
  'does not apply a stale %s response to a replacement session',
  async (status) => {
    let resolve!: (response: Response) => void;
    jest.mocked(fetch).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<SyntheticBatchPanel {...props} />);
    fill();
    create();
    view.rerender(
      <SyntheticBatchPanel {...props} csrfToken={'b'.repeat(43)} />,
    );
    await act(async () => resolve(reply({}, status)));
    expect(props.onSessionExpired).not.toHaveBeenCalled();
    expect(
      screen.getByRole('form', { name: 'Criar lote sintético' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);
it('fails safely before transport if an idempotency key cannot be generated', async () => {
  jest.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => {
    throw new Error('private-random');
  });
  render(<SyntheticBatchPanel {...props} />);
  fill();
  create();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Não foi possível iniciar',
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Referência do documento 1')).toBeEnabled();
  expect(screen.queryByText('private-random')).not.toBeInTheDocument();
});
