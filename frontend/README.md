# Bue Banana Staff Frontend

Next.js staff console for the NFC group check-in/check-out flow in `docs/designdraft.md` and
`docs/api-contract.md`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3001`. The login page authenticates against the Backend; the staff console
shows active groups and displays no fabricated data when the service is unavailable.

Create `frontend/.env.local` with the Backend URL:

```env
API_BASE_URL=https://buebanana.onrender.com
```

The login route keeps the Backend's staff credential out of the browser: the console verifies the
operator, then stores either the Backend's JWT (once its staff-account API exists) or a signed
test-phase session in an HttpOnly cookie. Nothing in the token is readable by browser JavaScript.
`/api/backend/*` only forwards the documented staff endpoints, and the event
route bridges the authenticated `/ws/admin` WebSocket to a same-origin event stream. Group changes
refresh immediately on events, with an eight-second REST refresh as a fallback.

The Backend must be deployed with migration `0002_staff_accounts.sql` and a strong `JWT_SECRET` before
login works against it. Create the first admin through the Backend's `BOOTSTRAP_ADMIN_USERNAME` and
`BOOTSTRAP_ADMIN_PASSWORD` environment variables (12+ characters); these are read only during startup
and are never shown in the frontend. See `backend/.env.example`.

Staff can view groups and check out members/groups. Admin can do those tasks plus create staff accounts,
change roles, and disable accounts. Both roles can view the audit API because the project rules define
that endpoint as staff/admin-only. Admin account management is enforced by the Backend, not just hidden
in the UI.

## Test-phase staff sign-in

The Backend still has no staff-account API (`POST /api/v1/auth/staff/login` returns 404), so the console
signs staff in against a **static credential in `frontend/.env`** until that lands:

- `STAFF_USERNAME` / `STAFF_PASSWORD` / `STAFF_DISPLAY_NAME` / `STAFF_ROLE`, or several accounts via
  `STAFF_ACCOUNTS=user:password:role:display;...` (`role` is `admin` or `staff`).
- A successful sign-in issues a **30-day, HMAC-signed, HttpOnly cookie** (`SESSION_SECRET`), so a
  session survives reloads, browser restarts, and `next dev` restarts.
- The Backend's own `STAFF_API_TOKEN` and `STAFF_ID` are read server-side from the same file and
  attached to proxied calls and the `/ws/admin` handshake; they never reach the browser.
- `/api/v1/staff` lists this directory; creating or editing accounts returns `501` until the Backend
  exposes the account API. As soon as `POST /api/v1/auth/staff/login` answers, the login route prefers
  it and the static directory is bypassed — no other change needed.
- Swap point for the real identity service: `verifyStaffCredentials()` in `lib/staff-auth.ts`.

## Implemented staff flow

- View active groups and members, check-in times, and Backend-calculated amounts (`PB-04`).
- See the group and member that scanned during the last 30 seconds (`PB-14`, `scan.activity`).
- Check out one member or the whole group after showing the Backend-calculated amount and collecting
  an unticked customer confirmation (`PB-12`, `PB-13`). If the price changed, the updated amount must
  be reviewed and confirmed again.
- View recent live events from `/ws/admin` (`scan.activity`, `group.updated`, `session.closed`).
- No hard-coded demo sessions, history page, generic notification center, table assignment, or false
  reader-online indicator.

NFC check-in remains the core customer flow, handled by the physical reader and Backend. `PB-15` covers
tag and staff identity management APIs; a full tag-management UI is not included here because the
current running Backend does not expose a tag-list endpoint. The customer product catalog is also a
separate customer-facing part of the project, not part of this staff console.
