# Final deliverables — index

Repo check against the rubric, one link per item. Branch: **`main`** for everything listed here unless the
row says otherwise.

## 1. Discover

| Item | Where | State |
|---|---|---|
| Problem statement, target users, objectives | [`docs/planning/proposal.md`](../../docs/planning/proposal.md) | present |
| Requirements + product backlog (15 items, acceptance criteria, traceability) | [`docs/planning/backlog.md`](../../docs/planning/backlog.md) | present — priorities are High/Medium/Low, **MoSCoW relabelling not done** |
| PDPA / CCA §26 / ETA §9 obligations mapped to features | [`docs/compliance/rule.md`](../../docs/compliance/rule.md) | present |
| How the team uses AI | [`../../AGENTS.md`](../../AGENTS.md), [`../../claude.md`](../../claude.md), [`ai-logic.md`](ai-logic.md) | present (the AI-usage statement lives in `ai-logic.md` §2) |
| Company charter (members, roles, team rules) | — | **absent** — `⟨team to add⟩` |
| Real-user interviews ×5 or a SECONDARY review of the problem | — | **absent** — the survey in [`../../docs/form-responses-raw.csv`](../../docs/form-responses-raw.csv) is evaluation data, not discovery evidence; `⟨team to add, or write the SECONDARY review⟩` |
| Lean Canvas (optional) | — | not written |

## 2. Build

| Item | Where | State |
|---|---|---|
| Use case diagram | [`docs/design/designdraft.md`](../../docs/design/designdraft.md) §4.1 | present |
| Activity diagram | same file §4.2 | present |
| Sequence diagrams | same file §4.3 | present |
| Class diagram | same file §4.4 | present |
| Architecture (how the parts connect) | [`docs/design/structure.md`](../../docs/design/structure.md) | present |
| API contract and conventions | [`docs/backend-convention/api-contract.md`](../../docs/backend-convention/api-contract.md), [`api-convention.md`](../../docs/backend-convention/api-convention.md) | present |
| Source code | `backend/`, `frontend/`, `hardware/cyd-reader/`, `Demo/` | present |
| Our own tests | [`backend/src/app.test.ts`](../../backend/src/app.test.ts) — 20 tests, `bun test` → 20 pass, 0 fail | present |
| How to run the system | [`docs/backend-convention/backend-mvp.md`](../../docs/backend-convention/backend-mvp.md), [`frontend/README.md`](../../frontend/README.md), [`Demo/README.md`](../../Demo/README.md) | present, split across three files — **no root README** |
| `.env.example` | [`backend/.env.example`](../../backend/.env.example), [`frontend/.env.example`](../../frontend/.env.example) | present |
| Test account | [`frontend/.env.example`](../../frontend/.env.example) — username `admin`, password `STAFF_PASSWORD` in that file (dev value `1234`), role `admin`; the console verifies it itself because the backend has no staff-account API yet. **Change it before the console is hosted publicly, and keep `AUTO_LOGIN_STAFF=false`** | present |
| No secrets committed | verified: only `.env.example` in `git log --all`; working `.env` untracked | clean |

## 3. Test

| Item | Where | State |
|---|---|---|
| Test plan | [`docs/testing/test-plan.docx`](../../docs/testing/test-plan.docx) (v1.3, in the page header) | present |
| Case inventory (41 cases, traced to `PB-` ids) | [`docs/test-log/test-cases.csv`](../../docs/test-log/test-cases.csv) | present |
| Session log | [`docs/test-log/test-session-log.csv`](../../docs/test-log/test-session-log.csv) — 17 rows `U01…U17`, rebuilt from the form export | present; **questionnaire-only, no task/timing columns** |
| Rebuild + scoring script | [`docs/test-log/scores.py`](../../docs/test-log/scores.py) | present |
| SUS / TAM / UTAUT2 instrument | [`docs/testing/uat-questionnaire-th.md`](../../docs/testing/uat-questionnaire-th.md) / `.docx` | present |
| SUS / UTAUT2 responses | [`docs/form-responses-raw.csv`](../../docs/form-responses-raw.csv) — 17 responses | present |
| SUS results | [`test/no-real-user-test.md`](../../test/no-real-user-test.md) §2 — SUS-adapted mean 72.4 (n=17, SD 8.1) | present, labelled as adapted |
| UTAUT2 results | same §2 — EE 4.24, FC 4.12, PV 4.41, BI 4.29; PE/SI/HM/HT not asked | partial, labelled |
| Before / after numbers for MUST tasks | [`comparison-table.md`](comparison-table.md) rows 1–6 — functional verified; **timing rows blank** | partial |
| Issue log (severity, fix commit, retest) | [`docs/test-log/defect-log.csv`](../../docs/test-log/defect-log.csv) | **header only, 0 rows** |
| No-real-user-test record | [`test/no-real-user-test.md`](../../test/no-real-user-test.md) | present |

## 4. Deliver

| Item | Where |
|---|---|
| Case study — problem, process, outcome (+ live URL) | [`case-study.md`](case-study.md) |
| AI logic — where, how, prove, measure | [`ai-logic.md`](ai-logic.md) |
| Comparison table incl. the AI row | [`comparison-table.md`](comparison-table.md) |
| Role statements (5) | **not committed yet** — each member adds their own file under `.docs/final/role-statements/<studentID>-<name>.md`; the five evidence skeletons are held locally and are pushed once the member has written their own statement. Due with the Reflection (Sun 22 Nov, 23:59) |
| Reflection per member (due Sun 22 Nov) | the `## Reflection` section at the end of each role statement |

## 5. Supporting material

| Item | Where |
|---|---|
| Claim check — script and both runs | [`ai/claims-check.py`](ai/claims-check.py), [`ai/claims-check.log`](ai/claims-check.log) |
| Backend deployment notes | [`docs/backend-convention/deploy-backend.md`](../../docs/backend-convention/deploy-backend.md) |
| Supabase migration record | [`docs/backend-convention/supabase-migration-plan.md`](../../docs/backend-convention/supabase-migration-plan.md) |
| Test artefacts guide | [`docs/test-log/test-artifacts-readme.md`](../../docs/test-log/test-artifacts-readme.md) |
| Documents index | [`docs/README.md`](../../docs/README.md) |

## What is still open

1. **Live URL** — app https://buebanana-wqs1.onrender.com/ (200), API
   https://buebanana.onrender.com (`/health` 200, `/api/v1/groups` 401 without a token). Reset the demo data
   before the check: the floor view currently shows sessions opened on 8 and 13 Nov.
2. **Company charter** and **discovery evidence** (interviews or the SECONDARY review) — the two Discover
   rows above with no file behind them.
3. **MoSCoW** labelling of the backlog (15 requirements already exist).
4. **Real-user sessions** — the evidence path taken instead is `test/no-real-user-test.md`; task success,
   time-on-task and billing accuracy remain unmeasured.
5. **Defect log** — 0 rows. Either it is empty because the internal run found nothing (then say so in the
   file), or defects were found and not written up. Same for the `PASS` column across all 41 cases.
