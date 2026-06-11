-- workdir control panel — D1 schema.
-- Apply with: npm run db:migrate  (remote)  or  db:migrate:local

CREATE TABLE IF NOT EXISTS orgs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,        -- pbkdf2$<iters>$<salt_b64>$<hash_b64>
  org_id        TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,        -- random opaque token (the cookie value)
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,      -- key id (kid)
  org_id       TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  name         TEXT,
  prefix       TEXT NOT NULL,         -- e.g. "sk_live_ab12cd34" for display
  key_hash     TEXT NOT NULL,         -- SHA-256 hex of the full key (same as daemon)
  created_at   TEXT NOT NULL,
  revoked      INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_keys_org ON api_keys(org_id);
