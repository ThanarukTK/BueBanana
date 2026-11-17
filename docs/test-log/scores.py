#!/usr/bin/env python3
"""Rebuild docs/test-log/test-session-log.csv from the Google Form export.

Why this exists
---------------
The form export (docs/form-responses-raw.csv) is a *survey*: 15 Likert items and
three open questions. The session log is the *measurement* sheet. A previous
transcription copied the answers by hand and shifted cells, which scattered
Q06-Q10 into the PE/EE columns and left every SUS score blank (the live formula
returns "" unless all ten items are present).

This script is the reproducible bridge between the two files:

  * participant ids are assigned here (U01, U02, ...) because the as-entered
    codes arrive duplicated (P01 appeared four times);
  * items are mapped by name, then asserted against the source row;
  * scores are computed in Python and written as numbers - a formula typed into
    a .csv is inert text;
  * reverse-scored items are taken from each statement's wording (Q2, Q4, Q7 are
    the negatives), not from SUS's even-number alternation, because items 8-10
    of this form are positive performance statements.

Run:  python docs/test-log/scores.py
It rewrites the CSV in place and prints the summary table quoted in the
deliverables. Nothing is invented: columns the form never collected stay empty.
"""

from __future__ import annotations

import csv
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "docs" / "form-responses-raw.csv"
LOG = ROOT / "docs" / "test-log" / "test-session-log.csv"

# Q01..Q10 form the 10-item usability block; 8-10 are performance statements,
# so the scale is a SUS-adapted one, not the validated SUS.
SUS_ITEMS = 10
NEGATIVE_ITEMS = {2, 4, 7}          # read from the Thai wording of each statement
SINGLE_ITEMS = {11: "EE1", 12: "FC1", 13: "FC2", 14: "PV1", 15: "BI1"}
CONSTRUCTS = {
    "EE": ["EE1"],
    "FC": ["FC1", "FC2"],
    "PV": ["PV1"],
    "BI": ["BI1"],
}
KEEP_PHASE1_NOTES = {
    "manual-baseline (current staff process)": (
        "⟨team ESTIMATE ~180 s for arrival → session recorded at the counter; not a stopwatch observation. "
        "Replace with 3 timed observations before submission⟩"
    ),
    "S1-S4 internal (staff run)": (
        "internal run by the team; task/timing columns were not recorded in this session"
    ),
}


def rating_value(cell: str) -> int:
    return int(cell.strip()[0])


def sus_score(values: list[int]) -> float:
    total = sum((5 - v) if (i + 1) in NEGATIVE_ITEMS else (v - 1) for i, v in enumerate(values))
    return total * 2.5


def iso_date(cell: str) -> str:
    """2569/11/08 12:07:52 AM GMT+7 -> 2026-11-08 (Buddhist year - 543)."""
    raw = cell.strip().split()[0]
    y, m, d = (int(p) for p in raw.split("/"))
    return f"{y - 543:04d}-{m:02d}-{d:02d}"


