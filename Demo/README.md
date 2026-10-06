# 🎲 NFC Boardgame Library — Web NFC Demo

Two demos live here:

| Page | What it is |
|---|---|
| [`index.html`](index.html) | The original **offline** Web NFC pay-per-play timer — plain HTML, `localStorage`, no backend. Real cards on a real phone. |
| [`group-demo.html`](group-demo.html) | The **group-flow demo** from `docs/api-contract.md` §3.1, wired to the ElysiaJS backend in [`../backend`](../backend) over REST + WebSocket. This is the MVP to present. |

The sections below describe `index.html` first, then the backend-connected group demo.

---

## Part 1 — `index.html` (offline Web NFC demo)

A **plain HTML** pay-per-play timer demo that uses **Web NFC** (`navigator.nfc`) so an **Android phone** can:

- **Write** a unique **UUID** (+ optional label) to each NFC card.
- **Read** the card to **start a play timer**, and **stop it** to calculate the bill — **฿30/hour**, per-minute billing.

There are no boardgames — each card is simply a **user**, and every tap starts/stops that user's timer. All sessions are totaled per user in the **Users & Bills** panel.

No backend, no server code — it's a static site that persists demo data in `localStorage`.

## ✨ Features

| Mode | What it does |
|------|--------------|
| 🎮 **Play (timer)** | Tap **📲 Tap card**, then tap your card → your timer starts (you appear under **Now playing** with a live clock). Tap the same card again → the timer stops and the bill is calculated (**฿30/hour**, per-minute). |
| 💾 **Register Cards** | Type a UUID (or leave blank to auto-generate one) → tap a card → the UUID is written to it as an NDEF record. |
| 👥 **Users & Bills** | Every card UUID = one user. Shows each user's sessions, total play time, total cost, and an expandable session history. |

## ✅ Requirements

- An **Android phone** with **Chrome** (Web NFC is not supported on iPhone/iOS Safari).
- **NDEF-formattable** NFC tags (e.g. **NTAG213 / NTAG215 / NTAG216**, Mifare Ultralight). Most blank "NFC stickers" work.
- The page must be served over **HTTPS** (Web NFC only works in a secure context).

## 🚀 How to run it

You have a few options — pick the easiest for your demo.

### Option 1 — Host it free (easiest)

Drag & drop the folder onto any static host that gives free HTTPS:

- **GitHub Pages** / **Netlify Drop** / **Vercel** / **Cloudflare Pages**

Then open the URL in Chrome on your Android phone. Done.

### Option 2 — Local + `adb reverse` (no internet needed, USB connected)

1. Serve the folder on your computer:

   ```bash
   # any static server works, e.g.
   python -m http.server 8080
   ```

2. Connect your Android phone via USB (with USB debugging enabled) and forward the port:

   ```bash
   adb reverse tcp:8080 tcp:8080
   ```

3. On the phone, open Chrome and go to:

   ```
   http://localhost:8080
   ```

   `localhost` counts as a secure context, so Web NFC works without a real HTTPS cert.

### Option 3 — Tunnel to HTTPS

If you can't use USB, expose your local server over HTTPS:

```bash
npx localtunnel --port 8080   # or: cloudflared tunnel --url http://localhost:8080
```

Open the generated `https://…` URL on your phone.

## 🃏 Demo flow

1. Open the page in **Chrome on Android**.
2. Tap **💾 Register Cards**, tap a card against the phone → the card now has a UUID.
3. Repeat for as many cards as you want.
4. Tap **🎮 Play (timer)**, then tap **📲 Tap card**.
5. Tap your card → your timer starts and you appear under **⏱️ Now playing**.
6. Tap the same card again → the timer stops and the bill appears, e.g. **1h 25m · ฿42.50**, added to your totals in **👥 Users & Bills**.

Tap **↺ Reset demo** to wipe `localStorage` and start fresh.

## 📝 Notes & troubleshooting

- **"Web NFC unavailable"** → you're not on Android Chrome, or the page isn't HTTPS/localhost.
- **Permission prompt** → Chrome asks the first time; tap the card again to allow.
- **"Tag not NDEF-formattable"** → some tags (e.g. certain Mifare Classic cards) can't be written with Web NFC.
- **Data lives on the phone** (localStorage) — clearing browser data resets it.
- The card's own serial number (`serialNumber`) is *not* used as identity — we use the **UUID you write**, so it works the same across different tag brands.

---

## Part 2 — `group-demo.html` (backend-connected group flow)

`group-demo.html` runs the real **one-shared-reader** flow from `docs/api-contract.md` §3.1 against the
**ElysiaJS backend in [`../backend`](../backend)**: a tap either creates a group (`waiting`), joins the
open group (`joined`), or reopens an existing group's roster (`group`) — and staff then check out one
player or the whole group.

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

### Running it

Two processes — the API and a static server for the page:

```bash
# terminal 1
cd backend
bun install
bun run dev:local          # http://localhost:3000

# terminal 2
cd Demo
python -m http.server 8080 # http://localhost:8080/group-demo.html
```

A local server is required — the page uses ES modules, which browsers refuse to load from `file://`.

Open `http://localhost:8080/group-demo.html`. The demo registers its eight synthetic cards
(`DEMO-CARD-A` … `DEMO-CARD-H`) on load, so there is nothing to prepare.

**Two windows make the best demo:** one to tap cards on (the reader simulator) and one left open as the
staff view. Both talk to the same backend, so the second window shows the scanning player, the rosters
and the checkout buttons through `/ws/admin` alone — no polling.

With no config file the demo uses the development keys from `docs/backend-mvp.md` and
`http://localhost:3000`. To point it elsewhere:

```bash
cp Demo/backend-config.example.js Demo/backend-config.js    # gitignored
```

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
├── backend/        # ElysiaJS API MVP (REST + /ws/reader + /ws/admin), in-memory store
│   └── src/        # app.ts (routes + sockets), domain.ts (pricing/group projection),
│                   # realtime.ts (socket payloads), store.ts (MemoryStore), server.ts
├── firebase.json   # emulator config for the optional Firestore demo backend
├── firestore.rules # demo-only rules: authenticated callers, append-only audit
├── docs/           # documentation set: rule.md, proposal.md, backlog.md, designdraft.md,
│                   # structure.md, api-convention.md, api-contract.md, backend-mvp.md
└── Demo/           # the demos
    ├── index.html               # offline Web NFC pay-per-play timer
    ├── style.css                # mobile-first styling
    ├── app.js                   # Web NFC read/write + check-in/out logic (index.html)
    ├── group-demo.html          # one-shared-reader group flow, wired to backend/ by default
    ├── sync.js                  # REST + WebSocket backend, plus the optional Firestore layer
    ├── backend-config.example.js # copy to backend-config.js to point at another backend
    ├── firebase-config.example.js # optional real Firestore project config
    └── README.md                # this file
```
