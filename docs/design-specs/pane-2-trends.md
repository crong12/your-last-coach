# Pane 2 — Trends (specification)

- Decision ticket: [Specify Pane 2 — Trends](https://github.com/crong12/your-last-coach/issues/51)
- Route: `#trends`
- Inputs: data-viz language (#47, binding), COROS granularity note (#45, binding prerequisites), ADR 0002 (rendering)
- Status: draft accepted for implementation; marked iteration points expected to move during build

## Purpose

Readiness and performance evidence over time — the shared Coaching Evidence the Athlete and Coach Agent both read. Every chart obeys the #47 language: static, tap-to-inspect, gap-honest, token-themed, rendered per ADR 0002.

## Pane-level range control

One segmented toggle at the top of the pane: **4w / 12w / Build** (Build = the whole training build to date, terminating at the race-day flag). Default **4w**. The range is **linked across all charts** — one mental model, one control; per-chart ranges are rejected as fiddly on a phone. Charts whose semantics are inherently weekly (volume/load) interpret the range as "last 4/12/all plan weeks".

## Vertical order (mobile)

**Readiness group** (top — it changes daily and gates today's decisions):

1. **HRV** — line chart. Top slot: it is the leading readiness signal and the Coach Agent's primary overnight evidence.
2. **Resting heart rate** — line chart.
3. **Sleep** — bar chart (duration), with stage ratios shown only in the inspect readout (not stacked bars — too dense at 4w on a phone). ⚠️ *Iteration point: stacked stage bars may return at 4w range if legible.*

**Performance group:**

4. **Weekly volume + Training Load** — one card, two aligned charts sharing an x-axis: distance bars above, per-week load bars with a 4-week average line below. Load values aggregate per-Workout-Result `Training Load` (per #45, `queryTrainingLoadAssessment` returning `Unknown` is treated as unavailable, never zero).
5. **Pace vs heart rate** — derived scatter/trend of per-workout average pace against average HR, like-for-like Outdoor Runs only. Labelled "derived from your runs" — never implied to be a native COROS efficiency score (#45).
6. **Repeated sessions** — entry-point card, not a chart (see below).

## Chart card anatomy (all charts)

Header row per #47 scannability requirement, so the pane reads without studying any chart:

- Metric name (small caps) · **current value** (large, tabular) · rolling average (muted, e.g. "7-night avg 62") · trend arrow (up/down/flat vs the rolling average). Trend arrows are neutral ink by default; ochre/ember only when the direction is a genuine warn/bad per metric semantics (e.g. RHR climbing) — good is quiet, so favorable trends do not get colored.
- Chart body per #47 anatomy (hairline gridlines, inline y-labels, sparse x-ticks).
- Coverage caption when gaps exist in range ("21 of 28 nights recorded").
- Tap-to-inspect fixed readout row above the chart; on a missing day it reads "No recording".

## Gap convention application (per #47/#45)

- HRV and RHR: broken lines at missing wake-up days; isolated points render as dots. Source dates are wake-up days (#45).
- Sleep: missing night = no bar + baseline dash (`--line`). A present date block without sleep metrics (the observed COROS shape) **is** a missing night — never zero hours.
- Volume/load: a week with no Workout Results is a true zero (clean zero bar, no dash) — rest weeks are real; a week with unsynced/absent data cannot be distinguished at source and is rendered as zero with the coverage caption carrying the honesty. ⚠️ *Iteration point: revisit if a sync-state signal becomes available.*
- Rolling averages declare their basis ("7-night avg, recorded nights").

## Annotations

Time-axis annotations per #47 on HRV, RHR, volume/load: phase-boundary hairlines with small-caps labels; coral diamonds for approved Workout Adaptations (tap → inspect readout → "View adaptation" deep link); race-day flag terminates Build range.

## Push interactions

- Charts are inline and never navigate on their own. Two explicit push paths:
  - Pace-vs-HR inspect readout includes **View workout** → `#workout/<id>`.
  - **Repeated sessions** card → pushes the workout detail of the most recent session of a comparable group, where the comparison lives (per the workout-detail spec). The card lists comparable session groups (e.g. "Threshold 6×1km — 4 attempts") with last-attempt summary. Comparison rendering itself does not live on this pane.

## Degraded states (per #45 prerequisites)

- **Repeated sessions**: cross-workout split comparison is a **flagged prerequisite** (FIT ingestion unverified). The card renders group summaries from per-workout aggregates (supported) and the detail screen labels split-by-split comparison as conditional. Nothing split-level is promised on this pane.
- Any readiness chart with zero recorded values in range: chart body is replaced by an honest empty state ("No recorded nights in this range"), header shows "—".
- Demo fixture renders all charts fully (synthetic data is complete enough); each chart's data prerequisite is recorded here per PRODUCT.md principle 5.

## Accessibility & motion

- Every chart has a text summary in the accessible name (metric, current value, trend, coverage).
- Inspect readout is a live region; tap targets ≥ 44 px effective.
- Reduced motion: no draw-in animations; range switches are cuts.

## Open iteration points

1. Sleep stage presentation (readout-only vs stacked bars at 4w).
2. Whether volume and load merge into one combined chart after visual testing.
3. Trend-arrow semantic thresholds per metric (what counts as "climbing RHR").
