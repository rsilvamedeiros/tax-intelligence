CREATE SCHEMA tax_intelligence;
--> statement-breakpoint
CREATE TABLE tax_intelligence.synthetic_diagnostic_runs (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  rule_id text NOT NULL CHECK (rule_id = 'DEMO-TOTAL-001'),
  rule_version text NOT NULL CHECK (rule_version = '1.0.0'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,batch_id,rule_id,rule_version),
  UNIQUE (tenant_id,id,actor_id),
  FOREIGN KEY (tenant_id,batch_id) REFERENCES fiscal_compliance.synthetic_batches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_id) REFERENCES organization_access.memberships(organization_id,actor_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE audit_compliance.synthetic_diagnostic_creations (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,execution_id),
  FOREIGN KEY (tenant_id,execution_id,actor_id) REFERENCES tax_intelligence.synthetic_diagnostic_runs(tenant_id,id,actor_id) ON DELETE RESTRICT
);
--> statement-breakpoint
ALTER TABLE tax_intelligence.synthetic_diagnostic_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tax_intelligence.synthetic_diagnostic_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON tax_intelligence.synthetic_diagnostic_runs FOR SELECT USING (tenant_id = nullif(current_setting('tax.tenant_id',true),'')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_insert ON tax_intelligence.synthetic_diagnostic_runs FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('tax.tenant_id',true),'')::uuid);
--> statement-breakpoint
ALTER TABLE audit_compliance.synthetic_diagnostic_creations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_compliance.synthetic_diagnostic_creations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_insert ON audit_compliance.synthetic_diagnostic_creations FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('tax.tenant_id',true),'')::uuid);
