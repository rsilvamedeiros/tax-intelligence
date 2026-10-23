import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { axe } from 'jest-axe';
import {
  SyntheticDiagnosticPanel,
  SyntheticDocumentWorkspace,
} from './synthetic-diagnostic-panel';
const org = '00000000-0000-4000-8000-000000000001';
const batchId = '00000000-0000-4000-8000-000000000002';
const executionId = '00000000-0000-4000-8000-000000000003';
const props = {
  organizationId: org,
  role: 'analyst' as const,
  csrfToken: 'a'.repeat(43),
  onSessionExpired: jest.fn(),
};
const receipt = {
  id: executionId,
  batchId,
  ruleId: 'DEMO-TOTAL-001',
  ruleVersion: '1.0.0',
  createdAt: '2026-10-23T00:00:00.000Z',
};
const detail = {
  ...receipt,
  diagnostic: {
    schemaVersion: 'synthetic-document-diagnostic-v1',
    rule: {
      id: 'DEMO-TOTAL-001',
      version: '1.0.0',
      source: 'project-fixture-specification',
      fiscalValidity: 'none',
    },
    documents: [
      {
        reference: 'demo',
        declaredTotalCents: 999,
        lineAmountsCents: [100, 200],
        computedTotalCents: 300,
        differenceCents: 699,
        outcome: 'mismatch',
      },
      {
        reference: 'match',
        declaredTotalCents: 0,
        lineAmountsCents: [0],
        computedTotalCents: 0,
        differenceCents: 0,
        outcome: 'match',
      },
    ],
  },
};
const reply = (body: unknown, status = 200) =>
  ({ status, json: async () => body }) as Response;
