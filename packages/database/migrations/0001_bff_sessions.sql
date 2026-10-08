CREATE SCHEMA IF NOT EXISTS auth_bff;
--> statement-breakpoint
CREATE TABLE auth_bff.entries (
  id_hash text PRIMARY KEY CHECK (length(id_hash) = 64),
  kind text NOT NULL CHECK (kind IN ('attempt', 'session')),
  ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX bff_entries_expiration_idx ON auth_bff.entries (expires_at);
