# Role statement — Chatmongkhon Jaemiaeng (6631503009)

**Role:** test evidence and evaluation data owner.

## What I owned

The test artefacts that make the evaluation auditable: the session-log rows and the Google Form export
(`docs/form-responses-raw.csv`, 17 responses), the upload of the reviewed test plan
(`docs/test-plan-v1.2.docx` in history, now superseded by `docs/testing/test-plan.docx`), and the
transcription work that moved survey answers into the log schema.

**Evidence of my work**

- `git log --author="Chatmongkhon"` — 15 commits
- `docs/form-responses-raw.csv` — the survey export, 17 responses with consent recorded
- `docs/test-log/test-session-log.csv` — rows `U01…U17`, rebuilt from that export by
  `docs/test-log/scores.py`
- `test/no-real-user-test.md` — the record of what this data does and does not prove

## What this role taught me to check

The first transcription of the form shifted one cell, which scattered Q06–Q10 into the effort/construct
columns; because the score formula requires all ten items, every score came out blank while the file still
"looked" full. `⟨fill: one or two sentences in your own words about what that cost and how you now verify a
transcription⟩`

## AI disclosure

`⟨fill: which tool, for which part (form design, transcription, analysis wording), and what you checked by
hand — including who owns the numbers in the session log.⟩`

## Statement (≈200 words)

`⟨write your own — the survey window and recruitment (who answered, where, over which days), what you would
change about the instrument (the shipped form asked 15 items; the plan specifies 38), and how you would run
the observed sessions if the team had another week.⟩`

## Reflection

`⟨due Sunday 22 Nov, 23:59 — three answers in your own words: lessons learned from building with AI (one
thing better, one worse); where you stand in the industry today; next year and five years out.⟩`
