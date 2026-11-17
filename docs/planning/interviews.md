# Discovery conversations — one informal interview

**Status:** the team spoke to **one person outside the team** — the café owner — in an informal, unstructured
conversation **at the café on 2026-11-11**. No recording, no consent form, no fixed question set; written up
from recollection afterwards. There were **no customer or staff interviews**.

**So this project does not claim the five-interview path.** It takes the rubric's other route: a **SECONDARY
review of the problem** (`docs/planning/secondary-review.md`, six verified sources) for the general case, plus
this one conversation and the team's own observation of the counter process for this café. The single record
below is kept because it is real, it is the owner's own verdict on the system, and it is the only external
voice on record.

## 1. What this record is and is not

| | |
|---|---|
| Is | a real conversation with the café owner, quoted loosely, that shaped the owner's acceptance and named a hardware fault |
| Is not | a discovery interview, a structured interview, a sample, or evidence of what customers think |
| Why it is still here | it is the only outside feedback on the built system, and it is the source of the reader fault recorded in `test/no-real-user-test.md` §4 |
| PDPA | role only, no name, no contact details — the owner is identifiable in context as the café's owner, which is unavoidable and appropriate |

Rules the team follows when writing a conversation up, kept for anyone repeating this:

1. **One record per conversation, coded `I01`, `I02`, …** Role only — no names, no phone numbers.
2. **Say how it happened:** date, place, how long, whether you wrote anything down at the time or reconstructed
   it, and whether the person knew you were building something.
3. **Quote loosely or verbatim, and say which.** A paraphrase cannot be checked; an invented verbatim is worse
   than a labelled gist.
4. **Mark uncertainty instead of smoothing it.**
5. **Map each pain onto a requirement id** (`PB-01`…`PB-15`), or state that it maps to nothing.

## 2. Records

### I01 — owner

- **When / where:** **2026-11-11**, at the café, after the system demonstration.
- **How:** informal conversation at the counter after showing the system running — no notes taken at the time,
  written up from the team's recollection. The owner knew the system was being built for the café.
- **What we asked:** "how did the system go?" — whether the flow worked for the shop, and what still needed
  fixing.
- **What we heard:**
  - The system **works and completes the flow in time** — the owner accepted the demonstrated check-in,
    check-out and group flow. (This is the approval also recorded in `docs/test-log/test-session-log.csv`,
    row `ST-01`, dated 2026-11-05.)
  - **The reader board sometimes stops working and has to be reset** — an intermittent hardware fault, not a
    flow problem.
  - **The indicator on the board does not always display properly**, so the state of a tap is not always
    visible.
- **Verbatim:** `(gist, not verbatim — English paraphrase of a Thai conversation)` "the system works perfectly
  and does things in time. But sometimes the board might not work and needs a reset, and the indicator of that
  sometimes does not show properly."
- **Maps to:** `PB-05` (reliable during busy periods), `PB-04` / `PB-14` (the staff and reader must show what
  is happening). It is also the report that matches the loose reader wiring in `test/no-real-user-test.md` §1
  and §4.
- **Confidence:** high — specific, unprompted, and consistent with the fault the team reproduced later.

### I02–I05 — not recorded

No other conversation took place. Staff and customers were not interviewed, so there are no further records and
none will be invented to fill the slots.

## 3. Where the three pains actually came from

The honest answer, since no interview established them:

| Pain (`proposal.md`) | Source | Evidence in the repo |
|---|---|---|
| Pain 1 — the existing site is inconvenient | team's own use of the existing café site + published evidence | `secondary-review.md` S4, S5; survey theme "steps/guidance unclear" (7/17) |
| Pain 2 — stakeholders want to promote/sell 3D-printed products | the owner, in earlier project discussions, and the market evidence for printed tabletop accessories | `secondary-review.md` S6 (commercial source, labelled weak) |
| Pain 3 — check-in/check-out needs staff and causes delays | team observation of the counter process at the café + published evidence on queue cost | `secondary-review.md` S1, S2, S3; `I01` corroborates on the built system |

That is weaker than five interviews and it is written here plainly. What it is not is padded with invented
conversations.

## 4. Questions worth asking if the team talks to staff or customers again

- `ตอนนี้ลูกค้าเข้ามาแล้วเช็กอินยังไงครับ/คะ` — how does check-in work today?
- `ช่วงคนเยอะที่สุดกี่โมง แล้วต้องรอกันนานไหม` — when is the peak, and how long is the wait?
- `เคยมีปัญหาคิดเงินผิดหรือลูกค้าทวงบิลไหม` — have bills ever been wrong or disputed?
- `ลูกค้าถามไหมว่าเล่นไปนานแค่ไหน / ต้องจ่ายเท่าไร` — do customers ask how long they have played, or what they owe?
- `ถ้าลูกค้าแตะบัตรเองที่โต๊ะ คิดว่าจะช่วยได้ไหม` — would tapping a card themselves help?
- `อยากขายงาน 3D print ยังไง` — how do you want to sell the 3D-printed products?

Record shape for a future conversation:

```
### I02 — [staff / customer]

- **When / where:** at the café, [date, hour of day]
- **How:** informal conversation, [no notes / jotted after], reconstructed [when]
- **What we asked:** "[q1]"; "[q2]"
- **What we heard:** [3-5 bullets, one pain each]
- **Verbatim:** "[Thai]" — "[translation]"   (or: (gist, not verbatim) "...")
- **Maps to:** PB-[__]
- **Confidence:** [high / medium / low]
```

## 5. What this record proves, and what it does not

**Proves:** the owner saw the system run and accepted the flow; the reader board had an intermittent fault and
an unreliable indicator; the fault is consistent with the loose wiring the team later found.

**Does not prove:** what any customer thinks, whether the flow is faster than the counter, or that the three
pains in the backlog were verified with the people who have them. Those claims rest on the 17-response survey
and the internal test run (`test/no-real-user-test.md`), and on the published evidence
(`secondary-review.md`) — not on this conversation.

**If asked in Q&A, the honest answer is:** "we interviewed the owner once, informally, and recorded it; we did
not interview staff or customers, so for the problem we relied on published evidence and our own observation
of the counter. The measured evidence is the survey and the internal test run."
