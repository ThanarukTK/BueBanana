# Backend MVP

This MVP implements the documented NFC group check-in/check-out flow as an ElysiaJS API. It is a
development backend with an in-memory repository; Supabase can replace `MemoryStore` without changing
the HTTP contract.

## Scope

- `PB-01`, `PB-02`, `PB-03`, `PB-04`, `PB-11`, `PB-12`, `PB-13`, `PB-14`, `PB-15`
- Pain 3: self-service NFC check-in/check-out with staff visibility
- Rate: ฿30/hour, represented as `3000` satang/hour and billed **per started minute** (฿0.50 a step,
  `RATE_PER_MINUTE_SATANG`). The bill is always priced **server-side** from the stored check-in time,
  with **no minimum charge** (`domain.ts` `moneyForDurationMs`). A client never gets to state a price —
  it confirms the one the backend reports (`BILL_AMOUNT_MISMATCH` carries the expected figure).

  Per-minute granularity is a correctness choice, not a rounding detail: a bill that moved every ~1.2
  seconds (that rate rounded to the satang) could change between the figure staff read out and the
  confirm arriving, so on a slow link the customer was asked to re-confirm a price that moved while they
  watched. With minute steps the amount is stable for a whole minute, and 1h 25m is exactly ฿42.50.
- Group join window: 30 seconds, with a 2-second scan retry deduplication window

## Run

Requires Bun. **No database is required** — the default store keeps everything in process memory, so a
fresh clone runs and tests with no account, no credentials and no `.env`.

```bash
cd backend
bun install
bun test
bun run dev:local
```

### Storage — memory (default) or PostgreSQL/Supabase

The API talks to a repository interface (`src/repository.ts`); which store backs it is one env var.
Nothing else changes: not an endpoint, not a payload, not a WebSocket message, and not the demo.

| `STORE` | Store | Use |
|---|---|---|
| unset / `memory` | `MemoryStore` (`src/stores/memory-store.ts`) | Development, demos, tests. Cleared on restart. |
| `postgres` | `PostgresRepository` (`src/stores/postgres-store.ts`) | Durable. Supabase, or any PostgreSQL. |

```bash
# .env (gitignored) — see backend/.env.example
STORE=postgres
DATABASE_URL=postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
# Or the password on its own line — it is percent-encoded for you, so @ : / ? # & are safe:
DATABASE_PASSWORD=<database password>
TAG_UID_PEPPER=<long random string>

bun run migrate     # applies backend/migrations/*.sql, records them in schema_migrations
bun run dev:postgres
bun run retention   # scheduled job: purge audit entries past the 90-day window
```

Two things to get right, both of which fail in confusing ways:

- **Copy the "Shared pooler, session mode" string**, not the "Direct connection" one the Supabase
  dashboard lists first: the direct host is IPv6-only on Free plans and simply fails to connect from an
  IPv4-only network. Port 6543 (transaction mode) also works, but the driver turns prepared statements
  off automatically for it.
- **Set `TAG_UID_PEPPER` before the first row is written.** Raw NFC UIDs are stored as
  HMAC-SHA256(uid, pepper); a bare hash of a low-entropy UID is enumerable back to the card, and
  re-keying later means rewriting every record. The server refuses to start on the Postgres path with
  the development pepper.

`docs/supabase-migration-plan.md` has the schema, the integrity guards and the verification results.

Two practical notes for the Postgres path:

- **The suite needs a longer timeout over a cloud database.** Each test opens a fresh connection to the
  pooler (TLS + Supavisor, ~200 ms per request from Thailand), which is more than Bun's default 5-second
  per-test budget: run `bun test --timeout 45000` against Supabase. In-memory and local-container runs are
  unaffected.
- **The suite wipes the tables it touches** (it truncates between tests, for isolation). Point it at a
  development project, never at data you care about.

### What the database enforces (not the TypeScript)

- `sessions_one_open_per_tag` — a partial unique index: at most one open session per card, so two
  concurrent taps cannot both start a visit. The store also takes a transaction-scoped advisory lock per
  tag, and every check-out prices from `FOR UPDATE`-locked rows.
- `audit_log` is append-only via a `BEFORE UPDATE OR DELETE` trigger; the only supported deletion path is
  the retention job (`purge_audit_log_before`, ≥90 days). On Supabase the backend connects as the table
  owner, so this is tamper-**evident**, not tamper-**proof** — a non-owner app role is the hardening step.

The in-memory store keeps all tags, groups, sessions, receipts, and audit records in process memory.
Restarting the server clears this development data. This is intentional for the credential-free MVP; the
production repository can later replace `MemoryStore` with Supabase.

Development defaults are available for local testing only:

- Device header: `X-Device-Key: dev-device-key`
- Staff header: `Authorization: Bearer dev-staff-token`
- Staff ID: `staff-dev-1`

Set `DEVICE_API_KEY`, `STAFF_API_TOKEN`, `DEV_STAFF_ID`, and `PORT` in deployment environments.
Use HTTPS at the deployment boundary; this MVP does not provide TLS termination.

## Endpoints (REST)

