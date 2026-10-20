import type { PoolClient } from 'pg';

export class SyntheticBatchAuditStore {
  constructor(private readonly client: PoolClient) {}
  async record(command: {
    organizationId: string;
    actorId: string;
    batchId: string;
    requestId: string;
  }): Promise<void> {
    await this.client.query(
      'INSERT INTO audit_compliance.synthetic_batch_creations(tenant_id,actor_id,batch_id,request_id) VALUES($1,$2,$3,$4)',
      [
        command.organizationId,
        command.actorId,
        command.batchId,
        command.requestId,
      ],
    );
  }
}
