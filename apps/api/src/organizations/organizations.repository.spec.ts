import { OrganizationsRepository } from './organizations.repository';
import { createDatabase } from '@tax/database';
jest.mock('@tax/database', () => ({
  createDatabase: jest.fn(),
  IdentityStore: class {
    constructor(private pool: { query: jest.Mock }) {}
    findActor(identity: unknown) {
      return this.pool.query('actor', identity);
    }
  },
  MembershipStore: class {
    constructor(private pool: { query: jest.Mock }) {}
    list(...args: unknown[]) {
      return this.pool.query('list', ...args);
    }
    get(...args: unknown[]) {
      return this.pool.query('get', ...args);
    }
  },
}));
describe('Membership infrastructure lifecycle', () => {
  const savedUrl = process.env.DATABASE_URL;
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    jest.clearAllMocks();
  });
  it('fails closed without configured storage and closes safely', async () => {
    delete process.env.DATABASE_URL;
    const repository = new OrganizationsRepository();
    expect(() =>
      repository.findActor({ issuer: 'synthetic', subject: 'synthetic' }),
    ).toThrow('unavailable');
    expect(createDatabase).not.toHaveBeenCalled();
    await repository.onModuleDestroy();
  });
  it('delegates through public stores and closes its own pool', async () => {
    process.env.DATABASE_URL = 'synthetic-test-url';
    const pool = {
      query: jest.fn().mockResolvedValue('result'),
      end: jest.fn().mockResolvedValue(undefined),
    };
    jest
      .mocked(createDatabase)
      .mockReturnValue({ pool } as unknown as ReturnType<
        typeof createDatabase
      >);
    const repository = new OrganizationsRepository();
    const identity = { issuer: 'synthetic', subject: 'synthetic' };
    expect(await repository.findActor(identity)).toBe('result');
    expect(await repository.list('actor', 26, 'cursor')).toBe('result');
    expect(await repository.get('actor', 'organization')).toBe('result');
    expect(pool.query.mock.calls).toEqual([
      ['actor', identity],
      ['list', 'actor', 26, 'cursor'],
      ['get', 'actor', 'organization'],
    ]);
    await repository.onModuleDestroy();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
