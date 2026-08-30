# Dashboard IA — consolidated specification

- Consolidation ticket: [Consolidate the dashboard IA spec and cut implementation issues](https://github.com/crong12/your-last-coach/issues/53)
- Map: [Wayfinder: Design system and dashboard IA for the athlete dashboard](https://github.com/crong12/your-last-coach/issues/43)
- Status: **frozen** on merge; per-surface iteration points remain open by design and are listed in each surface spec

This document is the umbrella: it fixes the structure, routes, and shared rules, and delegates surface detail to the four surface specs. Where documents conflict, the resolution order is: this spec → surface specs → ticket resolutions → ADRs for their own subjects.

## Structure

One Shared Coaching Workspace, three page-level panes plus pushed screens:

| Surface | Route | Spec |
| --- | --- | --- |
| Pane 1 — Today | `#today` (default) | [pane-1-today.md](pane-1-today.md) |
| Pane 2 — Trends | `#trends` | [pane-2-trends.md](pane-2-trends.md) |
| Pane 3 — Coaching | `#coaching` | [pane-3-coaching.md](pane-3-coaching.md) |
| Workout detail (pushed) | `#workout/<id>` | [screen-workout-detail.md](screen-workout-detail.md) |
| Adaptation review (pushed) | `#adaptation/<id>` | [pane-3-coaching.md §3](pane-3-coaching.md) |

- **Mobile**: horizontal scroll-snap panes with pagination dots; pane order Today · Trends · Coaching.
- **Desktop**: the panes stack vertically as sections in a centered max-width column with a sticky scrollspy section nav; dots are mobile-only. (#46)
- **Navigation**: hash routes; pane changes `replaceState`, pushed screens `pushState`; deep links restore; bare URL → Today. One navigation state serves gestures and WebMCP tools. ([ADR 0001](../adr/0001-hash-based-navigation-without-a-router.md))
- **Pushed screens**: full-viewport on both form factors; back always pops to origin pane/scroll position. (#46)
- **Adaptation review**: pending proposals and declined decisions stay in the Coaching surface; this slice adds no Today notification chip or section-nav count.
- **Demo chrome** (Demo Guide, Reset): overflow menu in the app bar/header — never inside a pane. (#49)
- The incumbent context rail dissolves: Target Race → Today hero; Athlete Profile → Coaching pane summary card; Monitoring card is superseded by Trends. (#49)

## Shared rules (binding on all surfaces)

1. **Data-viz language** (#47): "good is quiet" semantics (series deep-sea/sea; coral = attention; warn = ochre, bad = ember, + soft variants; never color-only); phone-first anatomy (hairline horizontal grid, inline y-labels, tap-to-inspect fixed readout); **charts strictly static** — range changes via segmented toggle only; tabular Manrope numerals, Newsreader never for data.
2. **Gap convention** (#47/#45): broken lines at missing measurements; baseline dash = missing vs clean true zero; coverage captions; "No recording" readouts; declared-basis aggregates. Missing is never fabricated.
3. **Annotations** (#47): phase-boundary hairlines with small-caps labels; coral diamonds for approved Workout Adaptations only (tap → deep link); race-day flag.
4. **Rendering** ([ADR 0002](../adr/0002-react-owned-svg-with-d3-math-modules.md)): React-owned SVG; `d3-scale` + `d3-shape` as DOM-free math; no other `d3-*` module without a new recorded decision.
5. **Language**: [CONTEXT.md](../../CONTEXT.md) terms verbatim in all UI copy; [PRODUCT.md](../../PRODUCT.md) principles bind (notably: evidence with provenance; design for the roadmap product, render with the demo fixture).

## Visualizations and their verified data prerequisites (#45)

| Visualization | Surface | Prerequisite (per [COROS granularity note](../research/coros-data-granularity.md)) | Status |
| --- | --- | --- | --- |
| Phase-segmented build progress | Today hero | Training Plan records only | Supported |
| HRV trend | Trends | Daily wake-up HRV reads | Supported (gaps real) |
| Resting HR trend | Trends | Daily RHR reads | Supported (gaps real) |
| Sleep bars | Trends | Nightly sleep blocks; absent metrics = missing night | Supported (gaps real) |
| Weekly volume + Training Load | Trends | Per-workout aggregates; `Unknown` load = unavailable | Supported |
| Pace vs HR trend | Trends | Per-workout averages, like-for-like Outdoor Runs; labelled "derived" | Supported |
| Per-lap bars + splits | Workout detail | `queryActivityLapData`, normalized 1 km lap group | Supported |
| Repeated-session aggregate comparison | Workout detail | Per-workout aggregates | Supported |
| Repeated-session split-by-split overlay | Workout detail | **Verified FIT ingestion** | **Conditional — do not build for real data until verified** |

## Reconciliations recorded at consolidation

1. **PRODUCT.md verification**: complete and internally consistent as the product-truth artifact per the #44 split; this ticket's original wording ("PRODUCT.md = visual world + data-viz language") is superseded by that resolution. The visual world lands in **DESIGN.md**, whose creation is owned by the first implementation issue cut from this spec.
2. **Trends range toggle naming**: #47 used "4w / 12w / Race" as an example; the Trends spec fixes **4w / 12w / Build** (Build = whole training build, terminating at the race-day flag). The Trends spec wording governs.
3. **Coral countdown numeral**: product-accent use of coral on the Today hero is provisional (owner deferred the call); recorded as an iteration point in the Today spec, not a conflict with #47's chart-scoped semantics.

## Implementation sequencing (foundation before surfaces)

The implementation issues cut from this spec are sequenced so shared foundations land first:

1. DESIGN.md + design tokens (new semantic tokens, numeric typography) — unblocks everything visual.
2. Pane shell + hash navigation (scroll-snap, dots, desktop stack, section nav, ADR 0001 routing).
3. Pushed-screen mechanism + workout detail (planned composition).
4. Pane 1 — Today.
5. Chart foundation (ADR 0002 dependencies + shared chart primitives, proven on the HRV chart).
6. Pane 2 — Trends (remaining charts + linked range toggle).
7. Pane 3 — Coaching (timeline, awaiting-review card, profile card, demo-chrome relocation).
8. Adaptation review pushed screen (durable proposal lifecycle, full-push UI, WebMCP).
9. Workout detail — completed composition (per-lap chart, plan-vs-actual, comparison, feedback).

Each issue is a demoable vertical slice, links this spec as parent, declares its blockers, and carries `enhancement` + `ready-for-agent`.
