# Role statement — Gritthaphat Intaraprasit (6631503001)

**Role:** backend and integration owner; repository conventions; test automation.

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

`⟨fill: which tools, for which parts, and what you personally verified — e.g. "Claude/Codex drafted handlers
and docs; I reviewed, ran and deployed every change; the pricing rule, the hash function and the audit-log
behaviour are my decisions, and I re-derived each one against the code before submission."⟩`

## Statement (≈200 words)

`⟨write your own — what you owned, one decision you are proud of and one you got wrong, what you would do
differently if you rebuilt it. Suggested angles that only you can answer: why the pricing rule moved to
whole-hour blocks with a ฿150 cap; why the keyed pepper was removed; what it cost to keep docs and code in
step.⟩`

## Reflection

`⟨due Sunday 22 Nov, 23:59 — three answers in your own words: (1) how building with AI changed the software
engineering work, one thing better and one worse, from this project; (2) where you stand in the industry
today; (3) next year and where you will be in five.⟩`
