// Client for the headless workdir daemon's admin API (on Hetzner, fronted by a
// Cloudflare Tunnel). The control panel provisions/revokes keys here so the
// daemon — which validates keys locally for speed — accepts them.

export interface Env {
  DB: D1Database;
  WORKDIR_API_URL: string;
  WORKDIR_ADMIN_KEY: string;
  /** GitHub OAuth app credentials (optional — the button 404s gracefully without them). */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

async function adminFetch(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const base = env.WORKDIR_API_URL.replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.WORKDIR_ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ensureOk(res: Response, what: string): void {
  if (!res.ok) {
    throw new Error(`daemon ${what} failed (HTTP ${res.status})`);
  }
}

/** Create/update an org on the daemon (idempotent). */
export async function daemonProvisionOrg(env: Env, orgId: string, name: string): Promise<void> {
  const res = await adminFetch(env, "POST", "/v1/admin/orgs", { id: orgId, name });
  ensureOk(res, "create org");
}

/** Register a customer key by its SHA-256 hash so the daemon accepts it. */
export async function daemonRegisterKey(
  env: Env,
  orgId: string,
  keyHash: string,
  name: string,
): Promise<void> {
  const res = await adminFetch(env, "POST", "/v1/admin/keys", { org_id: orgId, key_hash: keyHash, name });
  ensureOk(res, "register key");
}

/** Revoke (disable) a key on the daemon. */
export async function daemonRevokeKey(env: Env, keyHash: string): Promise<void> {
  const res = await adminFetch(env, "DELETE", `/v1/admin/keys/${keyHash}`);
  // 404 is fine — the key may never have synced; treat as already gone.
  if (!res.ok && res.status !== 404) {
    throw new Error(`daemon revoke key failed (HTTP ${res.status})`);
  }
}

/** Fetch usage for an org from the daemon (best-effort; null on failure). */
export async function daemonOrgUsage(env: Env, orgId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await adminFetch(env, "GET", `/v1/admin/orgs/${orgId}/usage`);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
