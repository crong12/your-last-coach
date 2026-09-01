# Pane 3 — Coaching (specification)

- Decision ticket: [Specify Pane 3 — Coaching](https://github.com/crong12/your-last-coach/issues/49)
- Route: `#coaching`; adaptation review pushes `#adaptation/<id>`
- Inputs: map #43 locked remit; ADR 0001 (routes); #46 (full-push rule); PRODUCT.md principles
- Status: draft accepted for implementation; marked iteration points expected to move during build

## Purpose

The coaching relationship made visible: Athlete Feedback, proposed and approved Workout Adaptations, and the narrative connecting Feedback → Adaptations → subsequent Workout Results. This pane is where Athlete authority is exercised.

## Vertical order (mobile)

1. Awaiting-your-review card (conditional, pinned)
2. Coaching timeline
3. Athlete Profile summary card
4. (Demo chrome lives outside the pane — see below)

## 1. Awaiting-your-review card (pending proposals)

When one or more proposed Workout Adaptations are pending, a pinned card sits above the timeline:

- Eyebrow `AWAITING YOUR REVIEW` with a coral dot (the same attention semantics as everywhere).
- Proposal title, the Coach Agent's one-line rationale, timestamp, and its Coaching Evidence provenance line.
- Primary action **Review proposal** → pushes `#adaptation/<id>`.

Prominence comes from position and the pane's only coral accent — no notification chrome, no badges, no counts in the section nav, and no Today-chip echo. A published fallback proposal is application-owned and remains available through registration or page teardown until the Athlete decides, the persisted deadline expires, the Training Plan becomes stale, or the demo is reset. When nothing is pending the card does not exist.

## 2. Coaching timeline

**Form: a single vertical narrative stream**, newest first, with a hairline spine connecting entries. Rejected: separate event-stream tabs and grouping by Coaching Topic — one story, in order, matches the coaching-relationship framing; topic grouping can be revisited if volume ever demands it. ⚠️ _Iteration point: newest-first vs oldest-first reading order may flip after real use._

Entry types, each visually typed by eyebrow + icon, sharing one card grammar:

- **Athlete Feedback** — the Athlete's words, quoted, in editorial Newsreader; timestamp.
- **Coach Recommendation / proposed Workout Adaptation** — title, one-line rationale, status (proposed / approved / declined / superseded), link to its `#adaptation/<id>` record.
- **Approved Adaptation receipt** — what changed in the Training Plan, when, "approved by you".
- **Linked Workout Result** — the subsequent session evidence ("the workout this adaptation produced"), with **View workout** → `#workout/<id>`.

**Provenance is a first-class line on every non-Feedback entry** (roadmap's provenance-over-apparent-certainty): muted small text naming the exact Coaching Evidence consumed, e.g. `Based on: threshold Workout Result 26 Aug · your feedback 26 Aug · 7-night HRV trend`. Entries never claim certainty without naming sources; uncertainty phrasing from the Coach Agent is preserved verbatim.

**Threading**: related entries (feedback → proposal → decision → result) reference each other with quiet "↳ in response to" links that scroll to the referenced entry. No collapsible thread machinery in v1.

## 3. Adaptation review-and-approval flow

The old modal is retired. Review is a **pushed screen** (`#adaptation/<id>`, full-push per #46) — the product's most consequential act deserves a full page, and the back gesture safely leaves review without deciding.

Screen composition:

- Header: proposal title, proposed-at, Coach Agent attribution.
- **Plan-versus-proposed comparison**: the affected Planned Workout(s) side by side — current plan vs proposed change, differences highlighted (quiet ink for equal values, ochre/ember only where a change warrants attention semantics).
- Rationale block: the Coach Agent's full reasoning with its provenance line and uncertainty statement.
- Ranked alternatives when present (the demo proposes two ranked adaptations): the non-primary option rendered collapsed beneath.
- Decision bar (sticky at screen bottom): **Adapt my plan** (primary, coral) and **Keep current plan** (secondary). Explicit selection and tap are required; no option is selected by default. Approval pops back to Coaching with an Adaptation History receipt; keeping the current plan pops back with a durable declined timeline entry and no Training Plan mutation. `open_workout_adaptation_review` opens this same route; `read_workout_adaptation_decision` reads the explicit terminal result.

## 4. Context-rail dissolution (what moves, what dies)

The desktop context rail does not survive the pane structure:

- **Target Race card** → dies here; its content is the Today hero.
- **Athlete Profile card** → becomes a compact summary card at the bottom of this pane (name, goal framing, training availability, constraints) — it is coaching context, and the Coach Agent's briefing draws from it. Tap → expands inline (no pushed screen for v1). ⚠️ _Iteration point: may move behind a header affordance if the pane gets long._
- **Monitoring card** → lives here, paired with Recent training in a two-up row beneath the Coaching timeline. It was briefly assigned to Trends; both blocks are longitudinal coaching context rather than chart evidence, so Trends carries only the arrival strip and the charts. See [desktop-frame-and-trends-grid.md](desktop-frame-and-trends-grid.md).

## 5. Demo chrome placement

Demo Guide and Reset leave the coaching surface: they move to an overflow menu (`⋯`) in the top app bar (mobile) / sticky header (desktop), rendering as pushed screens or dialogs exactly as today. Demo chrome is workspace furniture, not coaching content — it must not sit inside any pane.

## Data prerequisites & degraded states

- All records are application-owned (per #45 this pane has no COROS prerequisite); linked Workout Results use COROS reads where connected.
- Empty timeline (fresh state): honest empty narrative — "No coaching activity yet" with one line explaining what will appear here.

## Accessibility & motion

- The timeline is a list with typed, fully-labelled entries; the pinned review card is announced first.
- The decision bar buttons carry explicit accessible names ("Adapt my plan: <proposal title>"). The pushed screen moves focus to its heading; Back and Escape leave the proposal undecided and restore the originating Coaching target.
- Reduced motion: push and disclosure transitions are cuts; no timeline entrance animations.

## Open iteration points

1. Timeline reading order (newest-first chosen provisionally).
2. Athlete Profile placement (bottom-of-pane vs header affordance).
3. Whether declined proposals stay in the timeline or collapse after 30 days.
