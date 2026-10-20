import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  createDatabase,
  SyntheticDocumentBatchStore,
  type Database,
  type SyntheticBatchCreateCommand,
  type SyntheticBatchOperation,
} from '@tax/database';
import type { SyntheticBatchPort } from './synthetic-batch.service';

@Injectable()
export class SyntheticBatchRepository
  implements SyntheticBatchPort, OnModuleDestroy
{
  private readonly database: Database | undefined;
  constructor() {
    const value = process.env.SYNTHETIC_BATCH_DATABASE_URL;
    if (!value) return;
    let url: URL;
    let username: string;
    try {
      url = new URL(value);
      username = decodeURIComponent(url.username);
    } catch {
      throw new Error('Invalid synthetic batch database configuration');
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.username ||
      [process.env.DATABASE_URL, process.env.BFF_DATABASE_URL].some((other) => {
        if (!other) return false;
        try {
          return decodeURIComponent(new URL(other).username) === username;
        } catch {
          return true;
        }
      })
    )
      throw new Error('Dedicated synthetic batch database login required');
    this.database = createDatabase(value);
  }
  private async store() {
    if (!this.database) throw new Error('Synthetic batch storage unavailable');
    const store = new SyntheticDocumentBatchStore(this.database.pool);
    await store.assertRuntimePrivileges();
    return store;
  }
  async create(command: SyntheticBatchCreateCommand) {
    return (await this.store()).create(command);
  }
  async get(command: SyntheticBatchOperation & { batchId: string }) {
    return (await this.store()).get(command);
  }
  async onModuleDestroy() {
    await this.database?.pool.end();
  }
}
