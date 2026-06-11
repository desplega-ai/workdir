// Typed D1 access helpers.

export interface Org {
  id: string;
  name: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  org_id: string;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  org_id: string;
  user_id: string;
  name: string | null;
  prefix: string;
  key_hash: string;
  created_at: string;
  revoked: number;
  last_used_at: string | null;
}

const now = () => new Date().toISOString();

export async function createOrg(db: D1Database, id: string, name: string): Promise<void> {
  await db.prepare("INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)").bind(id, name, now()).run();
}

export async function createUser(
  db: D1Database,
  user: { id: string; email: string; password_hash: string; org_id: string },
): Promise<void> {
  await db
    .prepare("INSERT INTO users (id, email, password_hash, org_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(user.id, user.email, user.password_hash, user.org_id, now())
    .run();
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return db.prepare("SELECT * FROM users WHERE email = ?").bind(email.toLowerCase()).first<User>();
}

export async function createSession(
  db: D1Database,
  id: string,
  userId: string,
  ttlDays: number,
): Promise<void> {
  const created = new Date();
  const expires = new Date(created.getTime() + ttlDays * 86400_000);
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, userId, created.toISOString(), expires.toISOString())
    .run();
}

export async function getUserBySession(db: D1Database, sessionId: string): Promise<User | null> {
  return db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(sessionId, now())
    .first<User>();
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

export async function listKeys(db: D1Database, orgId: string): Promise<ApiKeyRow[]> {
  const res = await db
    .prepare("SELECT * FROM api_keys WHERE org_id = ? ORDER BY created_at DESC")
    .bind(orgId)
    .all<ApiKeyRow>();
  return res.results ?? [];
}

export async function insertKey(db: D1Database, k: ApiKeyRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO api_keys (id, org_id, user_id, name, prefix, key_hash, created_at, revoked)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(k.id, k.org_id, k.user_id, k.name, k.prefix, k.key_hash, k.created_at)
    .run();
}

export async function getKey(db: D1Database, id: string, orgId: string): Promise<ApiKeyRow | null> {
  return db
    .prepare("SELECT * FROM api_keys WHERE id = ? AND org_id = ?")
    .bind(id, orgId)
    .first<ApiKeyRow>();
}

export async function revokeKeyRow(db: D1Database, id: string, orgId: string): Promise<void> {
  await db.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ? AND org_id = ?").bind(id, orgId).run();
}
