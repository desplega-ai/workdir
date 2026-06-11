import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import * as crypto from "./auth";
import * as db from "./db";
import type { User } from "./db";
import * as daemon from "./daemon";
import type { Env } from "./daemon";
import { authPage, dashboardPage, landingPage } from "./views";

const SESSION_COOKIE = "wd_session";
const SESSION_TTL_DAYS = 30;

type Vars = { user: User };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// --- helpers ---------------------------------------------------------------

async function currentUser(c: any): Promise<User | null> {
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return null;
  return db.getUserBySession(c.env.DB, sid);
}

function setSessionCookie(c: any, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

// --- public pages ----------------------------------------------------------

app.get("/", async (c) => {
  const user = await currentUser(c);
  return c.html(landingPage(user ?? undefined));
});

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get("/login", async (c) => {
  if (await currentUser(c)) return c.redirect("/dashboard");
  return c.html(authPage("login"));
});

app.get("/signup", async (c) => {
  if (await currentUser(c)) return c.redirect("/dashboard");
  return c.html(authPage("signup"));
});

// --- auth actions ----------------------------------------------------------

app.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

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

  // Mirror the org into the daemon (best-effort; keys created later re-ensure it).
  try {
    await daemon.daemonProvisionOrg(c.env, orgId, email);
  } catch {
    /* daemon may be unreachable in dev; org is provisioned again at key creation */
  }

  const token = crypto.sessionToken();
  await db.createSession(c.env.DB, token, uid, SESSION_TTL_DAYS);
  setSessionCookie(c, token);
  return c.redirect("/dashboard");
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const user = await db.getUserByEmail(c.env.DB, email);
  const ok = user ? await crypto.verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) return c.html(authPage("login", "Incorrect email or password."));

  const token = crypto.sessionToken();
  await db.createSession(c.env.DB, token, user.id, SESSION_TTL_DAYS);
  setSessionCookie(c, token);
  return c.redirect("/dashboard");
});

app.post("/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await db.deleteSession(c.env.DB, sid);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/");
});

// --- authenticated dashboard ----------------------------------------------

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
  const usage = await daemon.daemonOrgUsage(c.env, user.org_id);
  return c.html(dashboardPage({ user, orgId: user.org_id, keys, usage }));
});

app.post("/dashboard/keys", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim().slice(0, 60) || "default";

  const plaintext = crypto.generateApiKey();
  const hash = await crypto.sha256hex(plaintext);
  const prefix = plaintext.slice(0, 16);

  // Store locally first (source of truth for the dashboard).
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
  const usage = await daemon.daemonOrgUsage(c.env, user.org_id);
  return c.html(dashboardPage({ user, orgId: user.org_id, keys, usage, newKey: plaintext, flash }));
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
      /* best-effort; the local revoke is what the dashboard reflects */
    }
  }
  return c.redirect("/dashboard");
});

export default app;
