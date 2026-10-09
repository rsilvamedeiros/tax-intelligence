CREATE TABLE organization_access.membership_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  initiating_actor_id uuid NOT NULL,
  target_actor_id uuid NOT NULL,
  previous_role text NOT NULL CHECK (previous_role IN ('organization_admin', 'analyst', 'reviewer', 'viewer')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid NOT NULL,
  FOREIGN KEY (organization_id, initiating_actor_id) REFERENCES organization_access.memberships(organization_id, actor_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, target_actor_id) REFERENCES organization_access.memberships(organization_id, actor_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX membership_revocations_by_organization ON organization_access.membership_revocations (organization_id, occurred_at, id);
