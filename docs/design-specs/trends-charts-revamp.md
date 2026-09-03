# Trends charts revamp — design spec

- Status: accepted for implementation (owner-approved in session; no implementation tickets per owner)
- Amends: [pane-2-trends.md](pane-2-trends.md) (chart card anatomy, sleep stage presentation, open iteration points)
- Binding inputs: data-viz language ([#47 resolution](https://github.com/crong12/your-last-coach/issues/47)), COROS granularity (#45), ADR 0002 (rendering), [desktop-frame-and-trends-grid.md](desktop-frame-and-trends-grid.md) (desktop is the primary surface), [screen-workout-detail.md](screen-workout-detail.md) (interaction precedent)

## Purpose

The five Trends charts render, but they answer "what happened?" without answering the athlete's real questions: *am I in my normal range, am I ramping too fast, am I getting fitter?* This revamp ports the workout-detail chart craft (real axes, legible type, rich inspection) to Trends and adds the derived context each chart needs to be decision-useful — without fabricating data or scores (#45).

Everything below stays inside the #47 language: quiet series colors (`deep-sea` primary, `sea` secondary), ochre/ember only for deviations and never color-only, hairline gridlines with inline y-labels, tap-to-inspect readout as the interaction baseline, gap conventions unchanged.

## Shared changes (all five charts)

1. **Interaction kit ported from the workout detail chart.** Hover/focus tooltips and linked highlights are first-class on desktop (owner relaxed #47's "tap, not tooltip" ruling for this revamp). Tap/keyboard select still updates the fixed aria-live readout row — it remains the accessibility and mobile baseline, but tooltips no longer need to justify themselves as a mere enhancement. Hit areas become full-height column bands partitioning the plot (every pointer x resolves to the nearest point), ≥ 44px effective.
2. **Axis treatment.** Every plot gets legible ticks: 2–4 horizontal hairlines with inline y-labels (muted, `tabular-nums`) per #47 anatomy, and x-tick labels at a consistent, readable type size. The current microscopic tick text (readiness charts) and the missing tick labels (volume/load, pace axis) are both defects against #47's own anatomy rules; this fixes them uniformly. SVG viewBox/type-scale must render tick text at ≥ the workout chart's effective size at the 880×900 primary viewport.
3. **Direction hints.** Each plot carries a muted caption in the workout-chart style: metric · unit · direction (e.g. "HRV · ms · higher ↑", "Resting HR · bpm · lower ↓", "Pace · min/km · faster →"). This is the only place polarity is stated; headers stay quiet.
4. **Space.** Plots own more of their card: reduce header/readout dead space so the plot area (not chrome) dominates, especially Pace vs HR. No fixed pixel mandate — the acceptance bar is that no card shows more empty canvas than plotted data at the primary viewport.
5. **Derived aggregates declare their basis** in the caption/readout, per #47 ("7-day avg, recorded days"; "28-day baseline, recorded days"; "fit across runs in range").

## 1–2. HRV and Resting heart rate — personal baseline context

The raw daily line stays but stops being the protagonist.

- **Primary series: 7-day rolling average** (`deep-sea` line). Computed per day over recorded values in the trailing 7 days; drawn only where ≥ 4 of the trailing 7 days are recorded — otherwise the average line breaks (the #47 gap convention extends to derived series; a "7-day avg" of one reading is fabrication).
- **Daily values demote to quiet dots** (`sea`, small). Gaps per existing convention: no dot, no bridging.
- **Personal baseline band:** shaded soft band (`sea` at low opacity) spanning mean ± 1 SD of recorded values over the trailing 28 days ending at the range end. Rendered only when ≥ 7 recorded values exist in that window; otherwise omitted and the caption says "baseline unavailable (fewer than 7 recorded days)".
- **Header:** current value stays large; the average slot becomes the **baseline delta** — e.g. `55 ms · +4 vs 28d baseline`. This amends pane-2-trends.md's "no trend labels" ruling: that decision rejected *vague adjectives* ("flat versus recorded nights"); a signed numeric deviation against a declared basis is a different object and earns the space.
- **Deviation semantics (resolves iteration point 3 for these charts):** the threshold for "notable" is *outside the personal band* — no magic universal numbers. HRV below band-bottom, or RHR above band-top → header delta renders in ochre with a glyph and label ("▼ below baseline range" / "▲ above baseline range"). Inside the band, everything stays quiet (good is quiet). Ember is reserved and unused here for now.
- Phase-boundary and adaptation annotations unchanged.

## 3. Sleep — readable durations, honest reference, stages in the bars

- **Y-axis in h:mm.** Ticks format as `7:30`, not raw minutes, per #47 numeric typography.
- **Reference line: 28-day average** of recorded nights (muted hairline, inline label "28d avg, recorded nights"). Explicitly *not* an invented sleep goal — no target exists in the domain and fabricating one would break data-honesty. If a sleep-target concept ever enters the domain, it replaces this line.
- **Stacked stage segments (resolves iteration point 1: stacked bars return).** Each night's bar subdivides into deep / light / REM / awake using an opacity ramp of the series colors (deep = `deep-sea`, light = `sea`, REM = soft variant, awake = hollow with hairline) — no new hues, never color-only: exact stage ratios stay in the inspect readout, which remains the numeric source of truth. Rationale for reopening the "too dense on a phone" ruling: desktop (≈880×900) is now the primary surface per the desktop-frame spec, and vertical stacking within a bar does not add horizontal density. ⚠️ _Iteration point: if segments are illegible at mobile bar widths (~9px), mobile falls back to plain duration bars; readout unchanged._
- **Missing nights** keep the baseline-dash convention (verify it actually renders; today gaps just vanish).
- Header: current night duration (h:mm) · 7-night avg (recorded nights) as today.

## 4. Weekly volume + Training Load — readable without clicking, ramp rate

Keeps two aligned facets sharing the x-axis (**resolves iteration point 2: no merge** — distance and load have incompatible scales and the aligned pair reads well once axes exist).

- **Inline y-labels on both facets** (km; load) per #47 anatomy — currently absent entirely.
- **X-label every week** (4 weeks = 4 labels; no reason to elide).
- **Value labels above distance bars** (muted, tabular, one decimal km). Four bars leave ample room.
- **4-week average line gets an inline end label** ("4-wk avg load") instead of relying on prior knowledge; declared basis unchanged ("available loads only").
- **Ramp rate in header and readout:** the header's context slot shows the signed week-over-week distance change — e.g. `13.0 km · −62% vs last week`. Neutral rendering only; no semantic ochre/ember thresholds yet (universal ramp heuristics like "+10%" are coaching folklore, not personal evidence — iteration point 3 remains open for this chart).
- **Gap conventions unchanged** from pane-2-trends.md: result-less week = true zero bar; distance-present but load-unavailable week = baseline dash on the load facet only.
- Adaptation diamonds and phase hairlines unchanged.

## 5. Pace vs heart rate — a scatter with time in it

Stays a scatter (the "aerobic efficiency over time" line rework was considered and **deferred** — bigger scope, recorded below). Same like-for-like Outdoor-Runs-only filter and "derived from your runs" labelling (#45).

- **Pace ticks on the x-axis** in `m:ss` (per #47 typography), reversed axis retained with the "faster →" hint. Today the axis has no values at all — every point is unreadable.
- **Recency encoding:** point opacity ramps by date (oldest ≈ 35% → newest 100%, `deep-sea`), newest point additionally ringed. Opacity is not carrying good/bad semantics, so this does not violate never-color-only; the readout carries the exact date.
- **Fit line:** OLS fit of HR on pace across in-range points, rendered as a dashed muted `sea` line only when ≥ 6 points exist; caption "fit across runs in range". Dashing marks it visually as derived, per the gap-convention spirit. New points landing below the line = better economy; the accessible summary states the relationship direction in words.
- **Readout gains the workout type** alongside the existing title/date/pace/HR and keeps **View workout** → `#workout/<id>`. ⚠️ _Iteration point: visual type encoding (shape per workout type) deferred until the recency+fit version is assessed — three encodings on one scatter risks clutter._

## Resolved / updated decisions in pane-2-trends.md

| pane-2-trends.md item | Resolution here |
| --- | --- |
| Iteration point 1 (sleep stages) | Stacked stage segments adopted at 4w; mobile fallback noted |
| Iteration point 2 (merge volume+load) | Keep two aligned facets; merge rejected |
| Iteration point 3 (trend thresholds) | HRV/RHR: outside personal 28d band = ochre warn. Sleep/volume: still open |
| "Visible trend labels are omitted" | Amended: numeric deltas with declared basis allowed in the header average slot (HRV/RHR baseline delta, volume ramp %) |
| Tap-to-inspect only | Unchanged as baseline; hover/focus tooltip + highlight added as progressive enhancement, matching screen-workout-detail.md |

## Deferred / out of scope

- Aerobic-efficiency-over-time line chart (replacement for the scatter) — revisit after the upgraded scatter is lived with.
- Visual workout-type encoding on the scatter.
- Semantic ramp-rate thresholds on volume.
- Any range beyond the fixed 4w pane range; any new domain concepts (sleep targets, readiness scores).

## Verification expectations

- Existing unit (`tests/trends.test.ts`) and e2e (`e2e/trends-pane.spec.ts`, `e2e/hrv-chart.spec.ts`) suites updated alongside, not deleted.
- New derived series (rolling average, baseline band, ramp %, OLS fit) get unit coverage in the projection layer (`src/application/trends.ts`), including gap behaviour (average line breaks, band omitted under 7 recorded values, fit hidden under 6 points).
- Gap honesty is a test, not a hope: missing sleep night renders a baseline dash; load-unavailable week dashes only the load facet.