beforeEach(() => {
  jest.restoreAllMocks();
  global.fetch = jest.fn().mockResolvedValue(reply(receipt, 201));
  props.onSessionExpired.mockClear();
});
it('creates a diagnostic with only the known batch reference and session CSRF', async () => {
  render(<SyntheticDiagnosticPanel {...props} />);
  fireEvent.change(screen.getByLabelText('Lote para diagnóstico'), {
    target: { value: batchId },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Executar diagnóstico' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledWith(
    `/api/organizations/${org}/synthetic-diagnostic-executions`,
    expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({ batchId }),
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': props.csrfToken,
      },
    }),
  );
  expect(await screen.findByText(executionId)).toBeVisible();
});
it('recovers an uncertain result by freezing the batch and repeating the identical body explicitly', async () => {
  jest
    .mocked(fetch)
    .mockRejectedValueOnce(new Error('connection-lost'))
    .mockResolvedValueOnce(reply(receipt, 200));
  render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
  fireEvent.click(screen.getByRole('button', { name: 'Executar diagnóstico' }));
  const retry = await screen.findByRole('button', {
    name: 'Repetir o mesmo diagnóstico',
  });
  expect(screen.getByLabelText('Lote para diagnóstico')).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(retry);
  expect(await screen.findByText(executionId)).toBeVisible();
  expect(jest.mocked(fetch).mock.calls[1]![1]!.body).toBe(
    jest.mocked(fetch).mock.calls[0]![1]!.body,
  );
});
function create() {
  fireEvent.click(screen.getByRole('button', { name: 'Executar diagnóstico' }));
}
function lookup(value = executionId) {
  fireEvent.change(screen.getByLabelText('Identificador do diagnóstico'), {
    target: { value },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Consultar diagnóstico' }),
  );
}
it.each(['organization_admin', 'analyst'] as const)(
  'allows %s to create a known batch without an idempotency key',
  async (role) => {
    render(
      <SyntheticDiagnosticPanel
        {...props}
        role={role}
        initialBatchId={batchId}
      />,
    );
    create();
    expect(await screen.findByText('Diagnóstico registrado.')).toBeVisible();
    expect(Object.keys(jest.mocked(fetch).mock.calls[0]![1]!.headers!)).toEqual(
      ['Content-Type', 'x-csrf-token'],
    );
    expect(screen.getByLabelText('Identificador do diagnóstico')).toHaveValue(
      executionId,
    );
  },
);
it.each(['viewer', 'reviewer'] as const)(
  'lets %s read without creation controls',
  async (role) => {
    jest.mocked(fetch).mockResolvedValue(reply(detail));
    render(<SyntheticDiagnosticPanel {...props} role={role} />);
    expect(
      screen.queryByRole('form', { name: 'Executar diagnóstico sintético' }),
    ).not.toBeInTheDocument();
    lookup();
    expect(
      await screen.findByRole('region', { name: 'Resultado do diagnóstico' }),
    ).toBeVisible();
    expect(jest.mocked(fetch).mock.calls[0]![1]).not.toHaveProperty('method');
    expect(jest.mocked(fetch).mock.calls[0]![1]).not.toHaveProperty('headers');
  },
);
it('uses the API evidence without arithmetic or interpretation in React', async () => {
  jest.mocked(fetch).mockResolvedValue(reply(detail));
  render(<SyntheticDiagnosticPanel {...props} />);
  lookup();
  const table = await screen.findByRole('table', {
    name: 'Evidências por documento, em centavos',
  });
  const rows = within(table).getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(
    within(rows[1]!).getByRole('rowheader', { name: 'demo' }),
  ).toBeVisible();
  expect(
    within(rows[1]!).getByRole('cell', { name: '100, 200' }),
  ).toBeVisible();
  expect(within(rows[1]!).getByRole('cell', { name: '300' })).toBeVisible();
  expect(within(rows[1]!).getByRole('cell', { name: '699' })).toBeVisible();
  expect(
    within(rows[1]!).getByRole('cell', { name: 'Divergência demonstrativa' }),
  ).toBeVisible();
  expect(
    within(rows[2]!).getByRole('cell', { name: 'Totais correspondem' }),
  ).toBeVisible();
  expect(screen.getByText(/Fonte: especificação de fixture/)).toBeVisible();
});
it('does not fetch details until the user requests the recorded result', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(receipt, 201))
    .mockResolvedValueOnce(reply(detail));
  render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
  create();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Consultar resultado' }),
  );
  expect(await screen.findByText('Diagnóstico consultado.')).toBeVisible();
  expect(jest.mocked(fetch).mock.calls[1]![0]).toBe(
    `/api/organizations/${org}/synthetic-diagnostic-executions/${executionId}`,
  );
});
it('rejects invalid selectors locally and normalizes uppercase references', async () => {
  render(<SyntheticDiagnosticPanel {...props} />);
  create();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Informe um identificador de lote válido.',
  );
  lookup('bad');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Lote para diagnóstico'), {
    target: { value: ` ${batchId.toUpperCase()} ` },
  });
  create();
  expect(await screen.findByText('Diagnóstico registrado.')).toBeVisible();
  expect(jest.mocked(fetch).mock.calls[0]![1]!.body).toBe(
    JSON.stringify({ batchId }),
  );
});
it.each([400, 404, 413, 415])(
  'allows reference correction after POST %s',
  async (status) => {
    jest.mocked(fetch).mockResolvedValue(reply({ private: true }, status));
    render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
    create();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      status === 404
        ? 'Lote não encontrado nesta organização.'
        : 'Referência rejeitada.',
    );
    expect(screen.getByLabelText('Lote para diagnóstico')).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Repetir o mesmo diagnóstico' }),
    ).not.toBeInTheDocument();
  },
);
it.each([503, 500, 409, 204])(
  'keeps the same intention after uncertain POST %s',
  async (status) => {
    jest.mocked(fetch).mockResolvedValue(reply({}, status));
    render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
    create();
    expect(
      await screen.findByRole('button', {
        name: 'Repetir o mesmo diagnóstico',
      }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Lote para diagnóstico'), {
      target: { value: executionId },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Executar diagnóstico sintético' }),
    );
    expect(screen.getByLabelText('Lote para diagnóstico')).toHaveValue(batchId);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { ...receipt, batchId: executionId },
  { ...receipt, secret: 'private' },
  {},
  null,
])('treats invalid receipt as uncertain: %j', async (body) => {
  jest.mocked(fetch).mockResolvedValue(reply(body, 201));
  render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
  create();
  expect(
    await screen.findByRole('button', { name: 'Repetir o mesmo diagnóstico' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Recibo do diagnóstico' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).not.toHaveTextContent('private');
});
it('treats unreadable success JSON as uncertain', async () => {
  const response = reply({}, 201);
  jest.spyOn(response, 'json').mockRejectedValue(new Error('private-json'));
  jest.mocked(fetch).mockResolvedValue(response);
  render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
  create();
  expect(
    await screen.findByRole('button', { name: 'Repetir o mesmo diagnóstico' }),
  ).toBeVisible();
  expect(screen.getByRole('alert')).not.toHaveTextContent('private-json');
});
it.each([401, 403])(
  'clears data and controls after POST %s',
  async (status) => {
    const denied = jest.fn();
    jest.mocked(fetch).mockResolvedValue(reply({}, status));
    render(
      <SyntheticDiagnosticPanel
        {...props}
        onAccessDenied={denied}
        initialBatchId={batchId}
      />,
    );
    create();
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('form', { name: 'Executar diagnóstico sintético' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Consultar diagnóstico sintético' }),
    ).not.toBeInTheDocument();
    expect(props.onSessionExpired).toHaveBeenCalledTimes(
      status === 401 ? 1 : 0,
    );
    expect(denied).toHaveBeenCalledTimes(status === 403 ? 1 : 0);
  },
);
it.each([401, 403])('removes existing result after read %s', async (status) => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(detail))
    .mockResolvedValueOnce(reply({}, status));
  render(<SyntheticDiagnosticPanel {...props} />);
  lookup();
  await screen.findByText('Diagnóstico consultado.');
  fireEvent.click(
    screen.getByRole('button', { name: 'Consultar diagnóstico' }),
  );
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('region', { name: 'Resultado do diagnóstico' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Identificador do diagnóstico'),
  ).not.toBeInTheDocument();
});
it('does not retain prior evidence after a missing lookup', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(detail))
    .mockResolvedValueOnce(reply({}, 404));
  render(<SyntheticDiagnosticPanel {...props} />);
  lookup();
  await screen.findByText('Diagnóstico consultado.');
  lookup(batchId);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Diagnóstico não encontrado nesta organização.',
  );
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
it.each([{ ...detail, id: batchId }, { ...detail, private: true }, {}, null])(
  'rejects invalid read result %j',
  async (body) => {
    jest.mocked(fetch).mockResolvedValue(reply(body));
    render(<SyntheticDiagnosticPanel {...props} />);
    lookup();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Consulta indisponível.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  },
);
it('checks the batch of a detail fetched from its creation receipt', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(receipt, 201))
    .mockResolvedValueOnce(reply({ ...detail, batchId: executionId }));
  render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
  create();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Consultar resultado' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Consulta indisponível.',
  );
});
it.each(['network', 'status', 'json'])(
  'retries only the read operation after %s failure',
  async (kind) => {
    if (kind === 'network')
      jest.mocked(fetch).mockRejectedValueOnce(new Error('private-network'));
    else {
      const response = reply({}, kind === 'status' ? 503 : 200);
      if (kind === 'json')
        jest
          .spyOn(response, 'json')
          .mockRejectedValue(new Error('private-json'));
      jest.mocked(fetch).mockResolvedValueOnce(response);
    }
    jest.mocked(fetch).mockResolvedValueOnce(reply(detail));
    render(<SyntheticDiagnosticPanel {...props} role="viewer" />);
    lookup();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Consulta indisponível.',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Consultar diagnóstico' }),
    );
    await screen.findByText('Diagnóstico consultado.');
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const call of jest.mocked(fetch).mock.calls)
      expect(call[1]).not.toHaveProperty('method');
  },
);
it('requires an explicit new intention after success and restores field focus', async () => {
  render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
  create();
  await screen.findByText('Diagnóstico registrado.');
  fireEvent.submit(
    screen.getByRole('form', { name: 'Executar diagnóstico sintético' }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Preparar outro diagnóstico' }),
  );
  expect(screen.getByLabelText('Lote para diagnóstico')).toHaveValue('');
  expect(screen.getByLabelText('Lote para diagnóstico')).toHaveFocus();
  expect(
    screen.queryByRole('region', { name: 'Recibo do diagnóstico' }),
  ).not.toBeInTheDocument();
});
it.each(['create', 'lookup'] as const)(
  'serializes %s and blocks duplicate submits',
  async (operation) => {
    let finish!: (value: Response) => void;
    jest.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    render(<SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />);
    if (operation === 'create') create();
    else lookup();
    expect(
      screen.getByText(
        operation === 'create'
          ? 'Executando diagnóstico…'
          : 'Consultando diagnóstico…',
      ),
    ).toBeVisible();
    fireEvent.submit(
      screen.getByRole('form', { name: 'Executar diagnóstico sintético' }),
    );
    fireEvent.submit(
      screen.getByRole('form', { name: 'Consultar diagnóstico sintético' }),
    );
    fireEvent.change(screen.getByLabelText('Identificador do diagnóstico'), {
      target: { value: batchId },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish(
        reply(
          operation === 'create' ? receipt : detail,
          operation === 'create' ? 201 : 200,
        ),
      ),
    );
  },
);
it.each(['organization', 'csrf', 'role', 'batch'] as const)(
  'aborts and ignores late creation after %s context replacement',
  async (field) => {
    let finish!: (value: Response) => void;
    jest.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const { rerender } = render(
      <SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />,
    );
    create();
    const signal = jest.mocked(fetch).mock.calls[0]![1]!.signal!;
    const changed =
      field === 'organization'
        ? { organizationId: batchId }
        : field === 'csrf'
          ? { csrfToken: 'b'.repeat(43) }
          : field === 'role'
            ? { role: 'viewer' as const }
            : { initialBatchId: executionId };
    rerender(
      <SyntheticDiagnosticPanel
        {...props}
        initialBatchId={batchId}
        {...changed}
      />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => finish(reply(receipt, 201)));
    expect(
      screen.queryByRole('region', { name: 'Recibo do diagnóstico' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);
it.each(['create', 'lookup'] as const)(
  'ignores a result replaced while parsing %s JSON',
  async (operation) => {
    let finish!: (body: unknown) => void;
    jest.mocked(fetch).mockResolvedValue({
      status: operation === 'create' ? 201 : 200,
      json: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    } as Response);
    const { rerender } = render(
      <SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />,
    );
    if (operation === 'create') create();
    else lookup();
    await waitFor(() => expect(finish).toBeDefined());
    rerender(<SyntheticDiagnosticPanel {...props} organizationId={batchId} />);
    await act(async () => finish(operation === 'create' ? receipt : detail));
    expect(
      screen.queryByRole('region', { name: 'Resultado do diagnóstico' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Recibo do diagnóstico' }),
    ).not.toBeInTheDocument();
  },
);
it.each(['create', 'lookup'] as const)(
  'aborts on unmount and ignores late %s errors',
  async (operation) => {
    let reject!: (error: Error) => void;
    jest.mocked(fetch).mockReturnValue(
      new Promise<Response>((_resolve, fail) => {
        reject = fail;
      }),
    );
    const { unmount } = render(
      <SyntheticDiagnosticPanel {...props} initialBatchId={batchId} />,
    );
    if (operation === 'create') create();
    else lookup();
    const signal = jest.mocked(fetch).mock.calls[0]![1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => reject(new Error('aborted')));
    expect(props.onSessionExpired).not.toHaveBeenCalled();
  },
);
it('offers explicit created and consulted batch shortcuts in the composed workspace', async () => {
  const batchReceipt = {
    id: batchId,
    schemaVersion: 'synthetic-document-batch-v1',
    createdAt: receipt.createdAt,
  };
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(batchReceipt, 201))
    .mockResolvedValueOnce(
      reply({
        ...batchReceipt,
        documents: [
          {
            reference: 'sample',
            declaredTotalCents: 100,
            lineAmountsCents: [100],
          },
        ],
      }),
    );
  render(<SyntheticDocumentWorkspace {...props} />);
  fireEvent.change(screen.getByLabelText('Referência do documento 1'), {
    target: { value: 'sample' },
  });
  fireEvent.change(
    screen.getByLabelText('Total declarado em centavos do documento 1'),
    { target: { value: '100' } },
  );
  fireEvent.change(
    screen.getByLabelText('Valores das linhas em centavos do documento 1'),
    { target: { value: '100' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Criar lote sintético' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Usar lote criado no diagnóstico',
    }),
  );
  expect(screen.getByLabelText('Lote para diagnóstico')).toHaveValue(batchId);
  expect(screen.getByLabelText('Lote para diagnóstico')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Usar lote consultado no diagnóstico',
    }),
  );
  expect(screen.getByLabelText('Lote para diagnóstico')).toHaveValue(batchId);
});
it.each(['batch', 'diagnostic'] as const)(
  'clears both workspace panels on %s denial',
  async (source) => {
    jest.mocked(fetch).mockResolvedValue(reply({}, 403));
    const denied = jest.fn();
    render(<SyntheticDocumentWorkspace {...props} onAccessDenied={denied} />);
    if (source === 'batch') {
      fireEvent.change(screen.getByLabelText('Identificador do lote'), {
        target: { value: batchId },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
    } else {
      fireEvent.change(screen.getByLabelText('Lote para diagnóstico'), {
        target: { value: batchId },
      });
      create();
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Selecione a organização novamente.',
    );
    expect(
      screen.queryByRole('form', { name: 'Criar lote sintético' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Consultar diagnóstico sintético' }),
    ).not.toBeInTheDocument();
    expect(denied).toHaveBeenCalledTimes(1);
  },
);
it('resets the composed workspace after a new verified context', async () => {
  jest.mocked(fetch).mockResolvedValue(reply({}, 403));
  const { rerender } = render(<SyntheticDocumentWorkspace {...props} />);
  fireEvent.change(screen.getByLabelText('Lote para diagnóstico'), {
    target: { value: batchId },
  });
  create();
  await screen.findByRole('alert');
  rerender(<SyntheticDocumentWorkspace {...props} organizationId={batchId} />);
  expect(
    screen.getByRole('form', { name: 'Executar diagnóstico sintético' }),
  ).toBeVisible();
  expect(screen.getByLabelText('Lote para diagnóstico')).toHaveValue('');
});
it('has accessible empty and evidence states', async () => {
  const { container } = render(<SyntheticDiagnosticPanel {...props} />);
  expect((await axe(container)).violations).toEqual([]);
  jest.mocked(fetch).mockResolvedValue(reply(detail));
  lookup();
  await screen.findByText('Diagnóstico consultado.');
  expect((await axe(container)).violations).toEqual([]);
});
it('keeps the batch shortcut from replacing an uncertain diagnostic intention', async () => {
  const batchDetail = {
    id: batchId,
    schemaVersion: 'synthetic-document-batch-v1',
    createdAt: receipt.createdAt,
    documents: [
      { reference: 'sample', declaredTotalCents: 100, lineAmountsCents: [100] },
    ],
  };
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(batchDetail))
    .mockResolvedValueOnce(reply({}, 503));
  render(<SyntheticDocumentWorkspace {...props} />);
  fireEvent.change(screen.getByLabelText('Identificador do lote'), {
    target: { value: batchId },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Usar lote consultado no diagnóstico',
    }),
  );
  create();
  await screen.findByRole('button', { name: 'Repetir o mesmo diagnóstico' });
  expect(
    screen.queryByRole('button', {
      name: 'Usar lote consultado no diagnóstico',
    }),
  ).not.toBeInTheDocument();
});
it('can use the same known batch shortcut again after an explicit new intention', async () => {
  const batchDetail = {
    id: batchId,
    schemaVersion: 'synthetic-document-batch-v1',
    createdAt: receipt.createdAt,
    documents: [
      { reference: 'sample', declaredTotalCents: 100, lineAmountsCents: [100] },
    ],
  };
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(reply(batchDetail))
    .mockResolvedValueOnce(reply(receipt, 201));
  render(<SyntheticDocumentWorkspace {...props} />);
  fireEvent.change(screen.getByLabelText('Identificador do lote'), {
    target: { value: batchId },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Usar lote consultado no diagnóstico',
    }),
  );
  create();
  await screen.findByText('Diagnóstico registrado.');
  fireEvent.click(
    screen.getByRole('button', { name: 'Preparar outro diagnóstico' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Usar lote consultado no diagnóstico' }),
  );
  expect(screen.getByLabelText('Lote para diagnóstico')).toHaveValue(batchId);
});
