# Backend MVP

This MVP implements the documented NFC group check-in/check-out flow as an ElysiaJS API. It is a
development backend with an in-memory repository; Supabase can replace `MemoryStore` without changing
the HTTP contract.

## Scope

- `PB-01`, `PB-02`, `PB-03`, `PB-04`, `PB-11`, `PB-12`, `PB-13`, `PB-14`, `PB-15`
- Pain 3: self-service NFC check-in/check-out with staff visibility
- Rate: ฿30/hour, represented as `3000` satang/hour
- Group join window: 30 seconds, with a 2-second scan retry deduplication window

## Run

Requires Bun. No database, Supabase account, database URL, or database credential is required for
this MVP.

```bash
cd backend
bun install
bun test
bun run dev:local
```

The local server uses `MemoryStore` and keeps all tags, groups, sessions, receipts, and audit records
in process memory. Restarting the server clears this development data. This is intentional for the
credential-free MVP; the production repository can later replace `MemoryStore` with Supabase.

Development defaults are available for local testing only:

- Device header: `X-Device-Key: dev-device-key`
- Staff header: `Authorization: Bearer dev-staff-token`
- Staff ID: `staff-dev-1`

Set `DEVICE_API_KEY`, `STAFF_API_TOKEN`, `DEV_STAFF_ID`, and `PORT` in deployment environments.
Use HTTPS at the deployment boundary; this MVP does not provide TLS termination.

## Endpoints

- `POST /api/v1/nfc-tags` registers a tag through the staff API. The raw UID is hashed for lookup and
	is never returned.
- `POST /api/v1/scans` accepts a device-authenticated raw UID and returns `waiting`, `joined`, `group`,
	or an error according to `docs/api-contract.md`.
- `POST /api/v1/reader/dismiss` clears the ephemeral join window.
- `GET /api/v1/groups?status=active|closed` returns staff-safe active or closed groups.
- `POST /api/v1/sessions/:sessionId/check-out` checks out one member.
- `POST /api/v1/groups/:groupId/check-out` checks out the whole group.
- `GET /api/v1/audit-logs` returns audit records to authenticated staff and records the access.

Both checkout routes require the authenticated staff ID, the calculated integer satang amount, and an
explicit `customerConfirmed: true` value. Confirmed receipts preserve the staff identity, amount,
timestamp, and bill version.

## Compliance boundary

The implementation applies the PDPA minimisation rule by keeping only a hash of the raw UID in the
development store and exposing opaque IDs. Check-in, checkout, staff actions, and audit-log access are
recorded without raw UIDs or credentials. The production repository must add encrypted-at-rest storage,
role-based JWT authorization, append-only storage, integrity protection, and retention/deletion jobs that
retain traffic logs for at least 90 days under `docs/rule.md`.
