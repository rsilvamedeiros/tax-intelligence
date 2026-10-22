import { SyntheticDiagnosticRepository } from './synthetic-diagnostic.repository';
import {
  createDatabase,
  SyntheticDiagnosticExecutionStore,
  type Database,
} from '@tax/database';
jest.mock('@tax/database', () => ({
  ...jest.requireActual<object>('@tax/database'),
  createDatabase: jest.fn(),
}));

describe('Dedicated diagnostic composition', () => {
  const previous = { ...process.env };
  const end = jest.fn();
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    for (const key of [
      'DATABASE_URL',
      'BFF_DATABASE_URL',
      'SYNTHETIC_BATCH_DATABASE_URL',
      'SYNTHETIC_DIAGNOSTIC_DATABASE_URL',
    ])
      delete process.env[key];
    jest.mocked(createDatabase).mockReturnValue({
      pool: {
        options: { connectionTimeoutMillis: 2000, statement_timeout: 2000 },
        end,
      },
    } as unknown as Database);
  });
  afterEach(() => {
    process.env = { ...previous };
  });
  it('rejects a shared administrative login before creating a pool', () => {
    process.env.DATABASE_URL = 'postgresql://shared@localhost/admin';
    process.env.SYNTHETIC_DIAGNOSTIC_DATABASE_URL =
      'postgresql://shared@localhost/domain';
    expect(() => new SyntheticDiagnosticRepository()).toThrow('Dedicated');
  });
  const operation = {
    identity: { issuer: 'https://example.invalid', subject: 'synthetic' },
    organizationId: '00000000-0000-4000-8000-000000000001',
    action: 'read' as const,
  };
  it('never falls back to another configured URL', async () => {
    process.env.DATABASE_URL = 'postgresql://owner@localhost/test';
    const repository = new SyntheticDiagnosticRepository();
    await expect(
      repository.run(operation, async () => 'unexpected'),
    ).rejects.toThrow('unavailable');
    expect(createDatabase).not.toHaveBeenCalled();
    await repository.onModuleDestroy();
    expect(end).not.toHaveBeenCalled();
  });
  it.each(['BFF_DATABASE_URL', 'SYNTHETIC_BATCH_DATABASE_URL'])(
    'rejects shared %s login including encoded usernames',
    (key) => {
      process.env[key] = 'postgresql://shared@localhost/source';
      process.env.SYNTHETIC_DIAGNOSTIC_DATABASE_URL =
        'postgresql://%73hared@localhost/domain';
      expect(() => new SyntheticDiagnosticRepository()).toThrow('Dedicated');
      expect(createDatabase).not.toHaveBeenCalled();
    },
  );
  it.each([
    'invalid',
    'https://runtime@localhost/db',
    'postgresql://localhost/db',
    'postgresql://%ZZ@localhost/db',
  ])('rejects invalid configuration %s without exposing it', (value) => {
    process.env.SYNTHETIC_DIAGNOSTIC_DATABASE_URL = value;
    expect(() => new SyntheticDiagnosticRepository()).toThrow(
      /configuration|Dedicated/,
    );
    expect(createDatabase).not.toHaveBeenCalled();
  });
  it('uses its dedicated pool and closes it on shutdown', async () => {
    const value = 'postgresql://diagnostic@localhost/test';
    process.env.SYNTHETIC_DIAGNOSTIC_DATABASE_URL = value;
    const run = jest
      .spyOn(SyntheticDiagnosticExecutionStore.prototype, 'run')
      .mockResolvedValue({ status: 'denied' });
    const work = async () => 'value';
    const repository = new SyntheticDiagnosticRepository();
    await expect(repository.run(operation, work)).resolves.toEqual({
      status: 'denied',
    });
    expect(createDatabase).toHaveBeenCalledWith(value);
    expect(run).toHaveBeenCalledWith(operation, work);
    await repository.onModuleDestroy();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
