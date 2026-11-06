# Documentation — BueBanana
Board Game Café Check-In & Check-Out System (NFC reader → ElysiaJS + Supabase → staff console).
Every document lives in one category folder; nothing sits loose at the root of `docs/` except this
index.

```
docs/
├── planning/              what the project promises
│   ├── proposal.md            the case-study proposal
│   └── backlog.md             PB-01…PB-15 — the requirement ids every test case traces to
├── design/                how it is put together
│   ├── designdraft.md         flows, screens, data model
│   └── structure.md           repository and module layout
├── compliance/            the rules the system is held to
│   └── rule.md                PDPA / CCA §26 / ETA §9 obligations mapped to features
├── backend-convention/    the API contract and the backend's own documentation
│   ├── api-contract.md        endpoints, screens, events (§3.2 / §4.2), firmware compatibility
│   ├── api-convention.md      request/response shapes, error codes, money in satang
│   ├── backend-mvp.md         stores, environment, compliance boundary, how to run it
│   ├── supabase-migration-plan.md  schema, integrity guards, verification results (historical)
│   └── deploy-backend.md      Render / Fly.io deployment steps
├── testing/               the test plan and the instruments
│   ├── test-plan.docx         methods, levels, metrics, schedule, traceability
│   ├── uat-questionnaire-th.md    consent, SUS, UTAUT2, scenario cards (source)
│   └── uat-questionnaire-th.docx  printable copy of the same
└── test-log/              the evidence you fill in while testing
    ├── test-artifacts-readme.md   how to use the three logs below
    ├── test-cases.csv             41 cases, result column
    ├── test-session-log.csv       one row per session, timing + SUS + UTAUT2
    ├── defect-log.csv             one row per defect, linked by TC_ID
    └── evidence/                  receipts, screenshots, defect reproductions
```

## Reading order

1. `planning/backlog.md` — what was promised.
2. `design/` + `compliance/` — how it is built and which obligations bind it.
3. `backend-convention/api-contract.md` — the interface as implemented.
4. `testing/test-plan.docx` — how it is verified and with whom.
5. `test-log/` — what actually happened.

## Conventions

- **References are repo-relative**, always `docs/<category>/<file>`, never a bare filename — code
  comments, the plan's "Related documents" row and every log header use the same form.
- **The test plan's version lives in its page header** ("Document version: 1.3"), not in the filename,
  so `docs/testing/test-plan.docx` stays the one file to submit.
- **`test-plan.docx` is generated from the team's reviewed text**; the questionnaire `.md` is the
  source of truth for the `.docx` beside it.
- **`test-log/` is data, not prose.** Do not rename its header cells — the session log's SUS and
  construct means are live formulas keyed on column names, and the plan cites those names.
- **`backend-convention/supabase-migration-plan.md` is a decision record.** Its verification tables
  describe what was true when the migration was checked; later changes (hourly billing, plain
  SHA-256 uid hash) are noted inline rather than rewritten.
