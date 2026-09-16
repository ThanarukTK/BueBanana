# API Conventions

Conventions for the target **ElysiaJS backend API** (see [`structure.md`](./structure.md)). This
file defines *how* to build endpoints; it does not add new features — every endpoint below exists to
serve an already-approved backlog item. If a future endpoint doesn't map to a `PB-xx` item, add it to
`backlog.md` first instead of inventing scope here.

**Rules applied from [`rule.md`](./rule.md):** PDPA (NFC-identifier-as-personal-data, data
minimisation, random internal identifier instead of raw tag UID, role-based field exposure,
encryption in transit, no personal data in logs, access/correct/delete rights, consent recording);
Computer Crime Act §26 (mandatory audit log on every check-in/out/staff action, ≥90-day retention,
access-to-logs is itself logged); Electronic Transactions Act §9/26/28 (checkout confirmation must
capture signer identity, bill version, amount, timestamp, and an explicit non-pre-ticked action).

---

## 1. Base URL & versioning

```
https://<host>/api/v1/...
```

- Prefix every route with `/api/v1`. Breaking changes bump to `/api/v2`; do not silently change a
  response shape on `v1`.
- Transport is HTTPS only (PDPA: encryption in transit) — no plain HTTP, even for the ESP32 on a LAN.

## 2. Transport

- **REST** for all request/response actions (scans, check-out, CRUD, product listing).
- **WebSocket** (`/ws/admin`) for the one push-based need: the staff admin view showing which table /
  member is currently scanning (`PB-14`). Don't add WebSocket elsewhere — REST + polling is simpler
  and sufficient for everything else per `structure.md`.

## 3. Authentication & authorization

| Caller | Method | Notes |
|---|---|---|
| Staff (Next.js admin UI) | Bearer JWT, issued by `POST /api/v1/auth/staff/login` | Role claim (`staff` / `admin`) gates staff-only routes. Every login attempt (success or failure) is logged per CCA §26. |
| ESP32 hardware | Static per-device API key in `X-Device-Key` header | Identifies the *reader*, not a person — never treat it as a customer credential. |
| Customer | None (no customer login in v1) | Customers act only by tapping a tag; the backend resolves tag → internal customer ID server-side. Don't build a customer-facing auth endpoint unless a backlog item asks for one. |

Checkout confirmation is treated as an ETA §9 electronic signature moment: it requires an
already-authenticated staff member plus an explicit customer-facing confirmation step (§8.5) — never
accept a pre-ticked or implicit confirmation.

## 4. Resource naming

- Nouns, plural, lower-kebab-case for multi-word resources: `/nfc-tags`, `/check-ins` (avoid verbs
  in the path — `POST /sessions/:id/check-out` is the one deliberate exception, see §4.1).
- Resource names mirror the class diagram in `designdraft.md` §4.4: `customers`, `nfc-tags`,
  `groups`, `sessions`, `staff`, `products`.
- Nest only one level deep: `/groups/:groupId/members`, not
  `/groups/:groupId/sessions/:sessionId/members`.

### 4.1 Verbs as sub-resources

A few actions are state transitions, not CRUD, and read better as a verb sub-path:

- `POST /scans` — the one endpoint the ESP32 calls on every tap (there's a single shared reader, so
  the tag UID in the body is enough to identify the tap — see `api-contract.md` §3.1).
- `POST /reader/dismiss` — the reader's close button; clears the current display/join window so the
  next tap starts fresh (`api-contract.md` §3.1.1).
- `POST /sessions/:sessionId/check-out` — individual check-out (`PB-12`).
- `POST /groups/:groupId/check-out` — whole-group check-out (`PB-13`).
- `POST /nfc-tags/:tagId/disable` — staff disabling a lost tag (PDPA lost-tag rule).

## 5. HTTP verb mapping

| Verb | Use |
|---|---|
| `GET` | Read one/many. Never mutates state, never appears in write-audit logs. |
| `POST` | Create a resource, or trigger a state-transition sub-path (§4.1). |
| `PATCH` | Partial update (e.g. staff editing a session time — must hit the audit-log rule in §8.2). |
| `DELETE` | Deactivate/soft-delete only (staff accounts, tags, customer data-deletion requests). Never a hard SQL delete of retention-bound records (CCA §26 / PDPA retention). |

## 6. Request / response envelope

Success:

```json
{ "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 57 } }
```

`meta` is present only on list endpoints. Error:

```json
{ "error": { "code": "TAG_NOT_FOUND", "message": "NFC tag is not registered", "details": {} } }
```

- `code` is a stable, namespaced, UPPER_SNAKE_CASE string — clients branch on `code`, never on
  `message` (message text may change).
- `details` is optional and never contains personal data (PDPA: no unnecessary personal data leaking
  into error payloads/logs).

## 7. Field & type conventions

