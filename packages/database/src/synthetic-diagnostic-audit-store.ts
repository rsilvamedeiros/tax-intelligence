import type { PoolClient } from 'pg';
import type { AuthorizedOrganizationOperation } from './organization-operation-store';

export class SyntheticDiagnosticAuditStore {
  constructor(private readonly client: PoolClient) {}
  async record(
    scope: AuthorizedOrganizationOperation,
    executionId: string,
    requestId: string,
  ): Promise<void> {
    await this.client.query(
      'INSERT INTO audit_compliance.synthetic_diagnostic_creations(tenant_id,actor_id,execution_id,request_id) VALUES($1,$2,$3,$4)',
      [scope.organizationId, scope.actorId, executionId, requestId],
    );
  }
}
