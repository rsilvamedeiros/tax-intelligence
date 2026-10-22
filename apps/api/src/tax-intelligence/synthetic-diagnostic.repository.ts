import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  createDatabase,
  SyntheticDiagnosticExecutionStore,
  type Database,
} from '@tax/database';
import type {
  DiagnosticTransaction,
  DiagnosticUnitOfWork,
} from './application/synthetic-diagnostic-execution';

@Injectable()
export class SyntheticDiagnosticRepository
  implements DiagnosticUnitOfWork, OnModuleDestroy
{
  private readonly database: Database | undefined;
  constructor() {
    const value = process.env.SYNTHETIC_DIAGNOSTIC_DATABASE_URL;
    if (!value) return;
    let url: URL;
    let username: string;
    try {
      url = new URL(value);
      username = decodeURIComponent(url.username);
    } catch {
      throw new Error('Invalid synthetic diagnostic database configuration');
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.username ||
      [
        process.env.DATABASE_URL,
        process.env.BFF_DATABASE_URL,
        process.env.SYNTHETIC_BATCH_DATABASE_URL,
      ].some((other) => {
        if (!other) return false;
        try {
          return decodeURIComponent(new URL(other).username) === username;
        } catch {
          return true;
        }
      })
    )
      throw new Error('Dedicated synthetic diagnostic database login required');
    this.database = createDatabase(value);
  }
  async run<T>(
    operation: Parameters<DiagnosticUnitOfWork['run']>[0],
    work: (transaction: DiagnosticTransaction) => Promise<T>,
  ): Promise<{ status: 'authorized'; value: T } | { status: 'denied' }> {
    if (!this.database)
      throw new Error('Synthetic diagnostic storage unavailable');
    return new SyntheticDiagnosticExecutionStore(this.database.pool).run(
      operation,
      work,
    );
  }
  async onModuleDestroy() {
    await this.database?.pool.end();
  }
}