def main() -> None:
    with LOG.open(encoding="utf-8-sig", newline="") as fh:
        existing = list(csv.reader(fh))
    header = existing[0]
    idx = {name: i for i, name in enumerate(header)}

    # --- keep the Phase 1 scaffolding rows, minus the inert formulas --------
    phase1 = []
    for row in existing[1:]:
        if row[0] != "1":
            continue
        row = list(row)
        for col in ("SUS_score_calc", "PE_mean", "EE_mean", "SI_mean", "FC_mean",
                    "HM_mean", "PV_mean", "HT_mean", "BI_mean"):
            row[idx[col]] = ""
        scenario = row[idx["scenario"]]
        if scenario in KEEP_PHASE1_NOTES:
            row[idx["notes_verbatim"]] = KEEP_PHASE1_NOTES[scenario]
        phase1.append(row)

    # --- Phase 2: one row per form response --------------------------------
    with RAW.open(encoding="utf-8-sig", newline="") as fh:
        responses = list(csv.DictReader(fh))
    item_keys = [k for k in responses[0] if k and k.startswith("Rating")]
    assert len(item_keys) == 15, f"expected 15 rating items, found {len(item_keys)}"

    phase2 = []
    for n, resp in enumerate(responses, start=1):
        uid = f"U{n:02d}"
        answers = [rating_value(resp[k]) for k in item_keys]

        row = [""] * len(header)
        row[idx["phase"]] = "2"
        row[idx["participant_id"]] = uid
        row[idx["session_date"]] = iso_date(resp["Submitted at"])
        row[idx["scenario"]] = "questionnaire-only; no task observation (Google Form response #%d)" % n
        row[idx["age_band"]] = resp["Age band"]
        row[idx["gender"]] = resp["Gender"]
        row[idx["experience_first_time_1_0"]] = "1"
        # consent has no dedicated column in this schema; it is recorded verbatim in the notes
        assert resp["Consent"].strip(), f"response #{n} has no consent recorded"

        for i in range(SUS_ITEMS):
            row[idx[f"SUS_{i + 1:02d}"]] = str(answers[i])
        for q_no, col in SINGLE_ITEMS.items():
            row[idx[col]] = str(answers[q_no - 1])

        row[idx["SUS_score_calc"]] = f"{sus_score(answers[:SUS_ITEMS]):.1f}"
        for name, cols in CONSTRUCTS.items():
            vals = [int(row[idx[c]]) for c in cols if row[idx[c]].strip()]
            row[idx[f"{name}_mean"]] = f"{st.mean(vals):.2f}" if vals else ""

        row[idx["notes_verbatim"]] = (
            f"Google Form response #{n} | submitted {resp['Submitted at']} (submission timestamp; "
            f"session date not observed) | consent={resp['Consent']} | "
            f"code_as_entered={resp['Participant code (as entered; unverified)']} | "
            f"prior_experience={resp['Prior experience']} | "
            f"visit_frequency={resp['Café visit frequency']} | "
            f"confusion={resp['Open response — confusion']} | "
            f"wanted={resp['Open response — desired changes']} | "
            f"self_service={resp['Open response — self-service without staff']} | "
            f"not collected by this form: task success, timings, assists, bill match"
        )
        phase2.append(row)

    rows = [header] + phase1 + phase2

    # --- assertions: widths, completeness, and copied values --------------
    for r in rows:
        assert len(r) == len(header), f"row width {len(r)} != header {len(header)}"
    for r, resp in zip(phase2, responses):
        items = [int(r[idx[f"SUS_{i + 1:02d}"]]) for i in range(SUS_ITEMS)]
        assert items == [rating_value(resp[k]) for k in item_keys[:SUS_ITEMS]], "item copy mismatch"
        assert len(items) == SUS_ITEMS, "incomplete item block"
    assert all(r[idx["participant_id"]] for r in phase2)

    with LOG.open("w", encoding="utf-8-sig", newline="") as fh:
        csv.writer(fh, lineterminator="\r\n").writerows(rows)

    # --- summary -----------------------------------------------------------
    scores = [float(r[idx["SUS_score_calc"]]) for r in phase2]
    print(f"responses written      : {len(phase2)} (ids U01..U{len(phase2):02d})")
    print(f"complete 10-item rows  : {sum(1 for r in phase2 if all(r[idx[f'SUS_{i+1:02d}']].strip() for i in range(10)))}/{len(phase2)}")
    print(f"SUS-adapted score      : n={len(scores)} mean={st.mean(scores):.1f} "
          f"sd={st.stdev(scores):.1f} min={min(scores):.0f} max={max(scores):.0f} "
          f">=68: {sum(1 for s in scores if s >= 68)}/{len(scores)}")
    for i, key in enumerate(item_keys, start=1):
        print(f"  item {i:02d} mean {st.mean([rating_value(r[key]) for r in responses]):.2f}")
    for name in CONSTRUCTS:
        vals = [float(r[idx[f"{name}_mean"]]) for r in phase2 if r[idx[f"{name}_mean"]]]
        print(f"  {name}: n={len(vals)} mean={st.mean(vals):.2f} (items: {len(CONSTRUCTS[name])})")
    empty = [c for c in ("task_success_1_0", "checkin_time_s", "checkout_time_s", "staff_assists",
                         "bill_expected_thb", "bill_shown_thb", "bill_match_1_0")
             if not any(r[idx[c]].strip() for r in phase2)]
    print(f"still empty (form never asked): {', '.join(empty)}")


if __name__ == "__main__":
    main()
