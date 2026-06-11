import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import * as crypto from "./auth";
import * as db from "./db";
import type { User } from "./db";
import * as daemon from "./daemon";
import type { Env } from "./daemon";
import {
  authPage,
  dashboardPage,
  keyDetailPage,
  landingPage,
  privacyPage,
  settingsPage,
  statusPage,
  termsPage,
} from "./views";
import type { StatusCheck } from "./views";

// __Host- prefix: the browser only accepts these over HTTPS, with Path=/ and
// no Domain — so the cookie can't be planted by a subdomain or downgraded.
const SESSION_COOKIE = "__Host-wd_session";
const OAUTH_STATE_COOKIE = "__Host-wd_oauth_state";
const SESSION_TTL_DAYS = 30;

const THROTTLE_WINDOW_MS = 15 * 60_000;
const MAX_LOGIN_FAILS = 8;
const MAX_SIGNUPS_PER_WINDOW = 10;

type Vars = { user: User };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// --- hardening ---------------------------------------------------------------

// Security headers on every response.
app.use("*", async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// Reject cross-origin POSTs outright (belt to the SameSite=Lax braces).
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.text("cross-origin request rejected", 403);
    }
  }
  await next();
});

// --- helpers -----------------------------------------------------------------

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? "local";
}

/** Minutes until the throttle clears, or 0 if the action is allowed. */
async function throttled(env: Env, key: string, max: number): Promise<number> {
  const row = await env.DB.prepare("SELECT fails, first_fail_at FROM auth_throttle WHERE id = ?")
    .bind(key)
    .first<{ fails: number; first_fail_at: string }>();
  if (!row) return 0;
  const age = Date.now() - Date.parse(row.first_fail_at);
  if (age > THROTTLE_WINDOW_MS) {
    await env.DB.prepare("DELETE FROM auth_throttle WHERE id = ?").bind(key).run();
    return 0;
  }
  if (row.fails >= max) return Math.max(1, Math.ceil((THROTTLE_WINDOW_MS - age) / 60_000));
  return 0;
}

