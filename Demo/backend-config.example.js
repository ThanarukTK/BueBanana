/**
 * Demo backend configuration — copy to `backend-config.js` (gitignored) and edit for your machine.
 *
 *   cp Demo/backend-config.example.js Demo/backend-config.js
 *
 * With no `backend-config.js` the demo uses the same values as `BACKEND_DEFAULTS` in `sync.js`
 * (local backend at http://localhost:3000 with the development keys from `docs/backend-mvp.md`),
 * so a fresh checkout runs with zero setup.
 */
export default {
  /** Which demo backend to use: 'rest' (ElysiaJS API, default) or 'firestore' (the earlier plumbing). */
  backend: 'rest',

  /** Where `backend/` is listening. Must be reachable from the browser doing the demo. */
  baseUrl: 'http://localhost:3000',

  /** Reader credential (`X-Device-Key`) — the ESP32's key in the real system. */
  deviceKey: 'dev-device-key',

  /** Staff credential (Bearer token) — a JWT in the real system. */
  staffToken: 'dev-staff-token',

  /** Staff identity recorded on every check-out receipt and audit entry. */
  staffId: 'staff-dev-1',
};
