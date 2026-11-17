# Discovery conversations — informal interviews

**Status:** the team held **informal, unstructured conversations** with the café (owner, staff, customers),
all of them **on site at the café**. No recording, no formal consent form, no fixed question set, notes
reconstructed after the fact. This file records them **as what they are** and nothing more — an informal input
that shaped the backlog, plus one post-demo feedback conversation with the owner (`I01`) that belongs to
evaluation rather than discovery.

That labelling is deliberate: a rubric that asks for "real-user interviews" is asking whether real people told
you something, not whether you ran a lab study. What it does *not* accept is informal chats presented as
structured interviews. So: five records, each with how it happened, what was said, and a confidence note.

## 1. Rules for filling this file

1. **One record per conversation, coded `I01`–`I05`.** No names, no phone numbers, no faces — role only
   ("owner", "staff", "customer at the counter"). This is PDPA hygiene as much as research hygiene.
2. **Say how it happened.** Date (approximate is fine, mark it `~`), place, how long, whether you wrote
   anything down at the time or reconstructed it, and whether the person knew you were building something.
3. **Quote verbatim in Thai, then translate.** A paraphrase cannot be checked; a verbatim line can. If you only
   remember the gist, write `(gist, not verbatim)` — that is honest and still counts.
4. **Mark uncertainty instead of smoothing it.** "He said the queue is bad at 6–7 pm, I did not ask how long"
   is a better record than a polished number you cannot defend in Q&A.
5. **Map each pain you heard onto a requirement id** (`PB-01`…`PB-15`). A pain that maps to nothing either
   becomes a backlog item or goes in "heard but not built".

## 2. The 20-minute job

For each of the five conversations, fill one block in §3 below:

| Field | What to write |
|---|---|
| `Who` | role only: owner / staff (front desk) / customer — e.g. "customer, first-time visitor, ~20s" |
| `When / where` | `~2026-10-xx`, at the counter, during a quiet hour |
| `How` | informal chat; no notes taken; reconstructed the same evening |
| `What we asked` | the three or four things you actually asked (not what you wish you had asked) |
| `What we heard` | 3–5 bullets, one pain per bullet |
| `Verbatim` | 1–2 quotes in Thai + translation, or `(gist, not verbatim)` |
| `Maps to` | `PB-xx` ids, or "no requirement" |
| `Confidence` | high (said repeatedly, unprompted) / medium / low (mentioned once, in passing) |

If you only have three or four conversations you can actually recall in detail, **write three or four and say
so**. Five thin records read worse than four solid ones, and the rubric's substitute path
(`secondary-review.md`) already covers the problem in general.

## 2a. Copy this and replace only the brackets

Five of these, one per conversation. Everything outside `[...]` is already the right wording; the bracketed
parts are facts only you know — do not invent a quote to fill one, write `(gist, not verbatim)` instead.

```
### I01 — [owner / staff / customer]

- **When / where:** ~2026-[10-__], [at the counter / on the floor], [quiet hour / peak hour]
- **How:** informal conversation, [no notes taken / notes jotted afterwards], reconstructed [the same
  evening / within the week]. [They knew we were building a check-in system / they did not.]
- **What we asked:** "[question 1]"; "[question 2]"; "[question 3]"
- **What we heard:**
  - [what they said happens now]
  - [where it costs them time or money]
  - [what they wish they had]
- **Verbatim:** "[the Thai words as you remember them]" — "[translation]"
  *(or: (gist, not verbatim) "..." )*
- **Maps to:** PB-[__]
- **Confidence:** [high = said repeatedly and unprompted / medium / low = mentioned once, in passing]
```

Then in §5, put `I0x` next to the pain it belongs to. That is the whole job — and the synthesis table is what
makes the file worth reading.

## 3. Records

### I01 — owner · **post-demo feedback** (evaluation, not discovery)

- **When / where:** `⟨fill: ~2026-11-__⟩`, at the café, after the system demonstration.
- **How:** informal conversation at the counter after showing the system running; no notes taken at the time,
  written up from the team's recollection. The owner knew the system was being built for the café.
- **What we asked:** "how did the system go?" — whether the flow worked for the shop, and what still needed
  fixing.
- **What we heard:**
  - The system **works and completes the flow in time** — the owner accepted the demonstrated check-in,
    check-out and group flow. (This is the approval recorded in `docs/test-log/test-session-log.csv`,
    row `ST-01`.)
  - **The reader board sometimes stops working and has to be reset** — an intermittent hardware fault, not a
    flow problem.
  - **The indicator on the board does not always display properly**, so the state of a tap is not always
    visible.
- **Verbatim:** `(gist, not verbatim — English paraphrase of a Thai conversation)` "the system works perfectly
  and does things in time. But sometimes the board might not work and needs a reset, and the indicator of that
  sometimes does not show properly."
