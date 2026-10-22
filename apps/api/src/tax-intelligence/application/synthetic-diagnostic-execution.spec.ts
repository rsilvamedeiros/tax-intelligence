import type { AuthenticatedIdentity } from '@tax/contracts';
import {
  SyntheticDiagnosticExecutionService,
  type DiagnosticTransaction,
  type DiagnosticUnitOfWork,
} from './synthetic-diagnostic-execution';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const batchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const executionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const requestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const identity: AuthenticatedIdentity = {
  issuer: 'https://identity.example.test',
  subject: 'synthetic-actor',
};
const documents = [
  { reference: 'demo', declaredTotalCents: 301, lineAmountsCents: [100, 200] },
];
const batch = {
  id: batchId,
  schemaVersion: 'synthetic-document-batch-v1',
  createdAt: '2026-10-22T12:00:00.000Z',
  documents,
};
const receipt = {
  id: executionId,
  batchId,
  ruleId: 'DEMO-TOTAL-001',
  ruleVersion: '1.0.0',
  createdAt: '2026-10-22T12:01:00.000Z',
};
const diagnostic = {
  schemaVersion: 'synthetic-document-diagnostic-v1',
  rule: {
    id: 'DEMO-TOTAL-001',
    version: '1.0.0',
    source: 'project-fixture-specification',
    fiscalValidity: 'none',
  },
  documents: [
    {
      ...documents[0]!,
      computedTotalCents: 300,
      differenceCents: 1,
      outcome: 'mismatch',
    },
  ],
};
const command = { organizationId, batchId, requestId };
let transaction: DiagnosticTransaction;
let allowed: boolean;
let run: jest.Mock;
let service: SyntheticDiagnosticExecutionService;
let completionFailure: Error | undefined;
beforeEach(() => {
  allowed = true;
  completionFailure = undefined;
  transaction = {
    scope: { organizationId, actorId },
    readBatch: jest.fn().mockResolvedValue(batch),
    findExecution: jest.fn().mockResolvedValue(undefined),
    readExecution: jest.fn().mockResolvedValue({ ...receipt, diagnostic }),
    insertExecution: jest.fn().mockResolvedValue({ ...receipt, diagnostic }),
    recordCreation: jest.fn().mockResolvedValue(undefined),
  };
  run = jest.fn();
  const unitOfWork: DiagnosticUnitOfWork = {
    async run(operation, work) {
      run(operation);
      if (!allowed) return { status: 'denied' };
      const value = await work(transaction);
      if (completionFailure) throw completionFailure;
      return { status: 'authorized', value };
    },
  };
  service = new SyntheticDiagnosticExecutionService(unitOfWork);
});

it('reads stored evidence only after validating its batch snapshot and requested execution ID', async () => {
  await expect(
    service.get(identity, { organizationId, executionId }),
  ).resolves.toEqual({
    status: 'found',
    execution: { ...receipt, diagnostic },
  });
  expect(run).toHaveBeenCalledWith({
    identity,
    organizationId,
    action: 'read',
  });
  expect(transaction.readBatch).toHaveBeenCalledWith(batchId);
  expect(transaction.insertExecution).not.toHaveBeenCalled();
  expect(transaction.recordCreation).not.toHaveBeenCalled();
});

it.each(['create', 'read'] as const)(
  'returns denied without accessing transaction capabilities for %s',
  async (action) => {
    allowed = false;
    const result =
      action === 'create'
        ? service.create(identity, command)
        : service.get(identity, { organizationId, executionId });
    await expect(result).resolves.toEqual({ status: 'denied' });
    expect(transaction.readBatch).not.toHaveBeenCalled();
    expect(transaction.readExecution).not.toHaveBeenCalled();
    expect(transaction.findExecution).not.toHaveBeenCalled();
    expect(transaction.insertExecution).not.toHaveBeenCalled();
    expect(transaction.recordCreation).not.toHaveBeenCalled();
  },
);

