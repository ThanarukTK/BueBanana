# Role statement — Gritthaphat Intaraprasit (6631503001)

**Role:** backend and integration owner; repository conventions; test automation; **developer / fix owner**
in the test plan (§7).

## What I owned

The ElysiaJS backend end to end — REST endpoints, the two WebSocket channels, both stores (in-memory and
Supabase Postgres), the pricing/join/dedupe/hash rules in `backend/src/domain.ts` — plus the automated test
suite (`backend/src/app.test.ts`, 20 tests), the API contract and conventions under
`docs/backend-convention/`, the shared context file `AGENTS.md`, the Web NFC demo page, and this final
document set including the session-log rebuild (`docs/test-log/scores.py`) and the claim check
(`.docs/final/ai/claims-check.py`).

**Evidence of my work**

- `git log --author=koonnuthhh` — 45 commits, 117 files touched
- `backend/src/app.ts`, `backend/src/domain.ts`, `backend/src/repository.ts`, `backend/src/realtime.ts`
- `backend/src/app.test.ts` — `bun test` → 20 pass, 0 fail, 105 assertions
- `docs/backend-convention/api-contract.md`, `docs/backend-convention/deploy-backend.md`
- `docs/test-log/scores.py`, `.docs/final/ai/claims-check.py` and their outputs

## AI disclosure

`Use AI for coding and filling repetitive jobs — boilerplate handlers, doc scaffolding, and the
mechanical parts of the test artefacts. Every change was reviewed and run locally before it was committed;
the pricing rule, the hash function, the audit-log behaviour and the claim-check results were each
re-derived against the code, not taken from the assistant's summary.`

## Statement (≈200 words)

I built the backend: the Elysia app and its routes, the two WebSocket channels (reader and staff), both
stores — in-memory for tests, Supabase Postgres in production — and the rule that turns a session into a bill,
`min(ceil(hours) × ฿30, ฿150)`. I wrote the API contract and conventions under `docs/backend-convention/`, the
twenty automated tests that hold that rule in place, the shared context file every assistant in the repo reads,
and the Web NFC demo page.

My main decision was that money is computed only on the server. The staff console displays the figure it was
given and posts that figure back; if time has moved the amount in between, the backend refuses it with
`BILL_AMOUNT_MISMATCH` and answers with the correct number. It cost an extra round trip and a stale-amount
error path to handle, and it means no one can invent an amount in a browser.

What I would do differently: the script that rebuilds the session log from the survey export should have
existed before the data arrived, not after. A shifted cell had blanked every score while the file still looked
full, which is exactly the kind of failure a document cannot show you.

Evidence: `backend/src/app.ts`, `backend/src/domain.ts`, `backend/src/app.test.ts` (20 tests),
`docs/test-log/scores.py`.

## Reflection

### 1. Lessons learned — what AI did to the software engineering

**One thing that got better: the design loop.** The billing rule changed twice late in the project — an entry
fee was dropped, whole-hour blocks with a ฿150 cap replaced it — and because the rule sits in one function and
twenty tests assert its boundaries, I could re-derive it and know within a second whether every checkpoint still
held. Requirements stopped being a document that arrives once. I could ask for a behaviour, see it, and assert
it in the same sitting, which is the closest I have come to testing driving the design instead of trailing it.

**One thing that got worse: the trustworthiness of the written record.** Prose became cheap to produce, so it
was produced faster than it was checked. Two documents were confidently wrong while looking complete: a session
log with seventeen filled rows that yielded no score at all, and participant ids that looked like codes but were
not unique. Neither is a coding failure; both are failures of the record the project is graded on. The fix was
mechanical — a script that compares thirteen claims in the documents against the code and the data — and the
lesson is that anything generated quickly needs a check that is faster than reading it.


### 2. Where I stand in the software industry today

`⟨fill: 80-100 words in your own words — see the three angles in the chat, or write your own⟩`

### 3. My plan — next year, and five years out

`⟨fill: 80-100 words in your own words⟩`
