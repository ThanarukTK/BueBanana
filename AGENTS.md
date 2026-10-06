# AGENTS.md — Primary Shared Context

This file is the **single source of truth** for every AI assistant working in this repository
(GitHub Copilot, Claude, Cursor, Codex, Gemini, etc.).

**Read this file first, then follow the required reading list in §1.**
If any other instruction or context file conflicts with this one, **this file wins**.
Tool-specific pointer files (e.g. `claude.md`, `.cursorrules`, `.github/copilot-instructions.md`)
must only redirect here — never duplicate or override the context.

## 1. Required reading order

| # | File | Why it matters |
|---|------|----------------|
| 1 | `AGENTS.md` (this file) | Repo-wide context, conventions, guardrails |
| 2 | [`docs/rule.md`](./docs/rule.md) | **Mandatory legal context** — PDPA, Computer Crime Act §26, Electronic Transactions Act. Binding constraints on any feature touching user data or user actions |
| 3 | [`docs/proposal.md`](./docs/proposal.md) | Problem statement, target users, objectives, user-pain traceability |
| 4 | [`docs/backlog.md`](./docs/backlog.md) | User stories `PB-01`…`PB-15` with acceptance criteria and priority |
| 5 | [`docs/designdraft.md`](./docs/designdraft.md) | Feature list, user journey, prototype link, use-case / activity / sequence / class diagrams |
| 6 | [`docs/structure.md`](./docs/structure.md) | Target system architecture (Frontend / Backend / Hardware / Database) |
| 7 | [`Demo/README.md`](./Demo/README.md) | The current Web NFC demo: features, requirements, how to run it |
| 8 | [`docs/backend-mvp.md`](./docs/backend-mvp.md) | The running ElysiaJS MVP: endpoints, WebSocket channels, storage modes, how the demo connects |
| 9 | [`docs/supabase-migration-plan.md`](./docs/supabase-migration-plan.md) | Database schema, integrity guards, the Supabase connection rules, and the verification results |

**Rule:** if a task touches check-in/check-out, sessions, billing, payments, user identity,
NFC tag identity, logging/audit, or staff actions, you **must read `docs/rule.md` before writing code**
and you **must** state in your summary which rules you applied.

## 2. Project in one paragraph

An **NFC-based self-service check-in / check-out system for a board game café**. Customers tap an
NFC tag on a reader instead of queueing for staff; the system starts/stops a session, records
timestamps, and calculates the bill. It also promotes 3D-printed board-game products. The goal is
fewer queues, less staff workload, and a more usable experience than the café's current website.

## 3. Current state vs. target state

**Implemented today — `Demo/` + `backend/`:**

- A static, **backend-less** Web NFC demo (the original pay-per-play timer) proved Web NFC works on a
  real phone; the group flow below replaced it. Its `Demo/index.html`, `Demo/style.css` and `Demo/app.js`
  are recoverable from git history.
- Web NFC (`navigator.nfc`) reads/writes an NDEF UUID to a tag; that demo's session totals lived in
  `localStorage`, with a demo rate of **฿30/hour, billed per minute**. There was no persistence beyond
  the phone.
- Requires **Android + Chrome** and a **secure context** (HTTPS or `localhost`). Not supported on iOS.
- A **group-flow demo** (`Demo/index.html` — the only demo) that drives the ElysiaJS backend
  (`backend/src`) over REST + WebSocket: a tap resolves to `waiting` / `joined` / `group`, staff check
  out one member or the whole group, bills are priced server-side, and every state change is audited.
  Run instructions and channel details: [`docs/backend-mvp.md`](./docs/backend-mvp.md).
- The backend runs on either an **in-memory store** (`STORE=memory`, the default, so `bun test` and
  `bun run dev:local` need no credentials) or **Postgres** (`STORE=postgres` — Supabase; `bun run
  migrate` applies `backend/migrations/`). The HTTP contract is identical either way, and deployment is
  covered in [`docs/deploy-backend.md`](./docs/deploy-backend.md).

**Target architecture:**

| Part | Technology | Status |
|------|-----------|--------|
| Frontend | Next.js web app (customer + staff UI) | Not built — `Demo/` is the prototype UI |
| Backend | ElysiaJS API server | **MVP in `backend/`** (REST + `/ws/reader` + `/ws/admin`) |
| Hardware | ESP32 + NFC reader + screen (Arduino C++ firmware) | Not built — the demo simulates the reader |
| Database | Supabase (PostgreSQL), reachable **only** through the backend | **Postgres repository built and verified**; `MemoryStore` stays the default so no credentials are needed to run or test |