it.each([
  { ...command, organizationId: 'bad' },
  { ...command, batchId: 'bad' },
  { ...command, requestId: 'bad' },
  { ...command, actorId },
  { ...command, documents },
  { ...command, ruleVersion: '2.0.0' },
  { ...command, identity },
  { ...command, tenantId: organizationId },
  { ...command, idempotencyKey: requestId },
  {},
  null,
])(
  'rejects an invalid creation command %# before entering the unit of work',
  async (input) => {
    await expect(service.create(identity, input)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  },
);

it.each([
  { organizationId: 'bad', executionId },
  { organizationId, executionId: 'bad' },
  { organizationId, executionId, batchId },
  {},
  null,
])(
  'rejects an invalid read query %# before entering the unit of work',
  async (query) => {
    await expect(service.get(identity, query)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  },
);

it.each(['create', 'read'] as const)(
  'validates the trusted identity boundary for %s',
  async (action) => {
    const invalid = { issuer: 'invalid', subject: '' };
    await expect(
      action === 'create'
        ? service.create(invalid, command)
        : service.get(invalid, { organizationId, executionId }),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  },
);

it('normalizes identifiers before passing them to transaction capabilities', async () => {
  await service.create(identity, {
    organizationId: organizationId.toUpperCase(),
    batchId: batchId.toUpperCase(),
    requestId: requestId.toUpperCase(),
  });
  expect(run).toHaveBeenCalledWith({
    identity,
    organizationId,
    action: 'create',
  });
  expect(transaction.readBatch).toHaveBeenCalledWith(batchId);
  expect(transaction.recordCreation).toHaveBeenCalledWith({
    executionId,
    requestId,
  });
});

it.each(['create', 'read'] as const)(
  'rejects an authorized scope for a different organization in %s',
  async (action) => {
    transaction = {
      ...transaction,
      scope: { organizationId: batchId, actorId },
    };
    await expect(
      action === 'create'
        ? service.create(identity, command)
        : service.get(identity, { organizationId, executionId }),
    ).rejects.toThrow('Invalid synthetic diagnostic state');
    expect(transaction.readBatch).not.toHaveBeenCalled();
    expect(transaction.readExecution).not.toHaveBeenCalled();
  },
);

it('rejects malformed scope identity before reading any snapshot', async () => {
  transaction = { ...transaction, scope: { organizationId, actorId: 'bad' } };
  await expect(service.create(identity, command)).rejects.toThrow(
    'Invalid synthetic diagnostic state',
  );
  expect(transaction.readBatch).not.toHaveBeenCalled();
});

it('represents an absent creation batch without inserting an execution or event', async () => {
  jest.mocked(transaction.readBatch).mockResolvedValue(undefined);
  await expect(service.create(identity, command)).resolves.toEqual({
    status: 'not_found',
  });
  expect(transaction.findExecution).not.toHaveBeenCalled();
  expect(transaction.insertExecution).not.toHaveBeenCalled();
  expect(transaction.recordCreation).not.toHaveBeenCalled();
});

it.each([
  { ...batch, id: executionId },
  { ...batch, documents: [] },
  { ...batch, private: 'private-fixture' },
  null,
])(
  'fails closed on an invalid or mismatched Fiscal snapshot %#',
  async (snapshot) => {
    jest.mocked(transaction.readBatch).mockResolvedValue(snapshot);
    await expect(service.create(identity, command)).rejects.toThrow(
      'Invalid synthetic diagnostic state',
    );
    expect(transaction.insertExecution).not.toHaveBeenCalled();
    expect(transaction.recordCreation).not.toHaveBeenCalled();
  },
);

it.each(['replay', 'insert', 'read'] as const)(
  'rejects incompatible evidence at the %s boundary',
  async (boundary) => {
    const corrupted = {
      ...receipt,
      diagnostic: {
        ...diagnostic,
        documents: [{ ...diagnostic.documents[0]!, differenceCents: 2 }],
      },
    };
    if (boundary === 'replay')
      jest.mocked(transaction.findExecution).mockResolvedValue(corrupted);
    if (boundary === 'insert')
      jest.mocked(transaction.insertExecution).mockResolvedValue(corrupted);
    if (boundary === 'read')
      jest.mocked(transaction.readExecution).mockResolvedValue(corrupted);
    await expect(
      boundary === 'read'
        ? service.get(identity, { organizationId, executionId })
        : service.create(identity, command),
    ).rejects.toThrow('Invalid synthetic diagnostic state');
    expect(transaction.recordCreation).not.toHaveBeenCalled();
    if (boundary !== 'insert')
      expect(transaction.insertExecution).not.toHaveBeenCalled();
  },
);

it.each([
  { ...receipt, batchId: executionId, diagnostic },
  { ...receipt, ruleVersion: '2.0.0', diagnostic },
  { ...receipt, createdAt: 'not-a-date', diagnostic },
  { ...receipt, diagnostic, actorId },
  null,
])('rejects invalid stored execution metadata %#', async (stored) => {
  jest.mocked(transaction.findExecution).mockResolvedValue(stored);
  await expect(service.create(identity, command)).rejects.toThrow(
    'Invalid synthetic diagnostic state',
  );
  expect(transaction.insertExecution).not.toHaveBeenCalled();
  expect(transaction.recordCreation).not.toHaveBeenCalled();
});

it('compares validated structures without depending on JSON object property order', async () => {
  const stored = JSON.parse(
    JSON.stringify({ ...receipt, diagnostic }, (_key, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value))
        return Object.fromEntries(Object.entries(value).reverse());
      return value;
    }),
  ) as unknown;
  jest.mocked(transaction.findExecution).mockResolvedValue(stored);
  await expect(service.create(identity, command)).resolves.toEqual({
    status: 'replayed',
    receipt,
  });
});

it('treats line order as evidence even when the sum stays the same', async () => {
  jest.mocked(transaction.findExecution).mockResolvedValue({
    ...receipt,
    diagnostic: {
      ...diagnostic,
      documents: [
        { ...diagnostic.documents[0]!, lineAmountsCents: [200, 100] },
      ],
    },
  });
  await expect(service.create(identity, command)).rejects.toThrow(
    'Invalid synthetic diagnostic state',
  );
  expect(transaction.recordCreation).not.toHaveBeenCalled();
});

it('replays for another verified actor without changing the original receipt or creating an event', async () => {
  transaction = {
    ...transaction,
    scope: { organizationId, actorId: executionId },
  };
  jest
    .mocked(transaction.findExecution)
    .mockResolvedValue({ ...receipt, diagnostic });
  await expect(
    service.create(
      { ...identity, subject: 'another-synthetic-actor' },
      { ...command, requestId: executionId },
    ),
  ).resolves.toEqual({ status: 'replayed', receipt });
  expect(transaction.recordCreation).not.toHaveBeenCalled();
});

it('represents an absent read without accessing the Fiscal snapshot', async () => {
  jest.mocked(transaction.readExecution).mockResolvedValue(undefined);
  await expect(
    service.get(identity, { organizationId, executionId }),
  ).resolves.toEqual({ status: 'not_found' });
  expect(transaction.readBatch).not.toHaveBeenCalled();
});

it.each([
  { ...receipt, id: batchId, diagnostic },
  { ...receipt, diagnostic: {} },
  null,
])('rejects an invalid or mismatched read execution %#', async (stored) => {
  jest.mocked(transaction.readExecution).mockResolvedValue(stored);
  await expect(
    service.get(identity, { organizationId, executionId }),
  ).rejects.toThrow('Invalid synthetic diagnostic state');
  expect(transaction.readBatch).not.toHaveBeenCalled();
});

it('rejects an execution whose batch snapshot is no longer available', async () => {
  jest.mocked(transaction.readBatch).mockResolvedValue(undefined);
  await expect(
    service.get(identity, { organizationId, executionId }),
  ).rejects.toThrow('Invalid synthetic diagnostic state');
});

it.each([
  'readBatch',
  'findExecution',
  'insertExecution',
  'recordCreation',
] as const)(
  'propagates the %s failure to the unit of work instead of reporting success',
  async (method) => {
    const failure = new Error('synthetic-port-failure');
    jest.mocked(transaction[method]).mockRejectedValue(failure);
    await expect(service.create(identity, command)).rejects.toBe(failure);
    if (method !== 'recordCreation')
      expect(transaction.recordCreation).not.toHaveBeenCalled();
  },
);

it('propagates completion failure after the callback instead of reporting created', async () => {
  completionFailure = new Error('synthetic-commit-failure');
  await expect(service.create(identity, command)).rejects.toBe(
    completionFailure,
  );
  expect(transaction.recordCreation).toHaveBeenCalledTimes(1);
});

it('propagates read transport failure without touching write capabilities', async () => {
  const failure = new Error('synthetic-read-failure');
  jest.mocked(transaction.readExecution).mockRejectedValue(failure);
  await expect(
    service.get(identity, { organizationId, executionId }),
  ).rejects.toBe(failure);
  expect(transaction.insertExecution).not.toHaveBeenCalled();
});

it('fails closed on an unsupported unit-of-work result', async () => {
  const invalid: DiagnosticUnitOfWork = {
    run: jest.fn().mockResolvedValue({ status: 'unsupported' }),
  };
  await expect(
    new SyntheticDiagnosticExecutionService(invalid).create(identity, command),
  ).rejects.toThrow('Invalid synthetic diagnostic state');
});

it('detects an insertion adapter that mutates the evidence object it receives', async () => {
  jest.mocked(transaction.insertExecution).mockImplementation(async (input) => {
    input.diagnostic.documents[0]!.differenceCents = 42;
    return { ...receipt, diagnostic: input.diagnostic };
  });
  await expect(service.create(identity, command)).rejects.toThrow(
    'Invalid synthetic diagnostic state',
  );
  expect(transaction.recordCreation).not.toHaveBeenCalled();
});

it('creates exact evidence and an Audit event through the authorized transaction', async () => {
  await expect(service.create(identity, command)).resolves.toEqual({
    status: 'created',
    receipt,
  });
  expect(run).toHaveBeenCalledWith({
    identity,
    organizationId,
    action: 'create',
  });
  expect(transaction.insertExecution).toHaveBeenCalledWith({
    batchId,
    diagnostic,
  });
  expect(transaction.recordCreation).toHaveBeenCalledWith({
    executionId,
    requestId,
  });
});

it('replays the natural execution without inserting another execution or event', async () => {
  jest
    .mocked(transaction.findExecution)
    .mockResolvedValue({ ...receipt, diagnostic });
  await expect(service.create(identity, command)).resolves.toEqual({
    status: 'replayed',
    receipt,
  });
  expect(transaction.insertExecution).not.toHaveBeenCalled();
  expect(transaction.recordCreation).not.toHaveBeenCalled();
});
