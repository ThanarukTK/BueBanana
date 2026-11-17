# Secondary review of the problem — **SECONDARY**

The rubric allows a secondary review of the problem when no real-user interviews exist. This is that review:
published research, open-access studies and public market data on the three pains the backlog is built from.
Every claim below carries a link, and every source is labelled with what it can and cannot support.

**Label: SECONDARY.** Nothing here is data the team collected. It is evidence that the *problem* is real and
already documented elsewhere — not evidence that it is true of this café. That distinction is stated again in
§5, and it is the reason the team's own survey (17 respondents) and the internal test run carry the outcome
claims in `test/no-real-user-test.md`, not this file.

**Method:** literature and public-data search, 2026-11-17, on four questions — (a) does waiting/staff-assisted
service cost a restaurant money, (b) do self-service kiosks measurably reduce queues, (c) what do customers
lose when self-service replaces staff, (d) is there a market for aftermarket board game accessories. Sources
were read in full or at abstract level; nothing is cited from a search-result snippet alone.

---

## 1. Pain 3 — check-in and check-out need staff, and that costs the café money

**Claim in `docs/planning/proposal.md`:** the current counter process requires staff assistance and causes
delays at busy periods.

### S1 — Waiting time has a measurable revenue cost

**De Vries, J., Roy, D., & De Koster, R. (2018).** *Worth the wait? How restaurant waiting time influences
customer behavior and revenue.* Journal of Operations Management, 63(1).
https://doi.org/10.1016/j.jom.2018.05.001

- Empirical base: **94,404 customers over 12 months** at one popular Indian restaurant, plus a simulation
  experiment built on those findings.
- Findings: longer waiting is associated with **reneging** (customers leaving), a **longer time until the
  customer returns**, and a **shorter dining duration**. In simulation, removing waiting entirely raised
  revenue by about **14.5 %**; halving it raised revenue about **4.8 %**.
- What it supports: the queue at the counter is not a cosmetic annoyance — it moves revenue. `PB-01`,
  `PB-02`, `PB-05`.
- Limits: one restaurant, one country, table-service context (not a per-hour café), and the mechanism studied
  is *seating* wait, not *billing* wait.

### S2 — Small restaurants have a narrow tolerance window, and staffing is the constraint

**Small Queuing Restaurant Sustainable Revenue Management** (2020). *Sustainability*, 12(8), 3477.
https://www.mdpi.com/2071-1050/12/8/3477 (open access)

- Observed a 50-seat small restaurant: average meal ~30 minutes, **~68 arrivals in the 12:00–13:00 peak**,
  service rate ~19 customers/hour with four staff. Survey of customers: the **satisfactory waiting time was
  8.67 minutes**, with unsatisfied and "very unsatisfied" bands beyond it.
- Findings: seat occupancy and waiting time trade off against each other; a table-mix strategy raised
  occupancy without expanding the room; the authors recommend managing the queue rather than raising prices,
  because customers switch when there is competition.
- What it supports: at peak the staff are the bottleneck and the tolerance window is minutes, not hours.
  `PB-03`, `PB-05`, and the case for moving the recording step off the counter.
- Limits: South Korean quick-service context, seating queue rather than a check-in/billing queue, and no
  self-service intervention was tested.

## 2. Pain 1 / 3 — self-service removes the queue, but changes what the customer experiences

### S3 — Adding self-service stations cuts waits in simulation

**Enhancing the overall customer experience through simulation of hybrid ordering system in fast-food
restaurants** (2025). *Journal of Foodservice Business Research* (online 2025-09-08).
https://doi.org/10.1080/29966892.2025.2553764

- Discrete-event simulation (FlexSim) of a hybrid kiosk + counter ordering system. The best configuration
  (3 kiosks : 3 counters) produced a **28.21 % reduction in average waiting time** across all customers and a
  **77.07 % reduction in average queue length**.
- What it supports: a self-service path can absorb peak demand without more staff. `PB-01`, `PB-02`, `PB-05`.
- Limits: simulation, fast-food ordering (not café session billing), and it optimises *ordering*, which is a
  simpler transaction than check-in/check-out with a bill attached.

### S4 — The counterpoint: self-service can reduce perceived hospitality

**Yang, Q., Goodsir, W., & Poulston, J. (2019).** *Automation of the fast-food industry: Gen Z perspectives
of self-service kiosks versus employee service.* Hospitality Insights, 3(2).
https://ojs.aut.ac.nz/hospitality-insights/article/view/66

