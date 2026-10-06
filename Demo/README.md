# 🎲 NFC Boardgame Library — Web NFC Demo

**`index.html` is the demo** — the **group-flow demo** from `docs/api-contract.md` §3.1, wired to the
ElysiaJS backend in [`../backend`](../backend) over REST + WebSocket. This is the MVP to present.

It replaced the original **offline** Web NFC pay-per-play timer (plain HTML, `localStorage`, no backend),
which was useful for validating Web NFC on a real phone but proved a point the backend now owns: a tap
must move state that every device can see. That page and its `app.js` / `style.css` are gone from the
working tree; they remain in git history if you ever need the Web NFC read/write reference.

---

## The demo — `index.html` (backend-connected group flow)

It runs the real **one-shared-reader** flow: a tap either creates a group (`waiting`), joins the open
group (`joined`), or reopens an existing group's roster (`group`) — and staff then check out one player
or the whole group.

| Direction | Channel | What travels |
|---|---|---|
| Demo → backend | **REST** | `POST /api/v1/scans`, `POST /api/v1/reader/dismiss`, `POST /api/v1/sessions/:sessionId/check-out`, `POST /api/v1/groups/:groupId/check-out`, `GET /api/v1/groups`, `POST /api/v1/demo/reset` |
| Backend → reader | **`/ws/reader`** | The check-out result (`screen: success` with the group bill, or `tagRemoved`) — opened **only while the `group` screen is showing**, exactly as §3.2 specifies, with a `GET /api/v1/reader/state` poll as the fallback if that socket drops |
| Backend → staff | **`/ws/admin`** | `scan.activity`, `group.updated`, `session.closed` (§4.2) |

The header badge reads **ONLINE** when the REST API and the WebSocket are both reachable, and the
activity log names which channel produced each line (`scan · …` from `/ws/admin`, `reader push · …`
from `/ws/reader`, `reader poll · …` from the polling fallback).

Amounts are the backend's: the staff panel shows what the server reports and posts that figure back. If
the bill ticks over between the two, the backend answers `BILL_AMOUNT_MISMATCH` with the expected
amount and the demo confirms that instead.

There is **no local or offline mode**: if the backend is unreachable the demo says so on the reader
screen and stays empty, rather than running on state no other device can see. (The single shared reader
makes one stale copy worse than none — `docs/api-contract.md` §3.1.)

The page is self-contained: its styles are inline and `sync.js` is its only import, so the folder can be
dropped on a static host as-is.

### Running it

Two processes — the API and a static server for the page:

```bash
# terminal 1
cd backend
bun install
bun run dev:local          # http://localhost:3000

# terminal 2
cd Demo
python -m http.server 8080 # http://localhost:8080
```

A local server is required — the page uses ES modules, which browsers refuse to load from `file://`.

Open `http://localhost:8080`. The demo registers its eight synthetic cards
(`DEMO-CARD-A` … `DEMO-CARD-H`) on load, so there is nothing to prepare.

**Two windows make the best demo:** one to tap cards on (the reader simulator) and one left open as the
staff view. Both talk to the same backend, so the second window shows the scanning player, the rosters
and the checkout buttons through `/ws/admin` alone — no polling.

With no config file the demo uses the development keys from `docs/backend-mvp.md` and
`http://localhost:3000`. To point it elsewhere:

```bash
cp Demo/backend-config.example.js Demo/backend-config.js    # gitignored
```

### Deploying it

The page is static; the API is not. Deploy the backend first (Render — see
[`docs/deploy-backend.md`](../docs/deploy-backend.md)), then put that URL in `Demo/backend-config.js`
and drag the `Demo/` folder onto a static host (Netlify Drop, GitHub Pages, …), which supplies the HTTPS
Web NFC needs. Upload `Demo/` and nothing else: the repository root contains `backend/.env`.

Note that `backend-config.js` is served to every visitor, so it must carry demo keys only — never a
database credential. The same file is gitignored, so a git-based build would not see it.

### Alternative backend — Firestore (earlier plumbing)

`sync.js` also still carries the earlier **Firestore** sync layer, kept for running the group flow
across devices without a backend process. Select it with `backend: 'firestore'` in
`Demo/backend-config.js`.

**No config file → the local emulator.** This keeps everything on your machine, which is what
`docs/rule.md` (PDPA) asks for in development and testing:

```bash
npm install -g firebase-tools        # once
firebase emulators:start --project demo-nfc-cafe
```

> **JDK 21+ is required.** `firebase-tools` 15.x refuses to start the emulators on older Java
> runtimes ("no longer supports Java version before 21").

**A real (throwaway) Firebase project** instead:

1. Create the project, then create a **Firestore Database** in *Native mode*.
2. Enable **Authentication → Sign-in method → Anonymous** (the rules require an authenticated caller).
3. Copy `Demo/firebase-config.example.js` → `Demo/firebase-config.js` (gitignored), fill in the web
   config from the Firebase console, and set `useEmulator: false`.
4. Publish the rules: `firebase deploy --only firestore:rules --project <your-project-id>`

### What the sync layer is — and is not

- `Demo/sync.js` is the **only** place that talks to a backend. `rest` (the default) speaks the
  documented contract; `firestore` is demo plumbing only — `docs/structure.md` §4 keeps the real
  database behind the ElysiaJS API, and `docs/api-convention.md` §3 gives the browser no database
  credentials, so a client writing straight to Firestore cannot satisfy the audit rules in `rule.md`
  (CCA §26).
- Every state-changing action is audited. In REST mode the **backend** owns the audit log (append-only,
  retained on reset); in Firestore mode the demo appends to its own `demoAudit` collection,
  made append-only by `firestore.rules`.
- No path ever stores a raw NFC UID: the demo's cards are synthetic (`DEMO-CARD-A` … on the REST path,
  `tag_A` … `tag_H` on the Firestore path) and carry no personal data, and audit entries record an
  internal tag id plus a random device id — never a name.
- Billing is always ฿30/hour, per-minute, computed from the stored check-in time. In REST mode the
  **server** computes it and the demo only displays/confirms it; in Firestore mode `amountFor()` uses
  the identical rule.

## 🧱 Project structure

```
NFC_boardgame_reader/
├── AGENTS.md       # primary shared context for AI assistants
├── backend/        # ElysiaJS API MVP (REST + /ws/reader + /ws/admin)
│   ├── src/        # app.ts (routes + sockets), domain.ts (pricing/group projection),
│   │               # realtime.ts (socket payloads), config.ts (env), repository.ts (store seam),
│   │               # stores/ (memory-store.ts | postgres-store.ts), db/ (migrate, connect, retention)
│   ├── migrations/ # 0001_init.sql — schema, constraints, append-only audit trigger
│   └── .env.example# STORE, DATABASE_URL/DATABASE_PASSWORD, TAG_UID_PEPPER, keys
├── firebase.json   # emulator config for the optional Firestore demo backend
├── firestore.rules # demo-only rules: authenticated callers, append-only audit
├── docs/           # documentation set: rule.md, proposal.md, backlog.md, designdraft.md,
│                   # structure.md, api-convention.md, api-contract.md, backend-mvp.md,
│                   # supabase-migration-plan.md, deploy-backend.md
└── Demo/           # the demo (drop this folder on a static host)
    ├── index.html               # one-shared-reader group flow, wired to backend/ by default
    ├── sync.js                  # REST + WebSocket backend, plus the optional Firestore layer
    ├── backend-config.example.js # copy to backend-config.js to point at another backend
    ├── firebase-config.example.js # optional real Firestore project config
    └── README.md                # this file
```