async function recordAttempt(env: Env, key: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO auth_throttle (id, fails, first_fail_at) VALUES (?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET fails = fails + 1`,
  )
    .bind(key, new Date().toISOString())
    .run();
}

async function clearAttempts(env: Env, key: string): Promise<void> {
  await env.DB.prepare("DELETE FROM auth_throttle WHERE id = ?").bind(key).run();
}

// Session tokens are stored hashed: a leaked DB row is not a usable cookie.
async function startSession(c: any, userId: string): Promise<void> {
  const token = crypto.sessionToken();
  await db.createSession(c.env.DB, await crypto.sha256hex(token), userId, SESSION_TTL_DAYS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

async function currentUser(c: any): Promise<User | null> {
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return null;
  return db.getUserBySession(c.env.DB, await crypto.sha256hex(sid));
}

// --- public pages ------------------------------------------------------------

app.get("/", async (c) => {
  const user = await currentUser(c);
  return c.html(landingPage(user ?? undefined));
});

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get("/terms", (c) => c.html(termsPage()));
app.get("/privacy", (c) => c.html(privacyPage()));

app.get("/status", async (c) => {
  const checks: StatusCheck[] = [
    { name: "control panel", ok: true, ms: null, note: "this site — it served you this page" },
  ];

  try {
    const t = Date.now();
    await c.env.DB.prepare("SELECT 1").first();
    checks.push({ name: "accounts db", ok: true, ms: Date.now() - t, note: "orgs, users, api keys" });
  } catch {
    checks.push({ name: "accounts db", ok: false, ms: null, note: "orgs, users, api keys" });
  }

  try {
    const t = Date.now();
    const base = c.env.WORKDIR_API_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(4000) });
    checks.push({
      name: "sandbox api",
      ok: res.ok,
      ms: Date.now() - t,
      note: "create · exec · previews",
    });
  } catch {
    checks.push({ name: "sandbox api", ok: false, ms: null, note: "create · exec · previews" });
  }

  return c.html(statusPage({ checks, at: new Date().toISOString().slice(11, 19) }));
});

const LOGIN_ERRORS: Record<string, string> = {
  "gh-unconfigured": "GitHub login isn't configured on this deployment.",
  "gh-state": "GitHub sign-in expired — try again.",
  "gh-noemail": "Your GitHub account has no verified email address.",
  "gh-failed": "GitHub sign-in failed — try again.",
};

app.get("/login", async (c) => {
  if (await currentUser(c)) return c.redirect("/dashboard");
  const e = c.req.query("e");
  return c.html(authPage("login", e ? LOGIN_ERRORS[e] : undefined));
});

app.get("/signup", async (c) => {
  if (await currentUser(c)) return c.redirect("/dashboard");
  return c.html(authPage("signup"));
});

// --- auth: email + password --------------------------------------------------

app.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const tkey = `signup:${clientIp(c)}`;
  const wait = await throttled(c.env, tkey, MAX_SIGNUPS_PER_WINDOW);
  if (wait) {
    return c.html(authPage("signup", `Too many signups from this address — try again in ${wait} min.`), 429);
  }

  if (!crypto.validEmail(email)) return c.html(authPage("signup", "Enter a valid email address."));
  if (password.length < 8) return c.html(authPage("signup", "Password must be at least 8 characters."));
  if (await db.getUserByEmail(c.env.DB, email)) {
    return c.html(authPage("signup", "An account with that email already exists."));
  }

  const orgId = crypto.orgId();
  const uid = crypto.userId();
  await db.createOrg(c.env.DB, orgId, email);
  await db.createUser(c.env.DB, {
    id: uid,
    email,
    password_hash: await crypto.hashPassword(password),
    org_id: orgId,
  });
  await recordAttempt(c.env, tkey);

  // Mirror the org into the daemon (best-effort; keys created later re-ensure it).
  try {
    await daemon.daemonProvisionOrg(c.env, orgId, email);
  } catch {
    /* daemon may be unreachable in dev; org is provisioned again at key creation */
  }

  await startSession(c, uid);
  return c.redirect("/dashboard");
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const tkey = `${clientIp(c)}:${email}`;
  const wait = await throttled(c.env, tkey, MAX_LOGIN_FAILS);
  if (wait) {
    return c.html(authPage("login", `Too many attempts — try again in ${wait} min.`), 429);
  }

  const user = await db.getUserByEmail(c.env.DB, email);
  // Burn the same hashing cost whether or not the account exists (or is
  // OAuth-only), so response timing doesn't leak which emails are registered.
  let ok = false;
  if (user && user.password_hash.startsWith("pbkdf2$")) {
    ok = await crypto.verifyPassword(password, user.password_hash);
  } else {
    await crypto.dummyVerify();
  }

  if (!user || !ok) {
    await recordAttempt(c.env, tkey);
    return c.html(authPage("login", "Incorrect email or password."), 401);
  }

  await clearAttempts(c.env, tkey);
  await startSession(c, user.id);
  return c.redirect("/dashboard");
});

app.post("/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await db.deleteSession(c.env.DB, await crypto.sha256hex(sid));
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  return c.redirect("/");
});

// --- auth: github oauth (hand-rolled web flow) --------------------------------

app.get("/auth/github", async (c) => {
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
    return c.redirect("/login?e=gh-unconfigured");
  }
  const state = crypto.randomHex(16);
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
  u.searchParams.set("redirect_uri", `${new URL(c.req.url).origin}/auth/github/callback`);
  u.searchParams.set("scope", "read:user user:email");
  u.searchParams.set("state", state);
  return c.redirect(u.toString());
});

app.get("/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const saved = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/", secure: true });
  if (!code || !state || !saved || state !== saved) return c.redirect("/login?e=gh-state");

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "workdir-cloud",
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return c.redirect("/login?e=gh-failed");

    const gh = {
      Authorization: `Bearer ${tok.access_token}`,
      "User-Agent": "workdir-cloud",
      Accept: "application/vnd.github+json",
    };
    const emailsRes = await fetch("https://api.github.com/user/emails", { headers: gh });
    if (!emailsRes.ok) return c.redirect("/login?e=gh-failed");
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    const best = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (!best) return c.redirect("/login?e=gh-noemail");
    const email = best.email.toLowerCase();

    let user = await db.getUserByEmail(c.env.DB, email);
    if (!user) {
      const orgId = crypto.orgId();
      const uid = crypto.userId();
      await db.createOrg(c.env.DB, orgId, email);
      // Marker, not a hash: this account has no password and can't log in with one.
      await db.createUser(c.env.DB, { id: uid, email, password_hash: "oauth$github", org_id: orgId });
      try {
        await daemon.daemonProvisionOrg(c.env, orgId, email);
      } catch {
        /* re-ensured at key creation */
      }
      user = await db.getUserByEmail(c.env.DB, email);
    }
    if (!user) return c.redirect("/login?e=gh-failed");

    await startSession(c, user.id);
    return c.redirect("/dashboard");
  } catch {
    return c.redirect("/login?e=gh-failed");
  }
});

// --- authenticated console -----------------------------------------------------

app.use("/dashboard/*", async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.redirect("/login");
  c.set("user", user);
  await next();
});
app.use("/dashboard", async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.redirect("/login");
  c.set("user", user);
  await next();
});

app.get("/dashboard", async (c) => {
  const user = c.get("user");
  const keys = await db.listKeys(c.env.DB, user.org_id);
  return c.html(dashboardPage({ user, keys }));
});

app.get("/dashboard/settings", async (c) => {
  const user = c.get("user");
  const usage = await daemon.daemonOrgUsage(c.env, user.org_id);
  return c.html(
    settingsPage({
      user,
      orgId: user.org_id,
      balance: usage?.balance_usd as number | undefined,
      method: user.password_hash.startsWith("pbkdf2$") ? "email + password" : "github oauth",
    }),
  );
});

app.get("/dashboard/keys/:id", async (c) => {
  const user = c.get("user");
  const key = await db.getKey(c.env.DB, c.req.param("id"), user.org_id);
  if (!key) return c.redirect("/dashboard");
  return c.html(keyDetailPage({ user, key }));
});

app.post("/dashboard/keys", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim().slice(0, 60) || "default";

  const plaintext = crypto.generateApiKey();
  const hash = await crypto.sha256hex(plaintext);
  const prefix = plaintext.slice(0, 16);

  // Store locally first (source of truth for the console).
  await db.insertKey(c.env.DB, {
    id: crypto.keyId(),
    org_id: user.org_id,
    user_id: user.id,
    name,
    prefix,
    key_hash: hash,
    created_at: new Date().toISOString(),
    revoked: 0,
    last_used_at: null,
  });

  // Provision into the daemon so the key actually works.
  let flash: { kind: "ok" | "warn" | "err"; msg: string } | undefined;
  try {
    await daemon.daemonProvisionOrg(c.env, user.org_id, user.email);
    await daemon.daemonRegisterKey(c.env, user.org_id, hash, name);
    flash = { kind: "ok", msg: "Key created and active." };
  } catch (e) {
    flash = {
      kind: "warn",
      msg: "Key saved, but the sandbox backend was unreachable — it may not work until the daemon is online.",
    };
  }

  const keys = await db.listKeys(c.env.DB, user.org_id);
  return c.html(dashboardPage({ user, keys, newKey: plaintext, flash }));
});

app.post("/dashboard/keys/:id/revoke", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const key = await db.getKey(c.env.DB, id, user.org_id);
  if (key) {
    await db.revokeKeyRow(c.env.DB, id, user.org_id);
    try {
      await daemon.daemonRevokeKey(c.env, key.key_hash);
    } catch {
      /* best-effort; the local revoke is what the console reflects */
    }
  }
  return c.redirect(`/dashboard/keys/${id}`);
});

export default app;
