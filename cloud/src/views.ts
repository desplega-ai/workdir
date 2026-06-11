import { html, raw } from "hono/html";
import type { ApiKeyRow } from "./db";

const STYLES = `
  :root {
    --bg:#0b0d10; --panel:#14171c; --border:#23272e; --fg:#e6e8eb; --muted:#8a929c;
    --accent:#5b8cff; --accent2:#7c5cff; --ok:#3fb950; --warn:#d29922; --danger:#f85149;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; line-height:1.55; }
  a { color:var(--accent); text-decoration:none; } a:hover { text-decoration:underline; }
  .wrap { max-width:920px; margin:0 auto; padding:0 20px; }
  header.nav { display:flex; align-items:center; justify-content:space-between; padding:18px 0; border-bottom:1px solid var(--border); }
  .logo { font-weight:700; font-size:18px; letter-spacing:-.02em; }
  .logo span { color:var(--accent); }
  .btn { display:inline-block; padding:9px 16px; border-radius:8px; border:1px solid var(--border); background:var(--panel); color:var(--fg); font-weight:600; cursor:pointer; font-size:14px; }
  .btn:hover { border-color:#3a414b; text-decoration:none; }
  .btn.primary { background:linear-gradient(180deg,var(--accent),var(--accent2)); border:none; color:white; }
  .btn.danger { color:var(--danger); border-color:#3a2326; background:#1b1416; }
  .hero { padding:72px 0 40px; }
  .hero h1 { font-size:46px; line-height:1.1; letter-spacing:-.03em; margin:0 0 16px; }
  .hero p.lead { font-size:19px; color:var(--muted); max-width:620px; margin:0 0 28px; }
  code, pre { font-family:var(--mono); }
  pre { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px 18px; overflow-x:auto; font-size:13.5px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin:36px 0; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:18px; }
  .card h3 { margin:0 0 6px; font-size:15px; }
  .card p { margin:0; color:var(--muted); font-size:14px; }
  .panel { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:22px; margin:18px 0; }
  .panel h2 { margin:0 0 14px; font-size:17px; }
  form.auth { max-width:380px; margin:40px auto; }
  label { display:block; font-size:13px; color:var(--muted); margin:14px 0 6px; }
  input[type=email],input[type=password],input[type=text] { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--border); background:#0e1116; color:var(--fg); font-size:14px; }
  input:focus { outline:none; border-color:var(--accent); }
  .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .muted { color:var(--muted); }
  .small { font-size:13px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:500; font-size:12.5px; text-transform:uppercase; letter-spacing:.04em; }
  .keycode { font-family:var(--mono); font-size:13px; background:#0e1116; border:1px solid var(--border); border-radius:8px; padding:12px 14px; word-break:break-all; }
  .flash { border-radius:10px; padding:12px 16px; margin:16px 0; font-size:14px; }
  .flash.ok { background:#11261a; border:1px solid #1f6f3a; color:#b6f0c8; }
  .flash.warn { background:#241d10; border:1px solid #6b5418; color:#f0dcae; }
  .flash.err { background:#2a1517; border:1px solid #6b2226; color:#f3b6ba; }
  .pill { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); }
  .pill.revoked { color:var(--danger); border-color:#3a2326; }
  footer { color:var(--muted); font-size:13px; padding:40px 0; border-top:1px solid var(--border); margin-top:48px; }
`;

