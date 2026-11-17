# Test artifacts — how to use these files

Companion to `docs/testing/test-plan.docx` (UTAUT2). Three spreadsheets, the raw form export they are built
from, and one printable form.

| File | What it is | Who fills it | When |
|---|---|---|---|
| `test-cases.csv` | 41 test cases (15 check-in, 16 check-out, 10 cross-cutting) | Test lead writes; tester sets `Result` | Phase 1; a subset re-run in Phase 2 |
| `test-session-log.csv` | one row per session — timings, assists, bill match, SUS, UTAUT2. **Generated** from the form export by `scores.py`; do not hand-edit the Phase 2 rows | Note-taker fills the observation columns after a real session; `scores.py` fills the survey rows | during/after each session, same day |
| `../form-responses-raw.csv` | the Google Form export, 17 responses, one row per respondent, exactly as downloaded | nobody edits it | after the last response |
| `scores.py` | rebuilds `test-session-log.csv` from the export, assigns `U01…U17`, computes the score columns, asserts every row is complete | run it, do not retype its output | after each export |
| `defect-log.csv` | one row per defect, linked to `TC_ID` | Note-taker → test lead triages | as soon as found |
| `uat-questionnaire-th.md` | consent, SUS, UTAUT2, scenario cards, Google Form build list | printed | Phase 2 |

Open the CSVs in Excel (UTF-8 with BOM, so Thai text renders) or Google Sheets. Do not rename the
header cells — `test-session-log.csv` has formulas that reference them, and the plan's §5.1 refers to
the column names.

## `test-cases.csv` columns

| Column | Fill with |
|---|---|
| `TC_ID` | do not change — defects and the traceability matrix reference it |
| `Phase` | `1` = internal/staff only, `1,2` = also run with customers |
| `Flow` / `Requirement` | flow id from plan §1.2; PB ids from `docs/planning/backlog.md` |
| `Preconditions` | system state before step 1 — this is what makes a defect reproducible |
| `Steps` | numbered, one action each, no "verify it works" |
| `Test_data` | the concrete card id, amount, elapsed time |
| `Expected_result` | observable and checkable (screen text, stored value, HTTP status) |
| `Result` | `PASS` / `FAIL` / `BLOCKED` / `NOT RUN`; on FAIL add `DF-###` |

## `test-session-log.csv` — 66 columns

| Block | Columns | Notes |
|---|---|---|
| Identity | `phase`, `participant_id`, `session_date`, `scenario` | rows `BASE-01…03` = manual baseline, `ST-01…03` = Phase 1 staff, `U01…U17` = survey respondents (`U` codes are assigned by `scores.py`; the code a respondent typed is kept in `notes_verbatim`) |
| UTAUT2 moderators | `age_band`, `gender`, `experience_first_time_1_0` | copy from the Google Form (Section A) |
| Observation | `facilitator`, `note_taker`, `task_success_1_0`, `checkin_time_s`, `checkout_time_s`, `staff_assists`, `errors_seen`, `bill_expected_thb`, `bill_shown_thb`, `bill_match_1_0` | stopwatch numbers in seconds; THB with two decimals |
| SUS | `SUS_01 … SUS_10` | 1–5, as answered |
| UTAUT2 | `PE1–PE4`, `EE1–EE4`, `SI1–SI3`, `FC1–FC4`, `HM1–HM3`, `PV1–PV3`, `HT1–HT4`, `BI1–BI3` (28 items) | 1–5, as answered |
| Computed | `SUS_score_calc`, `PE_mean … BI_mean` | **values, not formulas** — written by `scores.py`. A formula in a `.csv` is inert text, and one missing item silently blanks a live `COUNT`-guarded score, which is how the first transcription produced 0 scores from 17 full rows |
| Notes | `TC_IDs_touched`, `notes_verbatim` | quotes tagged with the participant code |

Regenerate the file with `python docs/test-log/scores.py` after each new export instead of editing it by
hand: the script maps every item by column name, asserts that each row is the right width and that all ten
items copied correctly, then writes the scores. Hand-transcription is what shifted one cell the first time
and put Q06–Q10 into the effort/construct columns.

Aggregates to compute after collection: mean/SD of `SUS_score_calc`; mean/SD of each construct mean;
Cronbach's α per construct; median and range of `checkin_time_s` / `checkout_time_s`;
`SUM(task_success_1_0)`; `AVERAGE(staff_assists)`; count of `bill_match_1_0 = 0` (must be zero).

## `defect-log.csv` — 0 rows, and what that means

The log is header-only. The team reports the internal case run found no defects, so there is nothing to
write; if a defect is ever found, its row goes here with severity `S1…S4`, the `TC_ID`, the fix commit and
the retest date. Do not fill the log with example rows to make it look used — an empty log plus the statement
"none found" is checkable, an invented one is not.

Row shape, for reference only — not part of the log:

```
DF-001 | 2026-11-03 | 2 | note-taker | TC-CI-03 | P04 | check-in | S2 | H
Third member could not join an existing group after the 30 s window; reader silently created a new group
Steps: two tags tapped 40 s apart, third tag tapped 6 min later -> reader shows new-group screen
Expected: reader tells the customer they were NOT added, or staff can move them into the table group
Actual: silent new group; member billed separately from friends
Environment: ESP32 reader fw <ver>, staging backend, cafe wifi
Status: New | assigned: <dev> | fix: - | retest: - | result: -
```

Severity/priority definitions and the lifecycle are in plan §9. A defect is closed only when the same
`TC_ID` passes on the fixed build.

## Rules of thumb

1. Fill the log **within 24 hours** of the session; recall decays faster than you expect.
2. Never edit a `PASS` row back to blank — if a retest fails, note the new defect id in `Notes`.
3. Photos of receipts go in `docs/test-log/evidence/<participant_id>/`, named after the `TC_ID`.
4. No real customer name, phone number, email, or raw NFC UID in any of these files (PDPA — see
   `rule.md`).
5. A response completed in under 2 minutes is a straight-lining signature — check it before you
   include it (§10 R10 in the plan).
