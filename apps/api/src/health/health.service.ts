import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type Database } from '@tax/database';
import type { HealthResponse } from '@tax/contracts';
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly database: Database | undefined;
  constructor() {
    if (process.env.DATABASE_URL)
      this.database = createDatabase(process.env.DATABASE_URL);
  }
  live(): HealthResponse {
    return { status: 'ok', service: 'tax-intelligence-api' };
  }
  async ready(): Promise<HealthResponse> {
    if (!this.database)
      return { ...this.live(), checks: { database: 'not_configured' } };
    try {
      await this.database.pool.query('SELECT 1');
      return { ...this.live(), checks: { database: 'up' } };
    } catch {
      return {
        status: 'error',
        service: 'tax-intelligence-api',
        checks: { database: 'down' },
      };
    }
  }
  async onModuleDestroy() {
    await this.database?.pool.end();
  }
}