Storage is one env var (`STORE=memory|postgres`) behind `backend/src/repository.ts`: the schema, migrations
and the Postgres store are in place and verified against PostgreSQL 16, and Supabase is a connection
string plus `bun run migrate` away. See [`docs/backend-mvp.md`](./docs/backend-mvp.md) and
[`docs/supabase-migration-plan.md`](./docs/supabase-migration-plan.md).

Data flow: NFC tag tap → ESP32 → ElysiaJS API → Supabase → status returned to ESP32 screen and Next.js UI.

## 4. Repository layout

```
NFC_boardgame_reader/
├── AGENTS.md          # this file — primary shared context
├── claude.md          # pointer for Claude-family tools → AGENTS.md
├── backend/           # ElysiaJS API MVP (Bun)
│   ├── src/app.ts     #   routes + /ws/reader + /ws/admin, auth, CORS (dev)
│   ├── src/domain.ts  #   pricing, group projection, UID hashing
│   ├── src/realtime.ts#   WebSocket topics + event payloads (§3.2 / §4.2)
│   ├── src/config.ts  #   environment → Config (STORE, DATABASE_URL, TAG_UID_PEPPER, keys)
│   ├── src/repository.ts# repository seam: memory | postgres behind one transaction API
│   ├── src/stores/    #   memory-store.ts (default) | postgres-store.ts
│   ├── src/db/        #   migrate.ts, connect.ts, retention.ts
│   ├── src/server.ts  #   entry point (dev and container)
│   ├── src/app.test.ts#   contract + socket tests (`bun test`)
│   └── migrations/    #   0001_init.sql — schema, constraints, append-only audit trigger
├── Demo/              # working proof-of-concept demo (this folder is what you deploy)
│   ├── index.html     # one-shared-reader group flow, wired to backend/ by default
│   ├── sync.js        # backend facade: REST + WebSocket, optional Firestore layer
│   ├── backend-config.example.js # copy to backend-config.js (gitignored)
│   └── README.md      # the demo (features, setup, deploy + usage)
└── docs/              # single source of truth for all project docs + diagrams
    ├── rule.md        # legal / compliance rules (PDPA, CCA §26, ETA) — MANDATORY
    ├── proposal.md    # problem, users, objectives
    ├── backlog.md     # user stories PB-01…PB-15 + acceptance criteria
    ├── designdraft.md # features, journey, prototype link, diagrams (inline Mermaid, no image files)
    ├── structure.md   # target architecture
    ├── api-convention.md # backend API conventions (endpoints, envelope, auth, compliance rules)
    ├── api-contract.md # concrete wire contract for frontend/backend/hardware communication
    ├── backend-mvp.md # what the running MVP implements + how to run/demo it
    └── README.md      # one-line repo placeholder (not the demo's README)
```

> Note: `rule.md`, `proposal.md`, `backlog.md`, and `designdraft.md` live **only** in `docs/` — there
> is no root-level duplicate. Do not recreate copies at the repo root. `Demo/README.md` is separate
> and describes the Web NFC demo specifically.

## 5. Conventions

- **Language:** documentation is written in English; keep it that way unless told otherwise.
- **IDs are stable:** reference requirements as `PB-01`…`PB-10` and user pains as `Pain 1`…`Pain 3`.
  Never renumber or reuse an existing ID.
- **Traceability:** every change should name the backlog item(s) it serves, the user pain it
  addresses, and the `rule.md` rules it complies with.
- **Docs before code:** if a feature is not in `backlog.md` / `designdraft.md`, say so instead of
  silently inventing scope.
- **Demo code is a demo:** `Demo/` is a disposable proof of concept in plain HTML/CSS/JS.
  Do not grow it into the production system — production code goes in the target stack (§3).
- **No new frameworks in the demo:** the demo must keep working by opening it over HTTPS/localhost
  with no build step and no dependencies.
- **The demo's backend is configuration, not code:** `Demo/backend-config.js` (gitignored, copy of the
  `.example`) selects `rest` — the ElysiaJS API, the contract-faithful path — or `firestore`, the
  earlier demo plumbing. Nothing but `Demo/sync.js` talks to a backend, and the UI never prices a bill
  the backend has not reported.