function layout(title: string, body: ReturnType<typeof html>, user?: { email: string }) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          ${raw(STYLES)}
        </style>
      </head>
      <body>
        <div class="wrap">
          <header class="nav">
            <a class="logo" href="/">work<span>dir</span></a>
            <div class="row">
              <a class="small muted" href="https://github.com/mv37-org/workdir">GitHub</a>
              <a class="small muted" href="https://github.com/mv37-org/workdir/blob/main/docs/API.md">Docs</a>
              ${user
                ? html`<a class="btn" href="/dashboard">Dashboard</a>
                    <form method="post" action="/logout" style="margin:0">
                      <button class="btn" type="submit">Log out</button>
                    </form>`
                : html`<a class="small muted" href="/login">Log in</a>
                    <a class="btn primary" href="/signup">Sign up</a>`}
            </div>
          </header>
          ${body}
          <footer>
            workdir — run untrusted code in fast, cheap Firecracker microVMs.
            Open source (AGPL-3.0) · <a href="https://workdir.dev">workdir.dev</a>
          </footer>
        </div>
      </body>
    </html>`;
}

export function landingPage(user?: { email: string }) {
  return layout(
    "workdir — sandboxes for AI agents",
    html`
      <section class="hero">
        <h1>Run untrusted code in<br />fast, cheap microVMs.</h1>
        <p class="lead">
          Every sandbox is a Firecracker microVM that boots in tens of milliseconds. One API for AI
          agents, CI jobs, and app previews — billed by the second, thrown away when you're done.
        </p>
        <div class="row">
          <a class="btn primary" href="/signup">Get an API key →</a>
          <a class="btn" href="https://github.com/mv37-org/workdir">Self-host it</a>
        </div>
        <pre style="margin-top:28px">${`const box = await workdir.sandboxes.create();   // boots in ~40ms
const { stdout } = await box.exec("echo hello"); // → "hello"
await box.delete();`}</pre>
      </section>
      <div class="grid">
        <div class="card"><h3>⚡ Fast</h3><p>Warm pools mean &lt;50ms to first command on the default sandbox.</p></div>
        <div class="card"><h3>💸 Cheap</h3><p>Runs on bare metal. ~$0.009 per sandbox-hour for the base shape.</p></div>
        <div class="card"><h3>🔒 Isolated</h3><p>Each sandbox is its own Firecracker microVM under the jailer.</p></div>
        <div class="card"><h3>🧩 Batteries</h3><p>Secrets, docker-in-docker, S3 mounts, browser + VNC, previews.</p></div>
      </div>
    `,
    user,
  );
}

export function authPage(mode: "login" | "signup", error?: string) {
  const isSignup = mode === "signup";
  return layout(
    isSignup ? "Sign up — workdir" : "Log in — workdir",
    html`
      <form class="auth" method="post" action="${isSignup ? "/signup" : "/login"}">
        <h2>${isSignup ? "Create your account" : "Welcome back"}</h2>
        ${error ? html`<div class="flash err">${error}</div>` : ""}
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required autofocus />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required minlength="8" />
        <div style="margin-top:20px">
          <button class="btn primary" type="submit" style="width:100%">
            ${isSignup ? "Sign up" : "Log in"}
          </button>
        </div>
        <p class="small muted" style="text-align:center; margin-top:16px">
          ${isSignup
            ? html`Already have an account? <a href="/login">Log in</a>`
            : html`Need an account? <a href="/signup">Sign up</a>`}
        </p>
      </form>
    `,
  );
}

export function dashboardPage(opts: {
  user: { email: string };
  orgId: string;
  keys: ApiKeyRow[];
  usage: Record<string, unknown> | null;
  newKey?: string;
  flash?: { kind: "ok" | "warn" | "err"; msg: string };
}) {
  const { user, orgId, keys, usage, newKey, flash } = opts;
  const balance = usage?.balance_usd as number | undefined;
  const active = usage?.active_sandboxes as number | undefined;
  const cost = usage?.total_cost_usd as number | undefined;

  return layout(
    "Dashboard — workdir",
    html`
      <section style="padding:28px 0 8px">
        <h1 style="font-size:26px; margin:0 0 4px">Dashboard</h1>
        <p class="muted small" style="margin:0">${user.email} · org <code>${orgId}</code></p>
      </section>

      ${flash ? html`<div class="flash ${flash.kind}">${flash.msg}</div>` : ""}
      ${newKey
        ? html`<div class="panel">
            <h2>Your new API key</h2>
            <p class="small muted">Copy it now — it's shown only once.</p>
            <div class="keycode">${newKey}</div>
          </div>`
        : ""}

      <div class="grid" style="margin:18px 0">
        <div class="card"><h3>${balance !== undefined ? `$${balance.toFixed(2)}` : "—"}</h3><p>Credit balance</p></div>
        <div class="card"><h3>${active ?? "—"}</h3><p>Active sandboxes</p></div>
        <div class="card"><h3>${cost !== undefined ? `$${cost.toFixed(4)}` : "—"}</h3><p>Spent this period</p></div>
      </div>

      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">API keys</h2>
          <form method="post" action="/dashboard/keys" class="row" style="margin:0">
            <input type="text" name="name" placeholder="key name (e.g. prod)" style="width:200px" />
            <button class="btn primary" type="submit">Create key</button>
          </form>
        </div>
        ${keys.length === 0
          ? html`<p class="muted small" style="margin-top:16px">No keys yet. Create one to start using the API.</p>`
          : html`<table style="margin-top:14px">
              <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${keys.map(
                  (k) => html`<tr>
                    <td>${k.name ?? "—"}</td>
                    <td><code>${k.prefix}…</code></td>
                    <td class="muted small">${k.created_at.slice(0, 10)}</td>
                    <td>
                      ${k.revoked
                        ? html`<span class="pill revoked">revoked</span>`
                        : html`<span class="pill">active</span>`}
                    </td>
                    <td style="text-align:right">
                      ${k.revoked
                        ? ""
                        : html`<form method="post" action="/dashboard/keys/${k.id}/revoke" style="margin:0">
                            <button class="btn danger" type="submit">Revoke</button>
                          </form>`}
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>`}
      </div>

      <div class="panel">
        <h2>Quickstart</h2>
        <pre>${`# point the SDK at the API with your key
export WORKDIR_API_URL=https://api.workdir.dev
export WORKDIR_KEY=<your key above>

curl -s -X POST $WORKDIR_API_URL/v1/sandboxes \\
  -H "Authorization: Bearer $WORKDIR_KEY"`}</pre>
        <p class="small muted">Full reference in the <a href="https://github.com/mv37-org/workdir/blob/main/docs/API.md">API docs</a>.</p>
      </div>
    `,
    user,
  );
}
