# Supabase Migration Plan

**Status:** **live on Supabase** — migrations applied to the real project, the flow verified end to end
against it, and the database-level checklist passing (see *Verification results*). `STORE=memory` remains
the default so a fresh clone still runs and tests with no credentials.

**Project:** `aws-0-ap-northeast-1.pooler.supabase.com:5432` (shared pooler, session mode) — the exact mode
matters; see *Connection* below.

**Docs of record:** [`structure.md`](./structure.md) §4 ("Database — Supabase (PostgreSQL), accessed only
by the backend"), [`api-convention.md`](./api-convention.md) §3 (the browser gets no database
credentials), [`rule.md`](./rule.md) (PDPA encryption at rest, CCA §26 append-only logs ≥90 days).

The MVP backend keeps everything in `MemoryStore` — in-process maps. That is deliberate (no account, no
credentials, instant demo), but it is the one part `backend-mvp.md` marks as not production. This plan
replaces it without changing a single endpoint, payload or WebSocket message.

## What does *not* change

- The HTTP contract and the two sockets (`docs/api-contract.md` §3.1/§3.2/§4.1/§4.2) — byte for byte.
- `Demo/group-demo.html` and `Demo/sync.js`. The demo cannot tell which store is behind the API.
- The credential-free path: with `STORE` unset the server still runs `bun test` and `bun run dev:local`
  on the in-memory store with no database and no `.env`.

## Phases

**Phase 1 — split storage from HTTP (no credentials needed).**
1. Define a repository interface listing only the operations the routes actually call
   (`backend/src/repository.ts`).
2. Move the in-memory implementation behind it (`backend/src/stores/memory-store.ts`).
3. Make the handlers async and route every read/write through a transaction scope, so a real database
   can wrap a multi-row mutation in one transaction (`backend/src/app.ts`).
4. Select the store by env: `STORE=memory` (default) or `STORE=postgres`.
5. Keep the existing test suite green on the memory store.

**Phase 2 — Postgres store (needs the project).**
6. Author the schema as plain SQL migrations (`backend/migrations/`) and a tiny runner
   (`bun run migrate`). Migrations are the single source of truth: tables, indexes, triggers, retention.
7. Implement `PostgresRepository` (`backend/src/stores/postgres-store.ts`) against the same interface.
8. Run the verification checklist below, then flip `STORE=postgres`.

## Schema

| Table | Holds | Notes |
|---|---|---|
| `tags` | registered card identities | `uid_hash` (HMAC, see below), opaque `tag_id`, label, status |
| `groups` | one row per visit/party | status, `start_time` |
| `sessions` | one row per member per group | check-in/out times, status |
| `receipts` | confirmed check-out evidence | amount (satang), staff, confirmed-at, bill version (ETA §9) |
| `audit_log` | CCA §26 traffic log | append-only, ≥90-day retention |
| `reader_state` | the single open join window + the pending reader outcome | one row; makes the reader coordination multi-instance-safe |

Conventions (`domain.ts` + `api-convention.md` §7): money as integer satang (never float), `timestamptz`
everywhere, app-generated UUIDs for exposed IDs so the wire contract's ID format survives the storage
change, snake_case columns mapped to camelCase API fields in the store layer.

### Integrity guards the in-memory store was hiding

- `CREATE UNIQUE INDEX ... ON sessions (tag_id) WHERE status = 'open'` — at most one open session per
  card. In memory, the scan handler's own check made this impossible to violate; with real rows, two
  concurrent taps would otherwise create two.
- `SELECT ... FOR UPDATE` on the session/group row whenever an amount is computed from open children —
  kills the double-charge and the stale-amount race the demo currently works around with its one-shot
  `BILL_AMOUNT_MISMATCH` retry.
- Every multi-row mutation (scan, individual check-out, group check-out) inside one transaction.

### Compliance enforced in the database, not in TypeScript

- `audit_log` gets a `BEFORE UPDATE OR DELETE` trigger that raises: the log is append-only as a property
  of the database, not a promise in application code.
- Retention becomes a SQL function (`purge_audit_log_before(interval)`) plus a runnable script, never an
  API route (`api-convention.md` §8.2).
- **Honest limit:** if the backend connects as the table owner (Supabase's `postgres` role), the trigger
  is tamper-**evident**, not tamper-**proof**. A separate non-owner application role is the hardening
  step after the demo.
- Supabase encrypts in transit and at rest; PDPA's "encrypt at rest" is satisfied by the platform, and
  the pepper below is the extra measure for the identifier itself.

## UID hashing — decided: HMAC with a pepper, before the first row

`domain.ts` currently stores `sha256(rawUid)`. An NFC UID is low-entropy (a few bytes), so that hash is
enumerable back to the card and provides no protection. Switching to
`HMAC-SHA256(key=TAG_UID_PEPPER, msg=normalisedUid)` must happen **before any rows are written** — after
that it means re-hashing and rewriting every record. The pepper lives in `backend/.env`, never in the
repo, and the server refuses to start on `STORE=postgres` with the development default.

## Connection

Supabase's dashboard lists **Direct connection** (`db.<ref>.supabase.co:5432`) first — on Free (and paid
plans without the IPv4 add-on) it is **IPv6-only** and simply fails from an IPv4-only home network. Use
the **Shared pooler, session mode** string instead:
`aws-<n>-<region>.pooler.supabase.com:5432` (IPv4-reachable, prepared statements supported).

