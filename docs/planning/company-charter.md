# Company Charter

Team, roles and the rules we hold each other to. Written so a reader can tell who owns what and how the
work is judged, without asking us.

**Project:** NFC check-in / check-out for Bue Banana, a board game café (case study, Software Engineering,
2026).
**Repository:** `ThanarukTK/BueBanana` — the graded artefact. Everything we claim lives there.

## 1. Members and roles

| Student ID | Name | GitHub | Project role | Test-plan role (§7) |
|---|---|---|---|---|
| 6631503001 | Gritthaphat Intaraprasit | `koonnuthhh` | Backend + integration; repo conventions; test automation | Developer / fix owner |
| 6631503009 | Chatmongkhon Jaemiaeng | `Chatmongkhon` | Test evidence and evaluation data | Note-taker / observer · Form owner |
| 6631503021 | Thanaruk Kammarat | `ThanarukTK` | Requirements, diagrams, compliance; repo owner on GitHub | Test lead |
| 6631503032 | Patcha Kantaradusedee | `6631503032PatchaKantaradusadee` | Frontend — staff console, auth, customer pages | Facilitator (Phase 2) |
| 6631503118 | Supichaya Rabiabnaweenurak | `Seazazel` | Backend MVP scaffold (first server, store, domain types, first tests) | Data protection contact |

Ownership is not exclusive: everyone reviews, everyone tests. The rule is that one named person is
answerable for each artefact, and the role statements say who.

## 2. Team rules

### 2.1 How we work

1. **One artefact, one owner.** Every document, module and log has a named owner from the table above. A
   file with no owner does not get merged.
2. **Tests stay green.** `cd backend && bun test` must pass (20 tests) before a change is pushed. A red
   suite is treated as a broken build, not a warning.
3. **Documentation moves with the code.** A change to a rule (pricing, hashing, window length) updates the
   documents that state that rule in the same commit — the API contract, the test plan, the env example.
   Historical records get a `Superseded <date>` note instead of being rewritten.
4. **Repo-relative references only.** Links are `docs/<category>/<file>`, never a bare filename, so a
   reader can resolve them from the root.
5. **Every number has a file behind it.** No figure in a document or slide without a source in the repo. If
   a measurement does not exist, the document says `⟨fill⟩` or "not measured" — an invented number scores
   zero, so it is never worth inventing one.
6. **No real customer data.** Participant codes only (`U01…`), no names, phone numbers, emails or raw NFC
   UIDs anywhere in the repo. Test tags only for UAT.
7. **The team's stated reason for a defect gets written down.** "Found none" is recorded as a statement, not
   left as an empty file that could mean "never ran".

### 2.2 Git

- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, scope optional
  (`fix(frontend): …`). This is enforced socially, and it is what makes `git log` greppable for the case
  study.
- **`main` is what gets graded.** Work on a branch is invisible to the instructor until it is merged, so a
  feature branch is a work-in-progress, never a home for finished work.
- **Small commits with a reason in the message.** "Update test-session-log.csv" says nothing; "add 17 form
  responses as U01…U17" says what changed and why.
- **Never commit secrets.** No `.env`, no connection string, no `service_role` key. If a key is committed by
  accident, the key is rotated — deleting the file is not enough.

### 2.3 Working with AI

- `AGENTS.md` is the single shared context for any AI assistant in this repo; `claude.md` is only a redirect
  to it. Duplicated context drifts, so we keep one copy.
- AI is used for **boilerplate, documentation drafting and repetitive edits** — not for deciding a business
  rule. Pricing, the join/dedupe window, the hash and the audit-log behaviour are human decisions, checked
  against the code.
- **Every AI-assisted change is reviewed and run** before it is committed. A generated number is treated as
  a claim until it is reproduced.
- **Disclose it.** Each member's role statement says which tool, for which part, and what they verified.
  The mechanism that keeps prose honest is `.docs/final/ai/claims-check.py` — 11 claims compared against
  code and data on every change.
- **AI never fills a measurement.** Empty logs stay empty; the substitute evidence path
  (`test/no-real-user-test.md`) is used instead.

### 2.4 Meetings and availability

| Item | Decision |
|---|---|
| Weekly sync | `⟨fill: day/time and channel⟩` |
| Where we talk between syncs | `⟨fill: LINE / Discord / Teams⟩` |
| Decision rule | Decisions are made in the sync; anything decided one-to-one is posted back to the group so it is on record |
| Deadline discipline | Work is pushed the night before a check, not the morning of — an unpushed commit does not exist for the grader |
| If someone is unavailable | The owner names a stand-in in the group; the artefact stays owned, not orphaned |

## 3. What "done" means for this project

A rubric item is done when a stranger can: open the file from the repository, find the claim it makes, and
follow the link or command that proves it. Not "we discussed it", not "it's on someone's laptop".

## 4. Known gaps in this charter

- The meeting cadence and channel are `⟨fill⟩` — only the team knows them.
- The charter is written from what the repository already enforces (commit style, tests, secrets, references).
  If the team agreed to a rule that is not visible in the repo, it belongs here and is not yet written.
