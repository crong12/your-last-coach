# Pane 2 — Trends (specification)

- Decision ticket: [Specify Pane 2 — Trends](https://github.com/crong12/your-last-coach/issues/51)
- Route: `#trends`
- Inputs: data-viz language (#47, binding), COROS granularity note (#45, binding prerequisites), ADR 0002 (rendering)
- Status: draft accepted for implementation; marked iteration points expected to move during build

## Purpose

Readiness and performance evidence over time — the shared Coaching Evidence the Athlete and Coach Agent both read. Every chart obeys the #47 language: static, tap-to-inspect, gap-honest, token-themed, rendered per ADR 0002.

## Pane-level range

The visible pane is fixed to **4w**, shown by a single 4w control at the top of the pane. The former 12w and Build choices did not add enough value to justify their UI. All charts share the four-week range; charts whose semantics are inherently weekly (volume/load) interpret it as the last four plan weeks. The projection layer may retain longer ranges for future use, but they are not reachable from this surface.

## Vertical order (mobile)

**Readiness group** (top — it changes daily and gates today's decisions):

1. **HRV** — line chart. Top slot: it is the leading readiness signal and the Coach Agent's primary overnight evidence.
2. **Resting heart rate** — line chart.
3. **Sleep** — bar chart (duration), with stage ratios shown only in the inspect readout (not stacked bars — too dense at 4w on a phone). ⚠️ _Iteration point: stacked stage bars may return at 4w range if legible._

**Performance group:**

4. **Weekly volume + Training Load** — one card, two aligned charts sharing an x-axis: distance bars above, per-week load bars with a 4-week average line below. Load values aggregate per-Workout-Result `Training Load` (per #45, `queryTrainingLoadAssessment` returning `Unknown` is treated as unavailable, never zero).
5. **Pace vs heart rate** — derived scatter/trend of per-workout average pace against average HR, like-for-like Outdoor Runs only. Labelled "derived from your runs" — never implied to be a native COROS efficiency score (#45).

## Chart card anatomy (all charts)

Header row per #47 scannability requirement, so the pane reads without studying any chart:

- Metric name in the shared Newsreader heading treatment · **current value** (large, tabular) · a rolling average where it provides useful context. Visible trend labels are omitted because labels such as "flat versus recorded nights" and "neutral direction" were not clear enough to earn header space; trend direction remains in the accessible chart summary.
- Chart body per #47 anatomy (hairline gridlines, inline y-labels, sparse x-ticks).
- Coverage caption when gaps exist in range ("21 of 28 nights recorded").
- Tap-to-inspect fixed readout row above the chart; on a missing day it reads "No recording".

## Gap convention application (per #47/#45)

- HRV and RHR: broken lines at missing wake-up days; isolated points render as dots. Source dates are wake-up days (#45).
- Sleep: missing night = no bar + baseline dash (`--line`). A present date block without sleep metrics (the observed COROS shape) **is** a missing night — never zero hours.
- Volume/load: a week with no Workout Results is a true zero (clean zero bar, no dash) — rest weeks are real; a week with unsynced/absent data cannot be distinguished at source and is rendered as zero with the coverage caption carrying the honesty. ⚠️ _Iteration point: revisit if a sync-state signal becomes available._
- Rolling averages declare their basis ("7-night avg, recorded nights").

## Annotations

Time-axis annotations per #47 on HRV, RHR, volume/load: phase-boundary hairlines with small-caps labels and coral diamonds for approved Workout Adaptations (tap → inspect readout → "View adaptation" deep link). Race-day annotations remain supported by the projection layer but are outside the visible four-week range.

## Push interactions

- Charts are inline and never navigate on their own. The Pace-vs-HR inspect readout includes **View workout** → `#workout/<id>`.

## Degraded states (per #45 prerequisites)

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
