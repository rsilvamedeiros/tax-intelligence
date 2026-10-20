import {
  createDatabase,
  SyntheticDocumentBatchStore,
  type Database,
} from '@tax/database';
import { SyntheticBatchRepository } from './synthetic-batch.repository';

jest.mock('@tax/database', () => ({
  ...jest.requireActual<object>('@tax/database'),
  createDatabase: jest.fn(),
}));

describe('Dedicated synthetic batch composition', () => {
  const previous = { ...process.env };
  const query = jest.fn();
  const end = jest.fn();
  const command = {
    identity: {
      issuer: 'https://identity.example.invalid',
      subject: 'synthetic',
    },
    organizationId: '00000000-0000-4000-8000-000000000001',
    batchId: '00000000-0000-4000-8000-000000000002',
  };
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete process.env.SYNTHETIC_BATCH_DATABASE_URL;
    delete process.env.BFF_DATABASE_URL;
    delete process.env.DATABASE_URL;
    query.mockResolvedValue({ rows: [{ allowed: true }] });
    end.mockResolvedValue(undefined);
    jest
      .mocked(createDatabase)
      .mockReturnValue({ pool: { query, end } } as unknown as Database);
  });
  afterAll(() => {
    process.env = previous;
  });
  it('never falls back to the administrative pool when unconfigured', async () => {
    process.env.DATABASE_URL = 'postgresql://control@localhost/test';
    const repository = new SyntheticBatchRepository();
    await expect(repository.get(command)).rejects.toThrow('unavailable');
    expect(createDatabase).not.toHaveBeenCalled();
    await repository.onModuleDestroy();
    expect(end).not.toHaveBeenCalled();
  });
  it.each([
    'bad-private-sentinel',
    'https://runtime@localhost/test',
    'postgresql://localhost/test',
  ])('rejects malformed configuration %# safely', (url) => {
    process.env.SYNTHETIC_BATCH_DATABASE_URL = url;
    expect(() => new SyntheticBatchRepository()).toThrow();
    expect(createDatabase).not.toHaveBeenCalled();
  });
  it.each(['DATABASE_URL', 'BFF_DATABASE_URL'])(
    'rejects reuse of %s login',
    (key) => {
      process.env[key] = 'postgresql://shared@localhost/control';
      process.env.SYNTHETIC_BATCH_DATABASE_URL =
        'postgresql://shared@localhost/domain';
      expect(() => new SyntheticBatchRepository()).toThrow('Dedicated');
    },
  );
  it('rejects malformed sibling configuration', () => {
    process.env.BFF_DATABASE_URL = 'invalid';
    process.env.SYNTHETIC_BATCH_DATABASE_URL =
      'postgresql://runtime@localhost/test';
    expect(() => new SyntheticBatchRepository()).toThrow('Dedicated');
  });
  it('rejects an encoded alias of the administrative login', () => {
    process.env.DATABASE_URL = 'postgresql://runtime@localhost/control';
    process.env.SYNTHETIC_BATCH_DATABASE_URL =
      'postgresql://%72untime@localhost/domain';
    expect(() => new SyntheticBatchRepository()).toThrow('Dedicated');
    expect(createDatabase).not.toHaveBeenCalled();
  });
  it('checks privileges before delegation and closes its own pool', async () => {
    process.env.SYNTHETIC_BATCH_DATABASE_URL =
      'postgresql://runtime@localhost/test';
    const get = jest
      .spyOn(SyntheticDocumentBatchStore.prototype, 'get')
      .mockResolvedValue({ status: 'denied' });
    const create = jest
      .spyOn(SyntheticDocumentBatchStore.prototype, 'create')
      .mockResolvedValue({ status: 'denied' });
    const repository = new SyntheticBatchRepository();
    expect(await repository.get(command)).toEqual({ status: 'denied' });
    const write = {
      ...command,
      idempotencyKey: command.batchId,
      requestId: command.batchId,
      input: {
        schemaVersion: 'synthetic-document-batch-v1' as const,
        documents: [
          { reference: 'a', declaredTotalCents: 1, lineAmountsCents: [1] },
        ],
      },
    };
    expect(await repository.create(write)).toEqual({ status: 'denied' });
    expect(get).toHaveBeenCalledWith(command);
    expect(create).toHaveBeenCalledWith(write);
    expect(query).toHaveBeenCalledTimes(2);
    await repository.onModuleDestroy();
    expect(end).toHaveBeenCalledTimes(1);
  });
  it.each([false, undefined])(
    'rejects unsafe or missing privilege result %s',
    async (allowed) => {
      process.env.SYNTHETIC_BATCH_DATABASE_URL =
        'postgresql://runtime@localhost/test';
      query.mockResolvedValue({
        rows: allowed === undefined ? [] : [{ allowed }],
      });
      const get = jest.spyOn(SyntheticDocumentBatchStore.prototype, 'get');
      await expect(new SyntheticBatchRepository().get(command)).rejects.toThrow(
        'Unsafe',
      );
      expect(get).not.toHaveBeenCalled();
    },
  );
});
