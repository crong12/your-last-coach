# Chart rendering approach — research note

- Decision ticket: [Choose and record the chart rendering approach](https://github.com/crong12/your-last-coach/issues/50)
- Date: 2026-08-30
- Outcome: **React-owned SVG with D3 math modules (`d3-scale`, `d3-shape`) — D3 as math, not as DOM.** Recorded as [ADR 0002](../adr/0002-react-owned-svg-with-d3-math-modules.md).

## What the charts must do

From the resolved data-viz language ([#47](https://github.com/crong12/your-last-coach/issues/47)) and verified COROS granularity ([#45](coros-data-granularity.md)):

- Small data: every planned chart draws ≤ ~90 points (daily readiness trends, weekly bars, per-lap bars). No streaming, no thousands-of-points rendering problem.
- **Strictly static**: no pan, zoom, or drag-scrub (the pane axis owns horizontal drag, #46). Interaction is tap-to-inspect with a fixed readout. This removes the main value proposition of interactive charting libraries.
- **Bespoke anatomy**: inline y-labels above hairline gridlines, baseline dashes for missing measurements, coverage captions, phase-boundary hairlines with small-caps labels, coral diamond adaptation markers, race-day flag. Every one is a custom element a library would have to be fought into rendering.
- **Gap convention**: lines break at missing days; missing ≠ zero; no interpolation.
- **Token theming**: colors and hairlines come from the CSS custom properties in `src/ui/styles.css`.

## Candidates and evidence

Bundle sizes from the bundlephobia API, 2026-08-30 (minified + gzip):

| Candidate | Size (gz) | Verdict |
| --- | --- | --- |
| `d3-shape` 3.2.0 + `d3-scale` 4.0.2 | 5.5 kB + 15.6 kB (≤ ~21 kB before tree-shaking) | **Chosen** — pure math, DOM-free |
| Recharts 3.10.1 | 144.1 kB, 11 deps | Rejected — 7× weight; owns its DOM anatomy, so every bespoke element (inline labels, baseline dashes, diamonds) is a fight against the library |
| Observable Plot 0.6.17 | 125.0 kB | Rejected — same reasons; generates its own SVG, theming via options not tokens |
| Chart.js 4.5.1 | 66.8 kB | Rejected — canvas rendering: loses CSS-token theming, DOM-level Playwright assertions, and easy a11y; crisp 1 px hairlines are DPR-fiddly |
| uPlot | (lookup failed; ~12 kB published) | Rejected — canvas, imperative API, optimized for huge series we do not have |
| visx | n/a (many packages) | Rejected — React wrappers around the same d3 math; we need only the math, not another component family |
| Full `d3` | n/a (meta-package) | Rejected — `d3-selection`'s imperative DOM manipulation fights React's ownership of the tree; only the math modules are needed |
| Hand-rolled everything | 0 kB | Rejected — re-implements exactly the error-prone parts ("nice" tick generation, time-axis ticks, monotone curve interpolation, gap-aware path building) to save ~21 kB |

## Spike evidence

Throwaway Node spike (14 nights of HRV with 4 missing, the [#45](coros-data-granularity.md) reality):

- `line().defined(p => p.v != null)` emitted a path with **4 `M` segments — one per recorded run, no bridging across gaps**. The gap convention is a one-liner, not custom geometry.
- `scaleLinear().domain([50, 70]).nice().ticks(4)` → `[50, 55, 60, 65, 70]`; `scaleTime().ticks(5)` produced sensible date ticks. Tick quality — the hard part of hand-rolling — comes free.
- Both modules are DOM-free pure functions: no React 19 compatibility surface, unit-testable in Vitest/jsdom without rendering, and the React-rendered SVG stays fully assertable in Playwright.
- Installed footprint of both modules plus transitive deps: 2.0 MB in `node_modules` (build-time only; runtime cost is the ≤ ~21 kB above, less after tree-shaking since unused scale types and curve factories drop out).

## Fit against the ticket's criteria

1. **Fidelity to the data-viz language** — total: React renders every SVG node, so tokens apply as `var(--line)` etc., and bespoke marks (dashes, diamonds, flags, captions) are ordinary JSX.
2. **Mobile performance and gesture safety** — static SVG with ≤ 90 points renders in one pass; no library gesture handlers exist to conflict with the scroll-snap pane axis; tap-to-inspect is a plain pointer handler on widened hit areas.
3. **Bundle and dependency posture** — first runtime dependencies beyond React: two ISC-licensed, DOM-free math modules, ≤ ~21 kB gz combined. `d3-time-format` (~5 kB) is pre-approved if tick-label formatting outgrows `Intl.DateTimeFormat`.
4. **Testability** — scales/paths are pure functions (Vitest, no DOM needed); rendered charts are ordinary SVG in the DOM (Playwright selectors, visual assertions).

## Boundaries

- No other `d3-*` module (in particular `d3-selection`, `d3-axis`, `d3-transition`) without a new recorded decision — axes and annotations are React-rendered by design.
- If a future chart genuinely needs pan/zoom or thousands of points, that is a new decision ticket, not a quiet library upgrade.
