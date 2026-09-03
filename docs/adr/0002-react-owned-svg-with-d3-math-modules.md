# ADR 0002: React-owned SVG with D3 math modules for charts

- Status: Accepted
- Date: 2026-08-30
- Decision ticket: [Choose and record the chart rendering approach](https://github.com/crong12/your-last-coach/issues/50)

## Context

The dashboard needs readiness and performance charts (daily HRV/RHR/sleep trends, weekly volume/load bars, per-lap bars) with a resolved, bespoke data-viz language (#47): strictly static charts, tap-to-inspect, gap-broken lines where measurements are missing, baseline dashes distinguishing missing from true zero, phase and adaptation annotations, and theming through the existing CSS design tokens. All charts draw ≤ ~90 points. The app is a client-only React 19/Vite SPA whose only runtime dependencies are React and two font packages; AGENTS.md requires stack choices to be recorded before adoption.

Candidates evaluated included hand-rolled SVG, full D3, D3 math modules with React SVG, visx, Recharts, Observable Plot, Chart.js, and uPlot.

Libraries that own the SVG or render to canvas would make the bespoke chart anatomy, CSS-token theming, accessibility, and DOM-level tests harder while adding substantially more runtime weight. Full D3 would also introduce imperative DOM ownership that conflicts with React. Hand-rolling every scale, tick, and gap-aware path would avoid a dependency but duplicate the error-prone mathematical work that the focused D3 modules already provide.

## Decision

Charts are rendered as **SVG owned by React**, with **`d3-scale` and `d3-shape` used as pure math libraries**:

- React components emit every SVG element (lines, bars, gridlines, labels, dashes, diamonds, flags). No library owns or manipulates the DOM.
- `d3-scale` supplies scales and "nice" tick generation; `d3-shape` supplies gap-aware path generation (`line().defined()`) and curve interpolation. Both are DOM-free.
- Colors, hairlines, and typography come from the CSS custom properties in `src/ui/styles.css`; semantic and series tokens per the #47 language.
- `d3-time-format` (~5 kB gz) is pre-approved if tick-label formatting outgrows `Intl.DateTimeFormat`.
- No other `d3-*` module — explicitly not `d3-selection`, `d3-axis`, or `d3-transition` — may be added without a new recorded decision.

## Consequences

- First runtime dependencies beyond React: two ISC-licensed math modules, ≤ ~21 kB gzipped combined before tree-shaking.
- The bespoke anatomy is ordinary JSX: no fighting a chart library's opinions, and design-token theming is direct.
- Static-chart and gesture-safety rules hold by construction — there is no library interaction machinery to conflict with the scroll-snap pane axis.
- Scales and path-building are pure functions unit-tested in Vitest without a DOM; rendered charts remain plain SVG assertable in Playwright.
- The team owns axis/annotation rendering code (the trade for total fidelity); tick _placement_ quality still comes from d3-scale.
- A future need for pan/zoom or very large series requires a new decision ticket rather than a quiet dependency upgrade.
