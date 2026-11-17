# AI logic — where it is, how it was built, how it is checked

Two separate questions, answered separately:

1. **Does the product use AI at runtime?** No. Not anywhere.
2. **Was AI used to build it?** Yes, throughout — and that is the part this document measures.

---

## 1. Where — runtime

**There is no model, no prompt and no inference call in the shipped system.** The backend's only
dependencies are `elysia` and `postgres`; the frontend's are `next`, `react`, `react-dom` and `ws`
(`backend/package.json`, `frontend/package.json`). A grep of `backend/src`, `frontend/app` and both
manifests for `openai|anthropic|gemini|ollama|llm|/v1/chat` returns nothing.

Every decision the system makes is a deterministic rule, deliberately:

| Decision | Rule | Where |
|---|---|---|
| Bill amount | `min(ceil(hours) × ฿30, ฿150)`; zero duration → ฿0 | `backend/src/domain.ts` |
| Join an existing group | second tap within 30 s joins; after that a new group | `backend/src/domain.ts` |
| Duplicate tap | inside 2 s returns the previous result, creates nothing | `backend/src/domain.ts` |
| Card identity | plain SHA-256 of the normalised UID; raw UID never stored or returned | `backend/src/domain.ts` |
| Checkout | rejected without `customerConfirmed: true` | `backend/src/app.ts` |

**Why no AI in the runtime path.** Three reasons, in order of weight: (a) the amount a customer pays must be
reproducible and explainable to a cashier, and a probabilistic system cannot promise that; (b) under the
Electronic Transactions Act the customer's confirmation is the signature, so the figure it confirms must be
derived, not inferred; (c) a rule can be tested at its boundaries — the 20 automated tests assert exactly
the transitions above, which is why the billing checkpoints are verifiable at all. An LLM in this path would
trade auditability for a feature nobody asked for.

## 2. Where — development

AI assistance was used to write this repository, and the repo says so: `AGENTS.md` is the single shared
context for any AI assistant working here, `claude.md` is a deliberate redirect to it, and
`docs/compliance/rule.md` is mandatory reading before touching user data.

What was AI-assisted, by artefact:

| Area | What AI did | What a human did | Evidence |
|---|---|---|---|
| Backend + frontend code | drafted stores, payload types, a share of the API handlers | reviewed, ran, deployed; owned the pricing and hashing decisions | `git log` — 45 commits under the maintainer, `backend/src/` |
| Documentation | first drafts of the API contract, backend conventions, deploy guide, test plan structure | rewrote the plan in Word with the team, decided every rule | `docs/`, `docs/testing/test-plan.docx` |
| Test artefacts | case inventory structure, log schemas | executed the cases, transcribed survey answers | `docs/test-log/`, `docs/form-responses-raw.csv` |
| This audit + rebuild | the claim check, the session-log rebuild script | accepted or rejected each finding | `.docs/final/ai/claims-check.py`, `docs/test-log/scores.py` |

## 3. How — the pipeline that keeps the prose honest

The failure mode of AI-assisted documentation is not "wrong tone", it is **text that was true when it was
written**. This project hit it twice, both found by the check below:

- a session log that looked populated (17 rows) but produced **0 scores** — the transcription had shifted
  cells and the score formula returned `""` for every row;
- participant ids that looked like codes (`P01…`) but were **not unique** — `P01` appeared four times,
  alongside `P024`, `P014` and `P00`.

So the check is not a reading, it is a fixed set of comparisons between what a document claims and what the
code or the data does:

```
claim in docs  ──►  claims-check.py  ──►  PASS / FAIL against code, CSV rows, git blob
```

Thirteen checks, in `.docs/final/ai/claims-check.py`:

1. rate ฿30/hour — code constant vs plan text
2. cap ฿150 at hour 5 — code constant vs plan text
3. no entry fee — the shipped `bill()` expression has no entry-fee term
4. test count quoted in the plan (20) vs `it(` blocks in the suite
5. case count quoted in the plan (41) vs rows in `test-cases.csv`
6. plain SHA-256, no pepper — the shipped hash function
7. every `PB-` id cited in the plan exists in `backlog.md`
8. every `TC-` id cited in the plan exists in `test-cases.csv`
9. the session log yields a numeric score for every participant
10. participant ids are unique `U`-codes
11. the recorded sample meets the plan's floor of 15
12. every requirement in the backlog carries a MoSCoW label (15 rows)
13. the Discover set exists and has its parts — 5 member ids in the charter, at least one interview record,
    and at least 5 distinct source links in the secondary review

## 4. Prove — test set, baseline, script and log

| Item | Value |
|---|---|
| Test set | 13 machine-checkable claims (`claims-check.py`) |
| Baseline | the committed state at `HEAD` before the rebuild — `--session-log HEAD` |
| Baseline result | **11/13** (FAIL: session log yields no score; ids not unique) |
| After | **13/13** |
| Script | `.docs/final/ai/claims-check.py` |
| Log | `.docs/final/ai/claims-check.log` (both runs, unedited) |

Reproduce:

```bash
python .docs/final/ai/claims-check.py --session-log 7240df0  # baseline: 11/13, exit 1
python .docs/final/ai/claims-check.py                      # current:  13/13, exit 0
```

The script exits non-zero on any failure, so it can gate a commit. Neither run needs the network, a model,
or a human reading — which is the point: the check must be cheaper than trusting the prose.

## 5. Measure

| Metric | Baseline | After | What it means |
|---|---|---|---|
| Claims verified mechanically | 11 / 13 (85 %) | 13 / 13 (100 %) | AI-written prose shipped two statements that the artefact contradicted |
| Stale-claim classes caught | 2 (score-yield, id uniqueness) | 0 | both were "looks complete, isn't" — the characteristic AI-documentation failure |
| What the check cannot see | any claim about design rationale, UX quality, or a measurement nobody took | same | the check verifies *traceability*, not truth of opinion |

**Limitations, stated rather than implied.** The 11 checks are the claims that happen to be mechanisable;
a statement like "the flow is simpler than the paper process" stays unverified because it was never
measured with a stopwatch (see `test/no-real-user-test.md` §3). The check also cannot detect a claim that is
internally consistent but empirically false — the only fix for that is real-user data, which is why the
blanks in the session log stay blanks.

**What happens when it fails.** A failed check edits the document, never the code: the code is the shipped
rule and the tests assert it, so prose that disagrees is stale by definition. The one exception is a failure
in checks 9–10, which is a data-integrity defect — that is what produced
`docs/test-log/scores.py`, now the only sanctioned path from a form export to a session log.

**Bias check.** The claim set was written by the same AI assistance it audits, so it is biased toward
claims the assistant already knew how to verify (numbers, ids, paths) and away from the ones it cannot
(experience, quality, usability). That is why the qualitative findings in this folder are attributed to
named respondents in `docs/form-responses-raw.csv` instead of being summarised as a score.
