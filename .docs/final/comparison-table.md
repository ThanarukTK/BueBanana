# Before / after

Every row names what measured it and where the evidence lives. A row whose measurement does not exist keeps
`⟨fill⟩`, and the one pair of figures the team supplied from experience is marked **ESTIMATE** — nothing here
is presented as a measurement it is not.

| # | Item | Before | After | Change | Measured with | Evidence |
|---|---|---|---|---|---|---|
| 1 | Who records a session | Staff writes name + start time on a paper sheet | Session created by the tap itself, timestamp = server time ±2 s | Staff removed from the loop | Test cases TC-CI-01/04/06/08/11 + automated test | `docs/test-log/test-cases.csv`, `backend/src/app.test.ts` |
| 2 | Check-in time (customer tap → confirmation on screen) | 180 s — **ESTIMATE**, team's figure for the counter process | 30 s — **ESTIMATE**, team's figure for the tap | ≈ −150 s (≈ −83 %) | Stopwatch on 3 observations (plan M2) — not taken; both figures are the team's estimates | no measured seconds: `checkin_time_s` in `docs/test-log/test-session-log.csv` is empty |
| 3 | Check-out time (request → amount shown) | `⟨fill⟩ s` | `⟨fill⟩ s` | `⟨fill⟩` | Stopwatch, plan metric M2 | column `checkout_time_s` — empty; the 180 s / 30 s pair above covers check-in only |
| 4 | Bill arithmetic | Staff totals by hand, twice | Server computes `min(ceil(hours) × ฿30, ฿150)`; 5/5 boundary checkpoints match | Hand arithmetic → single server rule | Automated tests + TC-CO-05 | `backend/src/domain.ts`, `backend/src/app.test.ts` |
| 5 | Wrong / disputed bill | No record of what was agreed | Confirmation required before checkout; every change writes an append-only audit entry | Dispute becomes auditable | TC-CO-03, TC-CO-04, TC-CO-13, TC-X-01…03 | `docs/test-log/test-cases.csv`, `docs/compliance/rule.md` |
| 6 | Group handling | Staff decides and writes | 30 s join window (TC-CI-02/03), per-member checkout (TC-CO-01/08), whole-group checkout (TC-CO-02) | Rule moved from staff judgement to code | 41-case internal run | `docs/test-log/test-cases.csv` |
| 7 | Test cases documented | 0 | 41 cases, each traced to a PB id | +41 | `csv.DictReader` row count | `docs/test-log/test-cases.csv` (plan §13 matrix) |
| 8 | Automated tests | 0 | 20 tests, 105 assertions, both stores | +20 | `cd backend && bun test` → `20 pass, 0 fail` | suite output, `.docs/final/case-study.md` §3 |
| 9 | Customer-visible usability | Never measured | **72.4** mean on a 10-item SUS-adapted scale (benchmark 68) | Baseline → 72.4 | n=17 survey, items scored in Python | `docs/form-responses-raw.csv` → `docs/test-log/test-session-log.csv`, rebuilt by `docs/test-log/scores.py` |
| 10 | Item-level weak points | Unknown | Q02 2.94 (complexity), Q07 3.12 (learning), Q04 3.47 (needs a technical person), Q12 3.76 (knows enough) | Named, not guessed | per-item means | `python docs/test-log/scores.py` output |
| 11 | UTAUT2 constructs | Not measured | EE 4.24 (1 item), FC 4.12 (2), PV 4.41 (1), BI 4.29 (1); PE/SI/HM/HT not asked | Partial, and labelled partial | construct means | same script; `test/no-real-user-test.md` §2 |
| 12 | Participant records | 15 placeholder rows, 0 measurements | 17 rows, unique `U01…U17`, complete 10-item block in 17/17 | 0 → 17 scoreable rows | coverage assertion in the rebuild script | `docs/test-log/scores.py` |
| 13 | Document claims that match the build | 9/11 verified | **11/11 verified** | +2 claims | fixed check set, run against code and data | `.docs/final/ai/claims-check.py`, log in `.docs/final/ai/claims-check.log` |
| 14 | AI assistance (the AI row) | Docs and code written with no check against the artefact — two claims were stale (session log yield, participant ids) | Same AI-assisted workflow plus a 11-item mechanical claim check in CI-shaped script form, run on every change | Error rate measured: 2/11 → 0/11 | `claims-check.py --session-log HEAD` vs working tree | `.docs/final/ai/claims-check.log` (baseline block vs after block) |
| 15 | Defects recorded | 0 rows in the defect log | 0 rows | none — the team reports the internal run found no defects | row count of `docs/test-log/defect-log.csv` | still header-only; the "none found" statement is recorded in `docs/test-log/test-artifacts-readme.md` and `test/no-real-user-test.md` §4 |

**ESTIMATE** marks the team's own figures, not stopwatch observations: 180 s for the counter process and 30 s
for the tap were stated by the team on 2026-11-17, and no session record backs them. If three observations are
timed before submission, replace the two cells and drop the word ESTIMATE; until then the honest reading is
"the team believes check-in drops from about three minutes to about half a minute".

## How to reproduce

```bash
cd backend && bun test                                  # 20 pass, 0 fail
python docs/test-log/scores.py                          # rebuilds the session log, prints the score table
python .docs/final/ai/claims-check.py                   # 11/11 claims verified
python .docs/final/ai/claims-check.py --session-log HEAD # the 9/11 baseline, from the committed log
```
