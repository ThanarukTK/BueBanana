# Discovery conversations — informal interviews

**Status:** the team held **informal, unstructured conversations** with the café (owner, staff, customers)
during the project. No recording, no formal consent form, no fixed question set, notes reconstructed after the
fact. This file records them **as what they are** and nothing more — an informal input that shaped the
backlog, not a research instrument.

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

## 3. Records

### I01 — `⟨fill: owner / staff / customer⟩`

- **When / where:** `⟨fill: ~date, place⟩`
- **How:** `⟨fill: informal chat, no notes, reconstructed when?⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:**
  - `⟨fill: pain 1⟩`
  - `⟨fill: pain 2⟩`
  - `⟨fill: pain 3⟩`
- **Verbatim:** `⟨fill: Thai⟩` — `⟨fill: translation⟩`
- **Maps to:** `⟨fill: PB-xx⟩`
- **Confidence:** `⟨fill⟩`

### I02 — `⟨fill: role⟩`

- **When / where:** `⟨fill⟩`
- **How:** `⟨fill⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:** `⟨fill⟩`
- **Verbatim:** `⟨fill⟩`
- **Maps to:** `⟨fill⟩`
- **Confidence:** `⟨fill⟩`

### I03 — `⟨fill: role⟩`

- **When / where:** `⟨fill⟩`
- **How:** `⟨fill⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:** `⟨fill⟩`
- **Verbatim:** `⟨fill⟩`
- **Maps to:** `⟨fill⟩`
- **Confidence:** `⟨fill⟩`

### I04 — `⟨fill: role⟩`

- **When / where:** `⟨fill⟩`
- **How:** `⟨fill⟩`
- **What we asked:** `⟨fill⟩`
- **What we heard:** `⟨fill⟩`
- **Verbatim:** `⟨fill⟩`
- **Maps to:** `⟨fill⟩`
- **Confidence:** `⟨fill⟩`

### I05 — `⟨fill: role⟩`

- **When / where:** `⟨fill⟩`
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