- 16 semi-structured interviews with 18–24-year-olds from seven countries.
- Findings: kiosks improved satisfaction and removed the pressure of the counter, but **reduced perceptions of
  hospitableness**, and respondents noted the kiosk *felt* faster even when the process was not actually
  faster.
- What it supports: the design risk in `PB-06` is not "will people use it" but "will the café feel like it
  lost its host". It is the reason the system keeps a staff confirmation step rather than going fully
  self-service, and why the reader screen has to say what to do next.
- Limits: 16 young respondents, fast food, New Zealand — qualitative, not generalisable.

### S5 — Effort of use, not just speed, drives satisfaction

**Oh, Z. J., et al. (2026).** *Self-Service Kiosks and Customer Satisfaction in the Fast-Food Industry:
Evidence from India and Malaysia.* International Journal of Tourism and Hospitality in Asia Pasific, 9(3).
https://ejournal.aibpmjournals.com/index.php/IJTHAP/article/view/5081

- 206 respondents with prior kiosk experience. Waiting-time reduction and **ease of use** both significantly
  affected satisfaction (waiting time β = 0.049, p < .05; ease of use β = 0.150, p < .05).
- What it supports: usability work is not decoration — `PB-06`, and the survey finding that seven of
  seventeen respondents asked for clearer step-by-step guidance.
- Limits: convenience sample, self-report, single chain (McDonald's).

## 3. Pain 2 — stakeholders want a better way to promote 3D-printed products

### S6 — The aftermarket accessory market exists and is growing — **commercial source, treat with care**

**Dataintelo, *Board Game Accessories Market* (report CG-673132, 2025 base year).**
https://dataintelo.com/report/board-game-accessories-market

- Market size given as **$4.8 bn in 2025 → $9.6 bn by 2034 (8.1 % CAGR)**; storage/inserts ~16.8 % of value;
  board-game cafés stated as **> 5,000 venues worldwide in 2026**; the report names **3D-printing-as-a-service**
  and **NFC chips in tokens** as emerging product vectors.
- What it supports: `PB-08`, `PB-09`, `PB-10` — there is a paying market for printed inserts and accessories,
  and cafés are a natural place to show them.
- **Limits, stated plainly:** this is a vendor market report, not peer-reviewed research; the figures are
  modelled and unverifiable from the page, and the café count is unsourced. It is used only to justify keeping
  the product catalogue in the backlog, never as a number in the case study.

---

## 4. How the evidence maps to the requirements

| Requirement | Pain | Supported by | Strength |
|---|---|---|---|
| `PB-01` NFC check-in | 3 | S1, S3 | strong for the queue effect, indirect for NFC |
| `PB-02` NFC check-out | 3 | S1, S2 | strong for the cost of the queue |
| `PB-03` automatic timestamps | 3 | S1, S2 | indirect — a derived control, not a studied outcome |
| `PB-04` staff view of active sessions | 3 | S2 | indirect |
| `PB-05` reliability at peak | 3 | S1, S2, S3 | strong for why it matters, no load evidence for this build |
| `PB-06` usability / guidance | 1, 3 | S4, S5 | strong — and matched by our own survey's dominant theme |
| `PB-08`–`PB-10` product catalogue | 2 | S6 | weak source, kept deliberately |
| `PB-11`–`PB-15` group handling, staff admin | 3 | S2 (staff as constraint) | indirect, derived from the flow rather than from literature |

## 5. What this review does and does not prove

**Proves:** the three pains are documented problems in comparable settings — queues cost revenue (S1), a small
restaurant's tolerance is minutes and staff are the bottleneck (S2), self-service stations cut queues in
simulation (S3), self-service has a hospitality cost the design must answer (S4), and there is a market for
printed tabletop accessories (S6, weak source).

**Does not prove:** that this café has these problems at these magnitudes; that NFC is the right intervention
(no study here tests NFC check-in); that Thai customers behave like the Korean, Indian, Malaysian or New
Zealand samples; or anything about price sensitivity at Bue Banana.

**Why interviews would be better:** only the café's owner, staff and customers can say where their queue
actually forms, how long it is, and what they would accept. The team did hold informal conversations with the
café — recorded separately in `docs/planning/interviews.md` and labelled for what they are — and the survey
(n=17) is the only data with numbers behind it.

## 6. Sources not used, and why

- **Search-result summaries and blog aggregators** quoting market sizes without a publisher (e.g. "board game
  cafés grew 340 % since 2020") — unverifiable, so excluded.
- **General "waiting is bad" management literature** — true but too broad to tie to a requirement.
- Any source behind a paywall where only the abstract was readable is cited at abstract level and says so
  above (S1, S3).
