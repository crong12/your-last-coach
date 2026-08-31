# Workout detail — pushed screen (specification)

- Decision ticket: [Specify the workout detail pushed screen](https://github.com/crong12/your-last-coach/issues/52)
- Route: `#workout/<id>` (pushed per ADR 0001; full-viewport per #46)
- Inputs: #45 granularity (per-lap supported; cross-workout splits conditional), #47 viz language, ADR 0002
- Status: draft accepted for implementation; marked iteration points expected to move during build

## Purpose

Everything about one workout — planned or completed — one push away from any reference to it. One route, two compositions selected by workout state.

## Entry points and back behavior

Entered from: Today's workout card, week-strip tiles, Trends (pace-vs-HR inspect readout, repeated-sessions card), Coaching timeline (linked Workout Results), and the Coach Agent (WebMCP flows referencing a workout). Per #46: `pushState` on entry; browser/OS back or the on-screen ← pops to the exact origin (pane + scroll position on mobile, scroll position on desktop). The screen never cares where it came from — history does.

## Composition A — planned workout

1. **Header**: ← back, workout title, planned date, type chips (e.g. Quality · Threshold), status `PLANNED`.
2. **Coach's intent**: short editorial paragraph (Newsreader) — why this session exists in the plan, from the Planned Workout record. Provenance line if the intent came from an approved Workout Adaptation ("Adjusted 26 Aug — view adaptation" → `#adaptation/<id>`).
3. **Structure blocks**: warm-up / main set / cool-down as labelled rows with target values (pace range, reps, recoveries) in tabular numerals.
4. **Targets table**: consolidated label/value rows — target pace, effort/HR guidance, planned distance/duration, recovery protocol.
5. **Previous attempts** (conditional): if comparable past sessions exist, the comparison section (below) renders here too — seeing your last attempt before running is the point.

## Composition B — completed workout

1. **Header**: as above with actual date, status `COMPLETED`.
2. **Stat row**: distance · time · average pace · average HR, large tabular numerals (fields verified in #45 `getActivityDetail`). Training Load is omitted because an unexplained raw score is not useful to the Athlete.
3. **Plan versus actual**: when a Planned Workout backs this Workout Result — rows comparing target vs actual (pace, distance/duration, effort). Deltas rendered quietly in ink; ochre only where the miss is coaching-relevant (per metric semantics), never shame-red. Unplanned runs omit this block.
4. **Per-lap chart**: vertical bars, one per normalized 1 km lap group (per #45; prefer the appropriate lap group — aggregate rows may lack fields), bar height = pace (faster = taller), average-HR dot overlaid per lap with a connecting hairline. Tap-to-inspect per #47 (readout: lap n, pace, avg/max HR). Static, token-themed, ADR 0002 rendering. ⚠️ _Iteration point: pace-as-height polarity (faster=taller) must be validated for legibility; the inverse may read better._
5. **Splits table**: collapsible "Splits" section under the chart — exact per-lap rows (lap, distance, pace, avg HR, max HR). The chart gives shape; the table gives numbers.
6. **Previous attempts** (comparison section — see below).
7. **Athlete Feedback** (see below).

## Repeated-session comparison (lives here, not on Trends)

Pane 2 only lists comparable groups and links in; the comparison itself renders on this screen:

- **Supported now** (per #45, per-workout aggregates): "Previous attempts" — compact rows of the same session type (date, distance, avg pace, avg HR) with delta vs this attempt; tapping a row pushes that workout's own detail (`pushState` again — back walks correctly). Training Load remains a contextualized Trends aggregate only and is not shown on Workout Details.
- **Conditional** (per #45, flagged prerequisite): split-by-split overlay across attempts requires verified FIT ingestion. Until then this renders in demo mode from synthetic laps with its data prerequisite recorded, and is omitted for real data. Never fabricate cross-workout splits from unverifiable sources.

## Athlete Feedback on this workout

- Existing Feedback entries attached to this workout render as quoted cards (Newsreader, timestamp) — the same grammar as the Coaching timeline.
- **Add feedback**: a single affordance opening an inline text field; submission writes through the same application action the WebMCP `record_athlete_feedback` tool uses (one state, two authors — Athlete via UI, Coach Agent via tool). New feedback appears in the Coaching timeline automatically.

## Data prerequisites & degraded states

- Per-lap chart and splits: `queryActivityLapData` (supported, #45). If lap data is absent for a completed workout: stat row + plan-vs-actual only, honest note "No lap data recorded".
- Missing HR on laps: pace bars render without the HR overlay; readout says "No HR recorded".
- Cross-workout splits: conditional as above.

## Accessibility & motion

- Screen title announced on push; ← carries "Back to <pane>" accessible name.
- Per-lap chart has a text summary (n laps, fastest/slowest, HR range); splits table is the accessible equivalent of the chart.
- Reduced motion: push/pop are cuts (per #46).

## Open iteration points

1. Pace-bar polarity (faster = taller vs shorter).
2. Whether "Previous attempts" defaults open or collapsed on completed workouts.
3. Feedback entry affordance placement (bottom of screen vs header action).
