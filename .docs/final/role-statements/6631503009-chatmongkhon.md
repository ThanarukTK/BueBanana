# Role statement — Chatmongkhon Jaemiaeng (6631503009)

**Role:** tester — system-flow documentation, evaluation data owner, test evidence, and GitHub documentation updates.

## What I owned

I wrote the customer and staff flows for solo check-in, joining an existing group, individual checkout and whole-group checkout in docs/design/designdraft.md section 2. Created and maintained test cases in docs/test-log/test-cases.csv with pre-conditions, steps, test data, expected results and requirement links. I also went ahead and revised and updated the test plan and related documents in GitHub. For doing the evaluation I used the Google Form export (docs/form-responses-raw.csv, 17 responses) and the session log (docs/test-log/test-session-log.csv).

**Evidence of my work**

- `git log --author="Chatmongkhon"` — 15 commits recorded in the repository evidence
- `docs/design/designdraft.md` section 2 — check-in and checkout user journeys
- `docs/test-log/test-cases.csv` — check-in, checkout, and cross-cutting cases linked to requirements
- `docs/testing/test-plan.docx` and `docs/test-log/test-artifacts-readme.md` — test documentation
- `docs/form-responses-raw.csv` and `docs/test-log/test-session-log.csv` — questionnaire evidence and session log

## AI disclosure

I used Codex to help draft and format parts of the test documentation, the form structure, session-log columns, and analysis notes. I remained responsible for determining the actual flow, test steps, data, and expected results. The AI-generated wording can sound complete but miss a requirement, so I compared the cases to the documented journeys and checked survey claims against the raw export. The session log is reconstructed by `docs/test-log/scores.py`, which checks row widths and copied answers; I don't take an AI summary or a polished spreadsheet as evidence that the data is correct.

## Statement (≈200 words)

I worked as the tester for BueBanana. I documented how a customer and staff member move through the system: starting a session with an NFC tag, joining a group already playing, checking out one member, and checking out the whole group. I turned these flows into test cases that identify the starting state, action, test tag, expected screen or stored result, and requirement being tested. I also corrected and updated the test plan and other project documents in GitHub so the team's implementation and evaluation stayed traceable.

One important choice was to test group behaviour as separate paths rather than describe every scan as a generic check-in. A second tag within the join window should enter the same group; a late tag should create a new group and make that outcome clear. The test must inspect both the reader and the staff view, because a screen that looks successful does not prove the right group was changed.

I also worked with the questionnaire export and session log for 17 responses. The initial log had a shifted column that left scores blank, and the live form did not include every item in the plan. I learned to check the instrument and data mapping before collection, then separate survey opinions from observed task success and timing. Those measurements were not recorded as real-user sessions.

Evidence: `docs/design/designdraft.md` section 2, `docs/test-log/test-cases.csv`, `docs/testing/test-plan.docx`, `docs/form-responses-raw.csv`.

## Reflection

**1. Lessons learned.** As the tester, I learned that AI is useful for turning a system flow into a first set of test cases and for cleaning up documentation, but it does not know whether a case matches the actual product. In BueBanana, I documented the paths for solo check-in, joining a group, individual checkout, and group checkout, then wrote cases with preconditions, steps, test data, and expected outcomes. AI made repetitive wording and GitHub document updates faster, which helped the team see gaps earlier. The downside was how convincing a polished document could look even when it was wrong. Our form did not match every item in the plan, and a shifted column in the session log made all scores blank. Those mistakes taught me to check requirements against the live form, implementation, and raw export before I mark a result complete. I would also ask another teammate to review the cases before a test run, because familiar flows hide assumptions. I also learned to label 17 questionnaire responses as opinions: they cannot stand in for observed task success or timing.

**2. My place in the industry.** Today I see myself as a developing tester who can connect product flows to testable evidence. Testing is more than finding bugs: it includes asking what could fail, making each result reproducible, and writing down limits honestly. AI will speed up routine drafting, but human judgment is still needed for coverage, security, privacy, and the meaning of results. I need more practice with API automation and real-user observation.

**3. My plan.** Over the next year, I want to improve automated API and UI testing, practice GitHub-based review, and design a test plan and form together before collecting data. I want to run observed sessions and compare these with survey feedback, rather than mixing the two. In five years, I hope to be a software tester or QA engineer who can plan tests for a team, build reliable automated checks, and explain product quality with traceable evidence. I want my work to help developers and users be more confident in a release.
