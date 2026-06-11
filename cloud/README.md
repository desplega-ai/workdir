# workdir-cloud — control panel

The public web app for workdir: marketing site, signup/login, and **API-key
issuance**, running on **Cloudflare Workers** with **D1** (SQLite) for storage.
It's the account layer; the actual sandboxes run on the headless `workdir`
daemon (Hetzner). This app provisions the keys that daemon accepts.

```
  Browser ──▶ Cloudflare Worker (this app)         Cloudflare Pages/Workers
              ├─ website, signup/login (D1)
              └─ issue/revoke API keys ──┐
                                         │  admin API (provision/revoke by hash)
                                         ▼
  SDK / curl ─────────────────────▶  workdir daemon (Hetzner)   ← Cloudflare Tunnel
              create sandbox, exec, …    Firecracker microVMs
```

- **Source of truth for accounts/keys UI:** this app's D1.
- **Source of truth for runtime key validation:** the daemon (fast, local). We
  push each key's SHA-256 hash to the daemon when issued and revoke it there
  when deleted. Plaintext keys never leave the user's browser session.

## Stack

- [Hono](https://hono.dev) on Cloudflare Workers (routing + server-rendered HTML)
- Cloudflare **D1** for persistence (`orgs`, `users`, `sessions`, `api_keys`)
- Web Crypto for password hashing (PBKDF2) and key hashing (SHA-256) — no deps
- Sessions via an HttpOnly cookie

## Prerequisites

- Node 18+
- A Cloudflare account, and `npx wrangler login` once

## Setup & deploy

```bash
cd cloud
npm install

# 1. Create the D1 database, then paste the printed database_id into wrangler.toml
npm run db:create
#   → copy "database_id = ..." into [[d1_databases]] in wrangler.toml

# 2. Apply the schema
npm run db:migrate            # remote (production D1)
# npm run db:migrate:local    # local dev DB

# 3. Set secrets (NOT in wrangler.toml)
npx wrangler secret put WORKDIR_ADMIN_KEY   # the daemon's admin API key
npx wrangler secret put SESSION_SECRET      # any random 32+ char string

# 4. Point it at your daemon (edit wrangler.toml [vars])
#    WORKDIR_API_URL = "https://api.workdir.dev"   (your tunnel hostname)

# 5. Deploy
npm run deploy
```

Then add a custom domain (`workdir.dev` / `app.workdir.dev`) to the Worker in the
Cloudflare dashboard (Workers → your worker → Settings → Domains & Routes).

## Local development

```bash
npm run db:migrate:local
echo 'WORKDIR_ADMIN_KEY="sk_live_dev"' > .dev.vars   # gitignored
npm run dev                                          # http://localhost:8787
```

Point `WORKDIR_API_URL` at a locally running daemon (e.g. `http://localhost:8080`)
to test key provisioning end-to-end.

## Connecting to the Hetzner daemon (Cloudflare Tunnel)

The daemon stays **locked down with no inbound ports**. Expose it to Cloudflare
(and to this app) with a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
# on the Hetzner box
curl -fsSL https://pkg.cloudflare.com/cloudflared.deb -o cloudflared.deb && sudo dpkg -i cloudflared.deb
cloudflared tunnel login
cloudflared tunnel create workdir
# route the API + preview wildcard to the daemon
cloudflared tunnel route dns workdir api.workdir.dev
# config.yml: ingress api.workdir.dev -> http://localhost:8080, and
#             "*.sandboxes.workdir.dev" -> http://localhost:8080
sudo cloudflared service install
```

Result: `api.workdir.dev` (and the `*.sandboxes.workdir.dev` preview wildcard)
reach the daemon over an outbound tunnel — the box never opens a port, and this
Worker's `WORKDIR_API_URL` just points at `https://api.workdir.dev`.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Landing page |
| GET/POST | `/signup`, `/login` | Email + password auth |
| POST | `/logout` | End session |
| GET | `/dashboard` | Keys + usage |
| POST | `/dashboard/keys` | Create an API key (provisions to the daemon) |
| POST | `/dashboard/keys/:id/revoke` | Revoke a key |
| GET | `/healthz` | Liveness |

## What's intentionally minimal (good next steps)

- **Billing**: Stripe checkout → top up `prepaid_credits_usd` on the org via the
  daemon admin API. (The daemon already meters per-second usage.)
- **OAuth**: GitHub login is a natural addition alongside email/password.
- **Email**: verification / password reset (via Resend or MailChannels).
- **Rate limiting** on auth routes (Cloudflare rules or a KV counter).
