# No real-user test — what we have instead

**Status:** the system has **not** been through a real-user (observed) UAT session. This document states
that plainly, records what *was* done instead, says what each substitute does and does not prove, and gives
a ready-to-run plan for running the real-user test.

Every number below is reproducible from a file in this repository. Where a measurement was never taken,
the cell says `⟨fill⟩` — nothing is estimated.

---

## 1. Why there is no real-user test

- No observed UAT session was recorded: `docs/test-log/test-session-log.csv` contains **17 rows, one per
  Google Form response**, and every one is marked
  `questionnaire-only; no task observation`. The task columns (`task_success_1_0`, `checkin_time_s`,
  `checkout_time_s`, `staff_assists`, `bill_expected_thb`, `bill_shown_thb`, `bill_match_1_0`) are
  **empty in 17/17 rows**.
- The questionnaire that was actually shipped asks **15 Likert items**, while the plan
  (`docs/testing/test-plan.docx` §4.3, §5.2) specifies 38 (SUS 10 + UTAUT2 28). The instrument therefore
  drifted: the responses measure a **10-item SUS-adapted usability scale** plus single items on
  effort expectancy, facilitating conditions, price value and behavioural intention — not validated SUS
  and not UTAUT2.
- Reason the sessions were not run: `⟨fill: one sentence — e.g. café availability / timing / recruitment shortfall⟩`.

**What this means for the plan's exit criteria (§2, Phase 2):** the requirement "≥15 participants completed
a session; task success ≥90%; billing accuracy 100%" is **not met by this data** — there is no session
record to compute those numbers from. The 17 responses satisfy the *sample size* of a survey, not the
session criterion.

## 2. What was tested instead

| # | Substitute | Label | Evidence | Scale |
|---|---|---|---|---|
| S-A | Automated component/API tests | **AUTOMATED** | `backend/src/app.test.ts`; `cd backend && bun test` → `20 pass, 0 fail, 105 expect() calls` (1.0 s) | 20 tests |
| S-B | Internal end-to-end case run, executed by the team and café staff | **PROXY** (team/staff, not customers) | `docs/test-log/test-cases.csv` — 41 cases, `Result = PASS` on every row; flows F1–F11 traced to PB-01…PB-15 | 41 cases |
| S-C | Heuristic review of the three interfaces (reader screen, staff console, demo page) against the case set and `docs/compliance/rule.md` | **HEURISTIC** | `docs/testing/test-plan.docx` §11 (compliance checks mapped to TC ids); `docs/design/designdraft.md` §2 (journeys) | 11 obligations |
| S-D | Questionnaire survey of café customers (consent recorded per response) | **SURVEY** (real respondents, no task observation) | `docs/form-responses-raw.csv` (17 responses) → `docs/test-log/test-session-log.csv` (U01…U17), rebuilt by `docs/test-log/scores.py` | n = 17 |

### S-D results (the only measured outcome)

10-item SUS-adapted scale, reverse-scored on items 2, 4 and 7 (the statements worded negatively):

| Metric | Value |
|---|---|
| Responses / complete rows | 17 / 17 |
| Mean | **72.4** (benchmark 68) |
| SD | 8.1 |
| Range | 60 – 90 |
| At or above 68 | 10 / 17 |

Per-item means (5-point): 01 4.18 · 02 2.94 · 03 4.35 · 04 3.47 · 05 4.29 · 06 4.41 · 07 3.12 · 08 4.59 ·
09 4.41 · 10 4.24 · 11 4.24 · 12 3.76 · 13 4.47 · 14 4.41 · 15 4.29.

Construct items actually present: EE 4.24 (1 item), FC 4.12 (2 items), PV 4.41 (1 item), BI 4.29 (1 item).
**PE, SI, HM and HT were never asked** and are reported as not measured.

### Qualitative themes (17 free-text answers, coded)

| Theme | Responses | Example (verbatim) | Requirement touched |
|---|---|---|---|
| Steps / guidance unclear — "tell me what to do next" | 7 | "ไม่รู้ขั้นตอน 1 2 3 ค่ะ" · "มีจุดสแกนเช็คอินเช็คเอ้าท์ชัดเจน" | PB-06, PB-01 |
| Cannot see my own elapsed time / whose card is whose | 3 | "ไม่สามารถดูระยะเวลาที่เข้าใช้งานได้ด้วยตัวเอง, ไม่รู้ว่าของใครเป็นของใคร" · "ไม่รู้เล่นไปนานแค่ไหน" | PB-04, PB-14 |
| Speed / perceived freeze | 2 | "รอโหลดนานจนนึกว่าระบบค้างในบางช่วง" · "ระบบอาจจะช้านิดนึง" | PB-05 |
| No problem reported | 4 | "ไม่มี" | — |
| Other / vague | 1 | "ระบบ" | — |

The elapsed-time theme is the most actionable finding: the staff console shows durations, the customer does
not. It is recorded as a backlog gap, not as a defect the system pretends to have fixed.

## 3. Before / after for the MUST tasks

"Before" is the café's current counter process (staff writes the session by hand and totals the bill);
"After" is the system as tested. Timing for both sides requires stopwatch observation, which has not been
done — those cells stay `⟨fill⟩` rather than being estimated.

