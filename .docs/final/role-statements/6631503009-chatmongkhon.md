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

## AI disclosure

Codex drafted the first structure of the Google Form, the column set of the session log, and the wording of the
analysis notes. Everything it produced was checked against the source rather than trusted: the log is rebuilt by
`docs/test-log/scores.py`, which asserts that every row is the right width and that the ten answers copied from
the export match the export, and every number in `test/no-real-user-test.md` was counted from the CSV rather
than copied from the assistant's summary. The instrument itself (SUS and UTAUT2 item wording) came from
`docs/testing/uat-questionnaire-th.md`, not from the model.

## Statement (≈200 words)

I owned the evaluation data: the Google Form our customers answered, the seventeen responses we collected
from it, and the session-log rows that turn those answers into something that can be scored. I also handled the
reviewed copies of the test plan going into the repository.

My decision was to stop trusting the participant code people typed. The form's own instructions asked for
`P01–P15`, so the export arrived with `P01` four times and malformed entries like `P024` and `P00` alongside
it. Rather than guess which row belonged to which person, the log assigns a unique `U01…U17` and keeps the
entered string in the notes, so the raw answer is never lost and no two rows can be confused.

What went wrong was my first transcription: one shifted cell pushed questions six to ten into the effort and
facilitating-conditions columns, and because the score needs all ten items, every score came out blank while
the file looked complete. It is rebuilt by a script now, with an assertion per row — but I should have written
that check before the data arrived.

Evidence: `docs/form-responses-raw.csv`, `docs/test-log/test-session-log.csv`, `docs/test-log/scores.py`.

## Reflection

`⟨due Sunday 22 Nov, 23:59 — three answers in your own words: lessons learned from building with AI (one
thing better, one worse); where you stand in the industry today; next year and five years out.⟩`
