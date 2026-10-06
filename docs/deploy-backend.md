# Deploying the backend

The API is a plain Bun/Elysia process with two WebSocket channels, so it needs a host that keeps **one
long-lived instance** and speaks **WSS**. That rules out serverless and edge runtimes (Vercel, Netlify
Functions, Cloudflare Workers): they cannot hold `/ws/reader` or `/ws/admin` open, and the reader's
push channel is the whole point of §3.2.

The database is already external (Supabase), so the host stores nothing — restarting the container loses
no data, and this image can be redeployed freely.

## Recommended: Render Web Service, native runtime — no Docker

Render's JavaScript runtime **ships Bun natively** (its own [ElysiaJS guide](https://render.com/docs/deploy-elysiajs)
is literally "Language: `Node`, build `bun install`, start `bun run start`"), including `bun`, `node`,
`postgresql-client` and friends both at build time and at runtime. There is no Dockerfile to maintain,
and no image to rebuild. Free tier, HTTPS/WSS terminated for you, env vars in the dashboard, WebSockets
supported.

1. Push the repo to GitHub (or use the public repo URL) — Render deploys from either.
2. Render dashboard → **New → Web Service** → pick the repo, then fill in:

   | Setting | Value |
   |---|---|
   | Root Directory | `backend` |
   | Runtime / Language | **Node** ← this is the runtime that also provides Bun |
   | Build Command | `bun install` (add `--frozen-lockfile` if you want the lockfile honoured exactly) |
   | Start Command | `bun run start` (→ `bun src/server.ts`) |
   | Health Check Path | `/health` |
   | Instance Type | Free to start; the $7 Starter is worth it for the presentation week — see *cold starts* |

3. Optional, to pin the runtime instead of tracking Render's Bun: set `BUN_VERSION=1.3.3`.
4. Environment variables (Render injects `PORT` itself — do not set it):

   | Key | Value |
   |---|---|
   | `STORE` | `postgres` |
   | `DATABASE_URL` | the Supabase **shared pooler, session mode** string |
   | `TAG_UID_PEPPER` | the same pepper as local — **do not change it**, stored UID hashes depend on it |
   | `DEVICE_API_KEY` | replace the dev value with a private one (the reader's key) |
   | `STAFF_API_TOKEN` | replace the dev value with a private one (the demo's staff token) |

5. Schema: put `bun run migrate` in the **Pre-Deploy Command**, so each deploy applies pending migrations
   before the new instance takes traffic. If your plan does not offer that field, run it once from your
   laptop against the same database instead:

   ```bash
   cd backend && bun run migrate
   ```

6. Check it: `https://<your-service>.onrender.com/health` should answer
   `{"data":{"status":"ok","store":"postgres"}}`.

## Alternative: Fly.io (this is what `backend/Dockerfile` is for)

Render does not need the Dockerfile — it is there only for hosts that do, and for a bit-exact local
reproduction of the production runtime. Fly is the other sane option for this API: better websocket
behaviour (no spin-down if you keep one machine running), same artifact.

```bash
fly launch --dockerfile backend/Dockerfile --no-deploy
fly secrets set STORE=postgres DATABASE_URL=... TAG_UID_PEPPER=... DEVICE_API_KEY=... STAFF_API_TOKEN=...
fly deploy
```

Set `min_machines_running = 1` and a `[[services]] internal_port = 3000` block in `fly.toml` so a
machine is always there. Fly needs a card on file even for small usage.

## Cold starts — the one thing that bites during a demo

A free Render service **spins down after ~15 minutes idle**, and the next request waits ~30-60s while it
boots. Two consequences:

- Live demo: open the deployed Netlify demo **a minute before** you present (that wakes the API), then
  the taps are instant. A WebSocket connection also keeps the instance awake once open.
- Or run a free uptime monitor (e.g. UptimeRobot) pinging `https://<service>.onrender.com/health` every
  5-10 minutes for the week you need it.

## Pointing the frontend at it

`Demo/sync.js` derives everything from one base URL — REST `https://…` and the sockets `wss://…` — so the
deployed demo needs `Demo/backend-config.js` (copy of `backend-config.example.js`) with:

```js
export default {
  backend: 'rest',
  baseUrl: 'https://<your-service>.onrender.com',
  deviceKey: '<the DEVICE_API_KEY you set>',
  staffToken: '<the STAFF_API_TOKEN you set>',
  staffId: 'staff-dev-1',
};
```

Two things to know about that file:

- **Netlify Drop uploads the folder as-is**, so the local (gitignored) `backend-config.js` travels with
  it — but a *git-based* Netlify build would not see it. If you deploy from git, commit a
  `backend-config.js` (or generate it in a build step).
- Everything in that file is **visible in the page source**: the browser demo is the reader and the
  staff client, so it necessarily holds those two keys. Use demo-only values, never a production key,
  and never a database credential — the browser must not be able to reach Postgres (`api-convention.md` §3).

CORS is already handled: `createApp` echoes the request origin (no credentials, no cookies), so the
Netlify domain works without a whitelist. Mixed content is why the API must be HTTPS — an `https://`
demo page cannot call an `http://` API.

## Verify after deploying

1. `GET /health` → `store: postgres`.
2. Open the deployed demo → the badge reads **ONLINE** (REST reachable) and taps work.
3. Check the Supabase Table Editor: `groups` / `sessions` / `receipts` / `audit_log` fill up as you tap —
   that is the whole chain frontend → API → database across three different machines.
4. If the badge stays OFFLINE: the browser console names the failing call (CORS and mixed content are the
   two usual causes).
