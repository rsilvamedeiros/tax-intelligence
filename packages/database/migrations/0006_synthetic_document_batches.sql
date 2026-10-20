CREATE SCHEMA fiscal_compliance;
--> statement-breakpoint
CREATE SCHEMA audit_compliance;
--> statement-breakpoint
CREATE TABLE fiscal_compliance.synthetic_batches (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  idempotency_key uuid NOT NULL CHECK (idempotency_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  document_count smallint NOT NULL CHECK (document_count BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,actor_id,idempotency_key),
  UNIQUE (tenant_id,id,actor_id),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES organization_access.memberships(organization_id,actor_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE fiscal_compliance.synthetic_documents (
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
  reference text NOT NULL CHECK (reference ~ '^[a-z0-9-]{1,40}$'),
  declared_total_cents integer NOT NULL CHECK (declared_total_cents BETWEEN 0 AND 1000000000),
  line_count smallint NOT NULL CHECK (line_count BETWEEN 1 AND 10),
  PRIMARY KEY (tenant_id,batch_id,ordinal),
  UNIQUE (tenant_id,batch_id,reference),
  FOREIGN KEY (tenant_id,batch_id) REFERENCES fiscal_compliance.synthetic_batches(tenant_id,id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE fiscal_compliance.synthetic_lines (
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  document_ordinal smallint NOT NULL CHECK (document_ordinal BETWEEN 1 AND 10),
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 1000000000),
  PRIMARY KEY (tenant_id,batch_id,document_ordinal,ordinal),
  FOREIGN KEY (tenant_id,batch_id,document_ordinal) REFERENCES fiscal_compliance.synthetic_documents(tenant_id,batch_id,ordinal) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE audit_compliance.synthetic_batch_creations (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,batch_id),
  FOREIGN KEY (tenant_id,batch_id,actor_id) REFERENCES fiscal_compliance.synthetic_batches(tenant_id,id,actor_id) ON DELETE RESTRICT
);
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['synthetic_batches','synthetic_documents','synthetic_lines'] LOOP
    EXECUTE format('ALTER TABLE fiscal_compliance.%I ENABLE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('ALTER TABLE fiscal_compliance.%I FORCE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('CREATE POLICY tenant_read ON fiscal_compliance.%I FOR SELECT USING (tenant_id = nullif(current_setting(''tax.tenant_id'',true),'''')::uuid)',relation_name);
    EXECUTE format('CREATE POLICY tenant_insert ON fiscal_compliance.%I FOR INSERT WITH CHECK (tenant_id = nullif(current_setting(''tax.tenant_id'',true),'''')::uuid)',relation_name);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE audit_compliance.synthetic_batch_creations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_compliance.synthetic_batch_creations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_insert ON audit_compliance.synthetic_batch_creations FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('tax.tenant_id',true),'')::uuid);
