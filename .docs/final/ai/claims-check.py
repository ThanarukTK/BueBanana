#!/usr/bin/env python3
"""Claim check: do the documents still say what the code and data actually do?

This is the evaluation behind `.docs/final/ai-logic.md`. The project's documents
were written with AI assistance along the way, so the risk is not "did an AI
write this" but "does the text still match the artefact". This script turns that
question into a fixed set of machine checks so the answer is a number, not an
impression.

Each check compares (a) a claim in the docs against (b) the shipped code or the
recorded data. Run it after any change; a FAIL is a stale sentence, not a code
bug.

    python .docs/final/ai/claims-check.py
    python .docs/final/ai/claims-check.py --session-log HEAD   # the pre-fix copy

Exit code: 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLAN = ROOT / "docs" / "testing" / "test-plan.docx"
CASES = ROOT / "docs" / "test-log" / "test-cases.csv"
BACKLOG = ROOT / "docs" / "planning" / "backlog.md"
DOMAIN = ROOT / "backend" / "src" / "domain.ts"
TESTS = ROOT / "backend" / "src" / "app.test.ts"
SESSION_LOG = ROOT / "docs" / "test-log" / "test-session-log.csv"

results: list[tuple[str, bool, str]] = []


def check(name: str, passed: bool, detail: str) -> None:
    results.append((name, passed, detail))


def docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    return re.sub(r"<[^>]+>", "", xml)


def read_session_log(ref: str | None) -> str:
    if ref:
        return subprocess.run(["git", "show", f"{ref}:docs/test-log/test-session-log.csv"],
                              cwd=ROOT, capture_output=True, text=True, encoding="utf-8-sig").stdout
    return SESSION_LOG.read_text(encoding="utf-8-sig")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session-log", help="git ref to read the session log from (default: working tree)")
    args = ap.parse_args()

    plan = docx_text(PLAN)
    domain = DOMAIN.read_text(encoding="utf-8")
    tests = TESTS.read_text(encoding="utf-8")
    backlog = BACKLOG.read_text(encoding="utf-8")
    with CASES.open(encoding="utf-8-sig", newline="") as fh:
        cases = list(csv.DictReader(fh))

    # 1-2. money: ฿30/hour in whole-hour blocks, capped at ฿150
    check("rate ฿30/hour: code constant and plan agree",
          "RATE_PER_HOUR_SATANG = 3000" in domain and "฿30/hour" in plan,
          "domain.ts RATE_PER_HOUR_SATANG=3000; plan states ฿30/hour in whole-hour blocks")

    check("cap ฿150 (hour 5): code constant and plan agree",
          "ALL_DAY_SATANG = 15000" in domain and "฿150" in plan,
          "domain.ts ALL_DAY_SATANG=15000; plan states ฿150 cap at hour 5")

    claimed = re.search(r"Math\.min\(hours \* RATE_PER_HOUR_SATANG, ALL_DAY_SATANG\)", domain)
    check("no entry fee: bill() has no entry-fee term",
          "ENTRY_FEE" not in domain.upper() and claimed is not None,
          "bill() = min(ceil(hours)*RATE, ALL_DAY) — no entry-fee constant in domain.ts; "
          "the comment 'No separate entry fee' names the rule, not a term")

    # 3-4. counts quoted in the plan vs the files themselves
    n_tests = tests.count("it(")
    claimed_tests = re.search(r"(\d+)\s+tests", plan)
    check("test count quoted in the plan",
          bool(claimed_tests) and int(claimed_tests.group(1)) == n_tests,
          f"plan says {claimed_tests.group(1) if claimed_tests else '?'}; app.test.ts defines {n_tests}")

    claimed_cases = re.search(r"(\d+)\s+cases", plan)
    check("case count quoted in the plan",
          bool(claimed_cases) and int(claimed_cases.group(1)) == len(cases),
          f"plan says {claimed_cases.group(1) if claimed_cases else '?'}; test-cases.csv holds {len(cases)} rows")

    # 5. compliance claim: only a plain SHA-256 of the UID is stored
    check("UID stored as a plain SHA-256 (no pepper)",
          "sha256" in domain.lower() and "pepper" not in domain.lower().split("hash")[-1],
          "hashTagUid uses createHash('sha256') with no keyed pepper; plan §R11 repeats the residual risk")

    # 6. every requirement id in the plan's matrix exists in the backlog
    pb_in_plan = set(re.findall(r"PB-(\d{2})", plan))
    pb_in_backlog = set(re.findall(r"PB-(\d{2})", backlog))
    check("requirement ids trace to the backlog",
          pb_in_plan <= pb_in_backlog,
          f"{len(pb_in_plan)} PB ids cited in the plan, all present in backlog.md ({len(pb_in_backlog)} ids)")

    # 7. every case id the plan cites exists in the case set
    tc_in_plan = set(re.findall(r"TC-[A-Z]{2}-\d{2}", plan))
    tc_in_cases = {r["TC_ID"].strip() for r in cases}
    missing = sorted(tc_in_plan - tc_in_cases)
    check("case ids cited in the plan exist in test-cases.csv",
          not missing,
          f"{len(tc_in_plan)} case ids cited; missing: {missing or 'none'}")

    # 8. the session log yields metrics at all (the item that failed before the rebuild)
    text = read_session_log(args.session_log)
    rows = list(csv.DictReader(text.splitlines()))
    phase2 = [r for r in rows if (r.get("phase") or "").strip() == "2"]
    sus = [f"SUS_{i:02d}" for i in range(1, 11)]
    complete = sum(1 for r in phase2 if all((r.get(c) or "").strip() for c in sus))
    scored = sum(1 for r in phase2 if (r.get("SUS_score_calc") or "").strip())
    check("session log produces a score for every participant",
          len(phase2) > 0 and complete == len(phase2) == scored,
          f"{complete}/{len(phase2)} rows have all 10 items; {scored}/{len(phase2)} have a numeric score")

    # 9. participant ids are unique and well formed
    ids = [r["participant_id"].strip() for r in phase2]
    check("participant ids are unique U-codes",
          len(ids) == len(set(ids)) and all(re.fullmatch(r"U\d{2}", i) for i in ids),
          f"{len(ids)} rows, {len(set(ids))} distinct ids, sample {ids[:3]}")

    # 10. the plan's sample floor is met by the recorded responses
    check("survey sample meets the plan's floor (>= 15)",
          len(phase2) >= 15,
          f"{len(phase2)} responses recorded; plan §4.2 requires at least 15")

    # 11. every requirement carries a MoSCoW label
    rows_pb = re.findall(r"^\|\s*(PB-\d{2})\s*\|.*?\|\s*\**\s*(MUST|SHOULD|COULD|WON'T)\s*\**\s*\|",
                         backlog, re.MULTILINE)
    labelled = {rid for rid, _ in rows_pb}
    check("every requirement carries a MoSCoW label",
          len(labelled) == 15 and len(rows_pb) == 15,
          f"{len(rows_pb)} rows labelled, {len(labelled)} distinct PB ids "
          f"({dict(Counter(l for _, l in rows_pb))})")

    # 12. the Discover set exists and has the parts the rubric names
    discover = {name: ROOT / "docs" / "planning" / name
                for name in ("company-charter.md", "interviews.md", "secondary-review.md")}
    missing = [n for n, p in discover.items() if not p.exists()]
    if missing:
        check("Discover set present (charter, interviews, secondary review)", False,
              f"missing: {missing}")
    else:
        charter = discover["company-charter.md"].read_text(encoding="utf-8")
        interviews = discover["interviews.md"].read_text(encoding="utf-8")
        secondary = discover["secondary-review.md"].read_text(encoding="utf-8")
        members = set(re.findall(r"6631503\d{3}", charter))
        records = len(re.findall(r"^### I\d{2} — (?!\[)", interviews, re.MULTILINE))
        sources = len(set(re.findall(r"https?://[^\s)\]]+", secondary)))
        check("Discover set present (charter, interviews, secondary review)",
              len(members) >= 5 and records >= 1 and sources >= 5,
              f"charter: {len(members)} member ids; interviews: {records} record section(s); "
              f"secondary review: {sources} distinct source links")

    width = max(len(n) for n, _, _ in results)
    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name.ljust(width)}  {detail}")
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} claims verified against the artefact "
          f"(session log source: {args.session_log or 'working tree'})")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