- **No secrets in the repo:** never commit API keys, Supabase service keys, or credentials. The backend
  reads `STORE`, `DATABASE_URL` and `TAG_UID_PEPPER` from `backend/.env` (gitignored; `.env.example` is
  committed with placeholders). On this team repo **every teammate provisions their own `.env`** — a
  connection string or service key must not travel through the repo, an issue tracker, or a chat window.
  The frontend and the ESP32 never receive database credentials: the backend is the only client.

## 6. Mandatory compliance context (`rule.md`)

Three Thai laws constrain the design. Summarised — **`rule.md` is authoritative and must be read in full**:

- **PDPA** — an NFC identifier linked to a person **is personal data**. Requires a privacy notice
  before collection, separate unticked consent, purpose limitation and data minimisation, a random
  internal identifier instead of unnecessary data written on the tag, access/correct/delete rights,
  encryption in transit and at rest, role-based least-privilege staff access, and no personal data
  or credentials in logs. Use synthetic or anonymised data for tests.
- **Computer Crime Act §26** — keep access/traffic logs linkable to a real registered user for
  **≥ 90 days** (longer if lawfully ordered), with accurate timestamps, integrity protection, and an
  audit trail for anyone who views, exports, or deletes logs.
- **Electronic Transactions Act §9 / §26 / §28** — a recorded "I agree" / bill confirmation must
  identify the signer, show intent, and be retrievable as evidence: capture user, terms/bill version,
  amount, date, time, and result. Use a clear affirmative action (never a pre-ticked box), preserve
  the original when a confirmed bill is changed, and do not claim to be a Certification Authority.

Also note: `rule.md` §"Computer Crime Act" requires that **log retention, access control, integrity,
deletion, and retrieval remain explicit non-functional requirements in the product backlog**. If you
change `backlog.md`, keep those visible.

## 7. Guardrails

- Do not weaken or skip a `rule.md` requirement to make a task easier; flag the conflict instead.
- Do not store raw NFC payloads, secrets, or unnecessary personal data in `localStorage`,
  application logs, or source code.
- Do not invent legal conclusions, compliance certifications, or university deliverable claims.
- Never rewrite or delete existing documentation wholesale — make targeted edits and keep the
  traceability tables intact.
- If something is ambiguous, ask before implementing.

## 8. Git commit convention

Every commit must follow **Conventional Commits** so history stays consistent and greppable.

**Format:** `type(scope): subject`

**Types** (pick one):
- `feat` — new user-facing feature
- `fix` — bug fix
- `refactor` — behavior-preserving code change (renames, restructuring, cleanup)
- `style` — formatting / CSS-only changes that don't affect logic
- `docs` — documentation only (`*.md`)
- `test` — adding/fixing tests
- `perf` — performance improvement
- `chore` — tooling, deps, build config
- `build` — build system changes
- `ci` — CI config changes
- `revert` — reverts a previous commit

**Scope** (optional, use the app or area): `student`, `teacher`, `data` (firebase), `lesson-player`, `settings`, `course-detail`, `explore`, `dashboard`, etc.

**Subject rules:**
- Imperative mood ("Add …", "Fix …", "Remove …"), present tense.
- Lowercase, no trailing period, keep it under ~72 characters.
- Say *what* and *why*, not *how*.

**Body rules** (for anything non-trivial):
- Blank line after the subject, then short bullet points.
- Focus on *why* (motivation) and *what changed*; keep it concise.
- Breaking changes: add a `BREAKING CHANGE:` footer line.

**Workflow rules:**
- **One logical change per commit** — don't bundle unrelated fixes together.
- **Stage only the relevant files** (`git add <path>`). Leave unrelated local changes (e.g. `.gitignore`, `.env*`, editor files) out unless the commit is about them.
- **Never commit** secrets, `.env` files, `node_modules/`, `dist/`, or build artifacts.
- **Verify before committing** — run `npm run build` (and `npm run lint` on changed files) so the commit compiles.
- Match scope to the app: when only `student/` changes, use `student` scope; same for `teacher/`.

**Example:**

```
fix(student): align in-progress filter across dashboard and my course

- MyCourse now treats progress 0 as "in progress", matching the Dashboard
- Recent sort uses getLastInteractionMs instead of numeric doc id

Closes #42
```