- **Maps to:** `PB-05` (reliable during busy periods), `PB-04` / `PB-14` (the staff and reader must show what
  is happening). It is also the report that matches the loose reader wiring recorded in
  `test/no-real-user-test.md` §1 and §4.
- **Confidence:** high — specific, unprompted, and consistent with the fault the team reproduced later. It is
  the only conversation with the owner on record.

### I02 — `⟨fill: staff / customer⟩`

- **When / where:** at the café, `⟨fill: ~date, hour of day⟩`
- **How:** `⟨fill: informal conversation, no notes / jotted after, reconstructed when?⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:** `⟨fill⟩`
- **Verbatim:** `⟨fill: Thai⟩` — `⟨fill: translation⟩`, or `(gist, not verbatim) "..."`.
- **Maps to:** `⟨fill: PB-xx⟩`
- **Confidence:** `⟨fill⟩`

### I03 — `⟨fill: staff / customer⟩`

- **When / where:** at the café, `⟨fill: ~date, hour of day⟩`
- **How:** `⟨fill⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:** `⟨fill⟩`
- **Verbatim:** `⟨fill⟩`
- **Maps to:** `⟨fill⟩`
- **Confidence:** `⟨fill⟩`

### I04 — `⟨fill: staff / customer⟩`

- **When / where:** at the café, `⟨fill: ~date, hour of day⟩`
- **How:** `⟨fill⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:** `⟨fill⟩`
- **Verbatim:** `⟨fill⟩`
- **Maps to:** `⟨fill⟩`
- **Confidence:** `⟨fill⟩`

### I05 — `⟨fill: staff / customer⟩`

- **When / where:** at the café, `⟨fill: ~date, hour of day⟩`
- **How:** `⟨fill⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:** `⟨fill⟩`
- **Verbatim:** `⟨fill⟩`
- **Maps to:** `⟨fill⟩`
- **Confidence:** `⟨fill⟩`

## 4. Questions worth reconstructing from memory

These are the ones that produce a requirement. Tick the ones you actually asked — do not add the ones you did
not.

- `ตอนนี้ลูกค้าเข้ามาแล้วเช็กอินยังไงครับ/คะ` — how does check-in work today?
- `ช่วงคนเยอะที่สุดกี่โมง แล้วต้องรอกันนานไหม` — when is the peak, and how long is the wait?
- `เคยมีปัญหาคิดเงินผิดหรือลูกค้าทวงบิลไหม` — have bills ever been wrong or disputed?
- `ลูกค้าถามไหมว่าเล่นไปนานแค่ไหน / ต้องจ่ายเท่าไร` — do customers ask how long they have played, or what they owe?
- `ถ้าลูกค้าแตะบัตรเองที่โต๊ะ คิดว่าจะช่วยได้ไหม` — would tapping a card themselves help?
- `อยากขายงาน 3D print ยังไง` — how do you want to sell the 3D-printed products?

## 5. Synthesis — the pains, and where they came from

Fill the "heard in" column from your records; the requirement column is already how the backlog is organised.

| Pain (as written in `proposal.md`) | Heard in | Requirements it produced | Also supported by |
|---|---|---|---|
| Pain 1 — the existing site is inconvenient for customers | `⟨fill: I0x⟩` | `PB-06`, `PB-07` | S4, S5 in `secondary-review.md`; survey theme "steps/guidance unclear" (7/17) |
| Pain 2 — stakeholders need a better way to promote/sell 3D-printed products | `⟨fill: I0x⟩` | `PB-08`, `PB-09`, `PB-10` | S6 (commercial source, weak) |
| Pain 3 — check-in/check-out needs staff and causes delays | `⟨fill: I0x⟩` | `PB-01`…`PB-05`, `PB-11`…`PB-15` | S1, S2, S3 in `secondary-review.md` |

`I01` is deliberately not in the column above: the owner's conversation happened **after** the demo and is
about how the built system behaved, which belongs to evaluation (`test/no-real-user-test.md`) rather than to
discovery. It is kept in this file because it is the same relationship and the same setting, and because the
reader fault it names is otherwise unrecorded.

**Heard but not built** — anything a conversation raised that no requirement covers. Put it here instead of
losing it: `⟨fill⟩`

## 6. What these records prove, and what they do not

**Prove:** that the pains in the backlog came from speaking to the people who have them, and which requirement
each one produced.

**Do not prove:** their frequency or size. Informal conversations carry selection bias (who happened to be
there), recall bias (notes written later), and no consent record beyond a verbal yes. That is why the numeric
claims in this project come from the 17-response survey and the test run — see `test/no-real-user-test.md` —
and why this file carries no percentages.

**If asked in Q&A, the honest answer is:** "we spoke to the owner, staff and customers informally, we did not
record or code those conversations, and what we took from them is the requirement list. The measured evidence
is the survey and the internal test run."
