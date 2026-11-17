# Case study — NFC check-in / check-out for a board game café

Bue Banana (board game café) · team of five · Software Engineering case study, 2026.

**Live system:** API — https://buebanana.onrender.com/health (responds `200`, verified 2026-11-17).
**Interactive app:** `⟨fill: public URL for the staff console / demo page — nothing is hosted yet; see "Open
issues" below⟩`.

---

## 1. Problem

A board game café charges per hour of table time. Today the counter does it by hand: a staff member writes
the start time on a paper sheet, watches the clock, totals the bill when the customer leaves, and writes it
down again. Three pains come out of that, and they are the ones the backlog is built on
(`docs/planning/backlog.md`):

1. **The counter is the bottleneck.** Every check-in and check-out needs a staff member. At peak, a queue
   forms at the door and the same person who should be helping customers choose a game is doing
   arithmetic.
2. **The numbers are typed by a human, twice.** Start time, end time and total are all hand-recorded, so a
   wrong bill is a matter of when, not whether — and nothing in the process leaves an audit trail that
   would settle a dispute.
3. **Customers have no view of their own session.** Nothing on the table tells them how long they have
   been playing or what they owe until they ask.

The third one was not in the original brief. It came out of the evaluation: three of seventeen surveyed
customers raised it unprompted ("ไม่สามารถดูระยะเวลาที่เข้าใช้งานได้ด้วยตัวเอง", "ไม่รู้เล่นไปนานแค่ไหน",
"อยากเห็นเวลาของตัวเอง"). It is recorded as a gap in `test/no-real-user-test.md`, not as something the
system already solves.

## 2. Process

**Discover.** Proposal with target users and pain traceability (`docs/planning/proposal.md`); product
backlog with 15 requirements `PB-01…PB-15` and acceptance criteria per requirement
(`docs/planning/backlog.md`); obligations from PDPA, the Computer Crime Act §26 and the Electronic
Transactions Act §9 mapped to features (`docs/compliance/rule.md`).

**Build.** Four parts, one contract:

| Part | What it is | Where |
|---|---|---|
| Reader | ESP32 CYD-2432S028 with a PN532 over I²C, shows the tap result on a 240×320 screen | `hardware/cyd-reader/` |
| Backend | Bun + ElysiaJS, REST + two WebSocket channels, Supabase Postgres in Singapore | `backend/` |
| Staff console | Next.js floor view — active groups, members, live scanning indicator, check-out | `frontend/` |
| Demo page | Self-contained Web NFC page that runs the same group flow against the API | `Demo/` |

Decisions that shaped the build, all recorded where they can be re-read:

- **One shared reader at the counter**, not one per table. A tap either opens a group, joins the group
  whose 30-second window is still open, or reopens an existing roster (`docs/design/designdraft.md` §2).
  A second tap inside 2 seconds returns the previous result instead of creating a second session.
- **Money is computed server-side only**, as `min(ceil(hours) × ฿30, ฿150)` — whole-hour blocks, no entry
  fee, ฿150 is the ceiling at hour 5 (`backend/src/domain.ts`). The staff console shows the server's figure
  and posts it back; if the amount ticks over in between, the backend answers `BILL_AMOUNT_MISMATCH` with
  the correct amount instead of accepting a stale one.
- **The NFC UID is never stored raw.** Only a plain SHA-256 hash of the normalised UID is kept, and the raw
  UID never appears in a response or a log. An earlier keyed-pepper design was removed because it caused a
  hashing defect; the residual risk (a leaked tag table could be reversed to a physical card) is accepted
  and written down as risk R11 in `docs/testing/test-plan.docx`.
- **Checkout requires an explicit confirmation** (`customerConfirmed: true`), because under the ETA the
  confirmation is the signature. The audit log is append-only and logs its own access.

**Test.** 41 cases traced to requirement ids (`docs/test-log/test-cases.csv`), 20 automated tests over both
the in-memory store and Supabase (`backend/src/app.test.ts`), a Thai questionnaire with consent, SUS and
UTAUT2 items (`docs/testing/uat-questionnaire-th.md`), and a 17-response survey of café customers.

**Deliver.** This folder.

## 3. Outcome

| Question | Answer | Evidence |
|---|---|---|
| Does the system do what the backlog says? | 41/41 cases pass across flows F1–F11 | `docs/test-log/test-cases.csv` |
| Does the code hold up? | `bun test` → **20 pass, 0 fail, 105 assertions** (1.0 s) | `backend/src/app.test.ts` |
| Is the money arithmetic right? | All five billing checkpoints match `min(ceil(hours) × ฿30, ฿150)` | automated test + `backend/src/domain.ts` |
| Is it deployed? | API live on Render, `/health` → 200 | https://buebanana.onrender.com/health |
| Do customers find it usable? | **72.4** on a 10-item SUS-adapted scale (n=17, SD 8.1, 10/17 at or above the 68 benchmark) | `docs/form-responses-raw.csv`, `docs/test-log/test-session-log.csv` |
| Has a real customer checked in unaided? | **No.** No observed UAT session ran; the evidence is a survey, not sessions | `test/no-real-user-test.md` |
| Are the documents still true? | **11/11** claims verified against code and data (was 9/11 before the log rebuild) | `.docs/final/ai/claims-check.log` |

**What the evaluation actually changed.** The survey's dominant theme was not speed but onboarding: seven
of seventeen answers asked for clearer steps ("ไม่รู้ขั้นตอน 1 2 3", "มีจุดสแกนเช็คอินเช็คเอ้าท์ชัดเจน").
Two mentioned a perceived freeze ("รอโหลดนานจนนึกว่าระบบค้าง"), which matches the cold-start behaviour of a
free-tier host rather than the request path. Both are recorded against `PB-06` and `PB-05` rather than
being quietly dropped, because the honest reading of n=17 is "signal", not "proof".

## 4. Open issues, stated plainly

1. **No public URL for the app.** The API is deployed; the staff console and the demo page are not
   (`firebase.json` has no `hosting` block). `⟨fill⟩` above stays a blank until one is deployed.
2. **No real-user session data.** Task success, time-on-task and billing accuracy have not been observed
   with a customer. The substitute, its limits and a ready-to-run protocol are in
   `test/no-real-user-test.md`.
3. **The instrument drifted.** The shipped form asked 15 items, not the 38 the plan specifies, so the
   72.4 is a SUS-adapted score and four UTAUT2 constructs were never measured.
4. **Table identity is not in the data model.** `PB-14` asks the staff view to highlight "the right table";
   the system identifies groups and tags, not tables. Recorded as risk R8 in the test plan, tested as
   built, not failed for a requirement that was never modelled.