- JSON field names are `camelCase` (matches the class diagram: `sessionId`, `checkInTime`).
- Timestamps are ISO 8601 UTC strings (`2026-09-17T10:15:00Z`) — CCA §26 requires accurate,
  consistent timestamps.
- All IDs exposed over the API are backend-generated UUIDs (`nfcTagId`, `customerId`,
  `sessionId`, `groupId`, `staffId`). The **physical NFC UID is never returned by the API** —
  per PDPA, the tag stores/maps to a random internal identifier only; the raw UID stays internal to
  the tag-registration flow.
- Money values are integers in satang (minor currency unit), not floats, to avoid rounding drift in
  billing.

## 8. Compliance-driven endpoint behavior

These aren't optional style points — they're `rule.md` requirements expressed as API behavior.

### 8.1 Data minimisation & role-based exposure (PDPA)

- Customer-facing responses (if any customer view is added later) must omit staff-only fields
  (other customers' data, internal notes).
- Staff-facing list endpoints (`GET /groups`, `GET /sessions`) return only what's needed to run the
  floor: name/tag label, table, times, running total — not full customer profile fields.

### 8.2 Audit logging (CCA §26)

Every endpoint that creates/mutates a check-in, check-out, session, bill, or staff action must write
an audit log entry containing: actor (staff/account ID or `system` for hardware-triggered scans),
NFC tag ID, action, endpoint, timestamp, and result. Endpoints in scope:

`POST /scans`, `POST /sessions/:sessionId/check-out`,
`POST /groups/:groupId/check-out`, any `PATCH` to a session/bill/rate, `POST /auth/staff/login`.

- Logs are append-only from the API's perspective — no `DELETE` route for logs before the 90-day
  retention window; log deletion is a scheduled retention job, not an API-triggered action.
- `GET /api/v1/audit-logs` is staff/admin-only, and **viewing it is itself logged** (who viewed,
  when, what filter) per the rule.md requirement that access to logs be traceable.

### 8.3 Consent (PDPA)

If a flow ever collects personal data beyond the minimum (e.g. registering a customer's name),
record consent via its own resource, not a boolean buried in another payload:

```
POST /api/v1/customers/:customerId/consent
{ "noticeVersion": "2026-09-01", "purpose": "check-in-billing", "granted": true }
```

### 8.4 Lost/reissued tags (PDPA)

`POST /nfc-tags/:tagId/disable` followed by `POST /nfc-tags` (new) — never delete historical session
records tied to the old tag; the new tag gets a new internal ID and links to the same `customerId`
if known.

### 8.5 Checkout confirmation (ETA §9/26)

`POST /sessions/:sessionId/check-out` and `POST /groups/:groupId/check-out` require the request body
to carry the confirmation evidence, not just a bare trigger:

```json
{
  "staffId": "...",
  "amount": 4250,
  "customerConfirmed": true
}
```

The backend rejects the call if `customerConfirmed` is missing/false — this is the explicit
affirmative action ETA §9 requires; it must never default to `true`. The stored record (amount,
staff, timestamp, result) is the retrievable evidence for a later dispute. (A `billVersion`/terms-version
field can be added back once the project actually has versioned bills/rates to track — until then
there's nothing for it to reference.)

## 9. Pagination & filtering

- List endpoints accept `?page=&pageSize=` (default `pageSize=20`, max `100`).
- Status filtering uses `?status=active|closed` rather than separate endpoints
  (`GET /groups?status=active` for `PB-04`/`PB-14`, not `GET /groups/active`).

## 10. Idempotency

`POST /scans` must be safe to retry: the ESP32 may resend on a flaky connection. Scope a short dedupe
window (e.g. same `rawTagUid` within 2s = same tap) so a retry never double-creates a session or
double-adds a group member. There's only one reader, so `rawTagUid` alone is enough to key the
dedupe — no reader/table ID is needed.

## 11. Error code catalog (starter set)

`TAG_NOT_FOUND`, `TAG_DISABLED`, `TAG_ALREADY_IN_GROUP`, `GROUP_NOT_FOUND`, `SESSION_ALREADY_CLOSED`,
`STAFF_UNAUTHORIZED`, `CONFIRMATION_REQUIRED`, `VALIDATION_ERROR`. Extend this list in this file as
new codes are introduced — don't let each route invent ad hoc strings.

## 12. Traceability

| Convention area | Backlog item(s) |
|---|---|
| Scan endpoint (check-in, join group) | PB-01, PB-11 |
| Individual/group check-out | PB-02, PB-12, PB-13 |
| Session recording | PB-03 |
| Active session/group listing | PB-04 |
| Admin WebSocket (active table/scanner) | PB-14 |
| Staff & NFC identity management | PB-15 |
| Product endpoints | PB-08, PB-09, PB-10 |