- `POST /api/v1/nfc-tags` registers a tag through the staff API. The raw UID is hashed for lookup and
  is never returned. Registering the same raw UID again returns the **existing** tag identity instead
  of minting a second one, so a repeated registration cannot orphan a live session.
- `POST /api/v1/scans` accepts a device-authenticated raw UID and returns `waiting`, `joined`, `group`,
  or an error according to `docs/api-contract.md`.
- `POST /api/v1/reader/dismiss` clears the ephemeral join window.
- `GET /api/v1/reader/state` is the polling fallback for a reader whose WebSocket dropped (§3.2):
  `200` plus a `{ "data": { "screen": ... } }` payload when there is a terminal result to render,
  `204` when nothing is pending (the reader keeps whatever it is showing).
- `GET /api/v1/groups?status=active|closed` returns staff-safe active or closed groups.
- `POST /api/v1/sessions/:sessionId/check-out` checks out one member.
- `POST /api/v1/groups/:groupId/check-out` checks out the whole group.
- `GET /api/v1/audit-logs` returns audit records to authenticated staff and records the access.
- `POST /api/v1/demo/reset` is **development only**: clears operational state (groups, sessions,
  receipts, join window, scan dedupe) so a live demo can be restarted without killing the process.
  It never deletes audit records (`rule.md`, CCA §26) and never deletes registered tag identities.

Both checkout routes require the authenticated staff ID, the calculated integer satang amount, and an
explicit `customerConfirmed: true` value. Confirmed receipts preserve the staff identity, amount,
timestamp, and bill version.

## WebSocket channels

Both channels are implemented in `src/app.ts` (`.ws(...)`) with payload shapes built in
`src/realtime.ts`. Publishing happens inside the REST handlers, so a tap is pushed the moment it
resolves — nothing polls.

| Channel | Credential | Purpose |
|---|---|---|
| `WSS /ws/reader` | `X-Device-Key`, or `?deviceKey=` | `docs/api-contract.md` §3.2 — terminal check-out results only, while the reader shows the `group` screen |
| `WSS /ws/admin` | `Authorization: Bearer`, or `?token=` | §4.2 — `scan.activity`, `group.updated`, `session.closed` |

Both are **push-only** from the client's side. A reader following the contract opens `/ws/reader` when
it enters the `group` screen and closes it on a terminal result, the close button, or the display
timeout; if the socket cannot be opened it polls `GET /api/v1/reader/state` instead. The MVP server
supports both paths, so the firmware can implement whichever is live.

A browser cannot set custom headers on a WebSocket handshake, so the two channels also accept the
credential as a query parameter. The header stays the documented contract for firmware and
server-side clients.

## Field additions to the wire contract

`docs/api-contract.md` §3.4 allows **adding optional fields** inside `/api/v1`. The MVP adds three,
each because a staff client otherwise has to guess something only the backend knows:

| Addition | Where | Why |
|---|---|---|
| `sessionId`, `amountSatang` per entry in `Group.tags[]`, plus `amountSatang` for the group | `GET /groups`, `group.updated`, `POST /scans` | Address one member's check-out, and show the exact amount the backend will accept |
| `sessionId` in `scan.activity` | `/ws/admin` | `PB-14` "who is scanning" needs the roster entry the tap belongs to |
| `reader` block (`openGroupId`, `openUntil`, `activePlayers`, `currentBillSatang`, `billedSatang`, `ratePerHour`) | `GET /groups` | The join window and the money actually taken are backend-owned; the floor view only renders them |
| `groupId` in the `/ws/reader` payloads | `/ws/reader` | Lets the reader ignore a push for a group it is no longer showing |

No existing field was removed, renamed, or repurposed.

## CORS

The demo page is served from a static origin (`python -m http.server 8080`) while the API runs on its
own port, so the browser needs a preflight allowance. `createApp` answers `OPTIONS` with `204` and
echoes the request origin, allowing the `x-device-key` and `authorization` headers and **no
credentials** (no cookie is ever accepted).

This is a development/demo concession only: `api-convention.md` §1 puts the production frontend and API
behind one HTTPS host, where no CORS layer is needed.

## Demo wiring

`Demo/group-demo.html` runs the documented flow against this backend (REST for commands, WebSocket for
live updates) — see `Demo/README.md` for how to start both halves. The swap is a config choice, not a
code change: `Demo/sync.js` has one `rest` backend and the earlier `firestore` plumbing behind the same
`NFCSync` facade.

## Compliance boundary

The implementation applies the PDPA minimisation rule by storing only a peppered HMAC-SHA256 of the raw
UID and exposing opaque IDs. Check-in, checkout, staff actions, and audit-log access are recorded without
raw UIDs or credentials. With `STORE=postgres` the audit log is append-only **in the database** (trigger)
and retained by a scheduled job, and the identity index, row locks and transactions close the
double-start / double-charge races that a single process made impossible. Encryption at rest is provided
by the platform (Supabase); the development store has none, which is one more reason it is
development-only.

Still required before this is production, per `docs/rule.md`: role-based JWT authorization (replacing the
shared staff token), encrypted-at-rest guarantees for every field, integrity protection for the log
(a non-owner database role), and a deployment that terminates TLS.