| Requirement | Before (manual counter) | After (system, as tested) | Evidence | Verdict |
|---|---|---|---|---|
| PB-01 NFC check-in creates a session | Staff writes name + start time by hand · `⟨fill⟩ s` | Session created on tap, timestamp = server time ±2 s · `⟨fill⟩ s` | TC-CI-01, 04, 06, 08, 11 PASS; automated test "creates a session on a tap" | functional ✅ / timing `⟨fill⟩` |
| PB-02 NFC check-out closes a session | Staff totals on paper · `⟨fill⟩ s` | Check-out with staff confirmation; bill computed server-side | TC-CO-01, 02, 09, 10 PASS | functional ✅ / timing `⟨fill⟩` |
| PB-03 Timestamps recorded automatically | Written by hand, transcription error possible | Stored server-side, `checkInTime`/`checkOutTime` returned | TC-CI-01, TC-CO-12, TC-X-10 PASS | functional ✅ |
| PB-04 Staff can see active sessions | Paper sheet at the counter | Floor view lists active groups and members | TC-CI-15, TC-CO-15 PASS | functional ✅ |
| PB-05 Reliable in busy periods | Queue at the counter | 41 cases in one run, no S1/S2 open | TC-CI-05, TC-X-04, TC-X-05 PASS | functional ✅ / load `⟨fill⟩` |
| PB-11 Joining an existing group | Staff decides and writes | 30 s join window, roster shown | TC-CI-02, 03, 14 PASS | functional ✅ |
| PB-12 Individual check-out | Staff recalculates by hand | Per-member close, group stays open | TC-CO-01, 08 PASS | functional ✅ |
| PB-14 Staff view of the active group/scan | Staff watches the room | Live scanning indicator over WS | TC-CI-15, TC-CO-15 PASS (table identity: plan R8) | functional ✅ |

**Billing accuracy:** verified against the shipped rule in `backend/src/domain.ts`
(`min(ceil(hours) × ฿30, ฿150)`) at the plan's five checkpoints (0 min → ฿0.00; 10 s → ฿30.00;
60 min → ฿30.00; 60 min 1 s → ฿60.00; 240 min 1 s → ฿150.00) by automated test, not by a customer
receipt. No real-money check has been performed: `⟨fill: 3 receipts, if the team ran them⟩`.

## 4. What the substitutes do and do not prove

**Do prove:** the flows behave as the specification says (41 cases + 20 automated tests), the billing
arithmetic follows the shipped rule at every boundary, compliance behaviours (consent gate, hash-only UID,
append-only audit, confirmation before checkout) are enforced in code and covered by cases, and 17 café
customers find the interaction usable overall (72.4 on a 68-benchmark scale).

**Do not prove:** that a first-time customer can check in and out **unaided** (no assist count exists), how
long it takes compared with the counter (**no baseline seconds**), that the bill a real customer is charged
matches their expectation, that the reader is legible at the counter in real light, or anything about
retention/behaviour over repeated visits. The PROXY cases were run by the team that wrote the system, which
is exactly the population most likely to succeed.

**Known weaknesses in the data itself:** the instrument is not validated SUS (items 8–10 were rewritten as
performance statements), so the 72.4 must be described as a **SUS-adapted** score; four constructs are
single- or two-item, so no reliability coefficient is meaningful; participant codes were free text
(`P01` appears four times, plus `P024`, `P014`, `P00`), so the log assigns `U01…U17` and keeps the entered
code in the notes.

## 5. Ready-to-run plan for the real-user test

Everything needed is already written; this is the execution cheque-list.

1. **Sample** — 15 customers, one 18-minute session each, recruited at the counter, ≥2 days and ≥2 time
   slots. Recruit 18 to absorb no-shows (plan §4.2).
2. **Materials** — 8 test tags (5 enabled, 2 disabled, 1 unregistered), scenario cards S1–S4
   (`docs/testing/uat-questionnaire-th.md`), the observation sheet (the columns already present in
   `docs/test-log/test-session-log.csv`).
3. **Consent** — the form's Section A checkbox; anonymise to U01…U15; delete on request (PDPA, `rule.md`).
4. **Run** — customer performs the scenario unaided; facilitator never touches the device; one neutral
   prompt after 60 s counts as an assist; the customer says the expected amount out loud **before** staff
   confirm it.
5. **Record per session** — `task_success_1_0`, `checkin_time_s`, `checkout_time_s`, `staff_assists`,
   `bill_expected_thb`, `bill_shown_thb`, `bill_match_1_0`, the 15 Likert items, verbatim quotes.
6. **Baseline** — 3 stopwatch observations of the current counter process on the same day, so the
   before/after rows above can be filled with real seconds.
7. **Re-run** `python docs/test-log/scores.py` — it recomputes the scale scores and construct means from the
   form export, so the analysis cannot drift from the raw answers.
8. **Exit check** — task success ≥90 %, billing accuracy 100 %, zero open S1/S2, then write the test summary
   report the plan lists as D9.

If the full instrument is wanted for the write-up, serve the 38-item questionnaire in
`docs/testing/uat-questionnaire-th.md` rather than the 15-item form, so the SUS items and the eight UTAUT2
constructs are the validated ones; with n < 100 the results stay descriptive (mean, SD, α per construct).