## Environment

`backend/.env` (gitignored; `backend/.env.example` is committed with placeholders):

```
STORE=postgres
DATABASE_URL=postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASE_PASSWORD=<database password>
TAG_UID_PEPPER=<long random string>
```

The dashboard's `[YOUR-PASSWORD]` token can stay in the URL: the backend substitutes and percent-encodes
`DATABASE_PASSWORD` for you, which removes the whole class of "connection failed because the password
contains `@`". It also ignores the quotes some `.env` habits add and drops Prisma-only parameters such as
`pgbouncer=true`, which Postgres rejects as a startup parameter.

Rules (`AGENTS.md` §5, `rule.md`): the `service_role` key and the connection string never enter the repo
and never travel through a chat window — each teammate provisions their own `.env`. The **frontend and
the ESP32 never get database credentials**; the backend is the only client.

## Verification checklist (phase 2 exit criteria)

Ran against PostgreSQL 16 in a local container (`docker run -d --name nfc-pg -e POSTGRES_PASSWORD=…
-e POSTGRES_DB=nfc -p 5433:5432 postgres:16-alpine`), which is the same engine Supabase runs — only the
connection string differs.

| # | Check | Result |
|---|---|---|
| 1 | Full flow through the HTTP API → restart the process → data still there | ✅ closed group + 98 audit entries survived a restart |
| 2 | `UPDATE audit_log …` / `DELETE FROM audit_log` | ✅ both rejected by the trigger (`append-only`) |
| 3 | No raw UID in the database; not a plain sha256 | ✅ stored value equals the peppered HMAC, differs from sha256 |
| 4 | Two concurrent taps for one card | ✅ `race=[created, already-open]`, exactly one open session; the partial unique index also rejects a hand-written second open row |
| 5 | Second check-out of the same session | ✅ `404 SESSION_ALREADY_CLOSED` — one receipt, no double bill |
| 6 | `bun test` with no `DATABASE_URL` | ✅ 16 pass (in-memory store) |
| 7 | `bun test` with `DATABASE_URL` set | ✅ 16 pass (Postgres store, clean schema per test) |
| 8 | `Demo/group-demo.html` unchanged against `STORE=postgres` | ✅ waiting → joined → roster → check-out, reader push included |
| 9 | Retention job | ✅ `purge_audit_log_before` removed exactly the aged entry and nothing else |
| 10 | A confirmed receipt cannot be silently restated | ✅ second write ignored; first confirmation stands |

Two behaviours worth knowing when reading the results: bills are priced **per started minute** (฿0.50 a
step at ฿30/hour), so the figure is stable for a whole minute and a confirm lands on it; when it does not
— a session that crosses a minute boundary between the preview and the confirm — the backend answers
`BILL_AMOUNT_MISMATCH` with the amount to confirm, and the demo re-confirms with it up to three times.
And `reader_state`/`reader_outcome` are rows rather than process memory, so a second server instance would
share them; the scan lock is still per-card, which is sound because there is one physical reader.

### Verified against the real Supabase project

Same checklist, run against `aws-0-ap-northeast-1.pooler.supabase.com:5432` after `bun run migrate`:

| Check | Result |
|---|---|
| Migration applied (`schema_migrations`, 8 tables, trigger, partial index, retention fn) | ✅ |
| Full flow through the API (register → scan → join → individual check-out) | ✅ 200s |
| Second check-out of the same session | ✅ `404 SESSION_ALREADY_CLOSED` (one receipt — `billedSatang` 7 satang, not 14) |
| Whole-group check-out | ✅ 200, reader push received |
| Restart the API process, read the data back | ✅ group, player and `billedSatang` all survived |
| Concurrent taps for one card | ✅ exactly one open session; index rejects a hand-written second row |
| `UPDATE` / `DELETE` on `audit_log` | ✅ both rejected by the trigger |
| Retention job | ✅ removed exactly the aged entry |
| Peppered HMAC stored, no raw UID anywhere | ✅ |
| Receipt immutability | ✅ a later write cannot restate a confirmed receipt |

**One caveat for the suite, not the app:** over the cloud project the tests need a raised timeout —
`bun test --timeout 45000`. Each test opens a fresh connection to the pooler (TLS + Supavisor, ~200 ms per
request from Thailand), which exceeds Bun's default 5-second per-test budget; the same suite finishes in
under a second against the in-memory store and comfortably against a local container. The cloud-facing
verification is the checklist above, driven through the HTTP API.
