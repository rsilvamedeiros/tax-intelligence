CREATE SCHEMA identity_access;
--> statement-breakpoint
CREATE SCHEMA organization_access;
--> statement-breakpoint
CREATE TABLE identity_access.actors (
  id uuid PRIMARY KEY,
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 2048),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  UNIQUE (issuer, subject)
);
--> statement-breakpoint
CREATE TABLE organization_access.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160 AND length(btrim(name)) > 0)
);
--> statement-breakpoint
CREATE TABLE organization_access.memberships (
  organization_id uuid NOT NULL REFERENCES organization_access.organizations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES identity_access.actors(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('organization_admin', 'analyst', 'reviewer', 'viewer')),
  revoked_at timestamptz,
  PRIMARY KEY (organization_id, actor_id)
);
--> statement-breakpoint
CREATE INDEX active_memberships_by_actor ON organization_access.memberships (actor_id, organization_id) WHERE revoked_at IS NULL;
