# Desktop frame and Trends grid — design spec

- Date: 2026-08-31
- Supersedes: the desktop clause of [dashboard-ia.md](dashboard-ia.md) §Structure (#46) — see [Reconciliation](#reconciliation-with-the-frozen-ia-spec)
- Surface specs affected: [pane-2-trends.md](pane-2-trends.md) (composition), [pane-1-today.md](pane-1-today.md) and [pane-3-coaching.md](pane-3-coaching.md) (frame only)
- Status: proposed

## Job and audience

The Athlete inspects training evidence on a desktop browser while a Coach Agent runs in a WebMCP host beside it. The host occupies roughly half the screen, so the workspace's primary target is a **viewport near 880 × 900**, not a full 1440px window. A full window is the generous case, never the design case.

Visitor mode: **Operate**. The Athlete is in a task — reading evidence to decide whether to trust a Coach Recommendation. Scanability and consistency outrank expression.

## Outcome and proof

Today the desktop rendering is an unadapted mobile layout: three panes stack vertically in one continuous scroll, `.trends-pane` is hard-capped at `min(900px, 100%)`, and every card is full-width in that column. Trends alone is ~4,800px tall with dead space either side.

Success:

1. Selecting Trends shows the Trends pane, not a scroll position within a three-pane document.
2. At the primary target the pane uses both axes — Trends fits in roughly two screens instead of five, and no horizontal space is wasted.
3. No control overlaps content at any scroll position.
4. Mobile (`≤760px`) renders exactly as it does today.

## Selected direction

**A persistent top-bar frame around a switched pane view.** The app bar carries the brand, the three pane tabs as labelled controls, the Coach Agent connection status, and the overflow menu. Below it, one pane at a time occupies the content region and lays its cards out on a responsive grid.

Rejected alternatives and why:

- **Slim left icon rail.** Costs ~64px of a width budget that is already the binding constraint, and icon-only wayfinding is worse than three plain words.
- **Persistent Today rail + switched detail.** Leaves ~540px for charts at the primary target — mobile density on a desktop screen — and breaks the three-equal-panes IA the Coach Agent navigates.
- **Single cockpit dashboard, no panes on desktop.** Most desktop-native, but it dissolves the `#today`/`#trends`/`#coaching` routes that WebMCP navigation depends on.

This direction preserves the incumbent visual world (DESIGN.md, The Coastal Training Journal) unchanged. It is a **refinement of layout, not a redesign of identity**: no new colors, fonts, radii, shadows, or motion. The type scale, card treatment, and chart language are as specified.

## Scope and boundaries

In scope:

- The shared frame: app bar tabs, switched pane rendering, the shared content measure, the pane title row.
- The full Trends desktop grid, including the section-header change and the pane-level provenance line.
- Rewriting the tests coupled to scroll-based desktop navigation.

Out of scope (inherit the frame, stay single-column until a follow-up):

- Desktop grids for Today and Coaching.
- Chart internals beyond plot height — no changes to series, annotations, gap convention, or the tap-to-inspect readout.
- Copy, other than the provenance consolidation specified below.
- Mobile layout, ordering, and behaviour.

Anti-goals:

- Do not introduce fluid/clamp typography for pane content. Product UI uses a fixed rem scale (Operate rule); the existing `clamp` on the countdown numeral and pane headings is the only fluid type and the pane heading's is being reduced, not re-tuned.
- Do not add motion. The switch is an honest cut, per DESIGN.md's motion budget.
- Do not fabricate continuity to fill a wider chart. Gaps stay gaps.

## Frame specification

### Breakpoints

The pane shell is governed by two boundaries only: `760` (mobile vs desktop) and `1180` (two vs three columns). The existing `620` and `1050` queries remain where they already govern component internals — the plan-week strip's column count, the context rail — and are not extended to shell concerns.

`DESIGN.md`'s `breakpoints: [620, 760, 1050]` frontmatter must gain `1180` as part of the implementation, so the declared tokens match the built layout.

| Range | Behaviour |
| --- | --- |
| `≤760px` | Mobile, unchanged: horizontal scroll-snap panes, pagination dots, single column. |
| `761–1179px` | **Primary target.** Switched view, two-column evidence grid. |
| `≥1180px` | Switched view, three-column evidence grid. |

The `761px` boundary is deliberately the existing mobile boundary, so exactly one media query governs which shell is active and there is no range where both apply.

### Measure

Replace the per-pane caps — `.trends-pane` `width: min(900px, 100%)`, `.pane-heading` `width: min(1080px, calc(100% - 36px))`, `.workspace--single` `width: min(1080px, 100%)` — with one shared wrapper:

```
.pane-body {
  width: min(1440px, 100% - 2 * clamp(20px, 3vw, 48px));
  margin-inline: auto;
}
```

All three panes use it, so they breathe identically. `1440px` is a readability ceiling for the generous case, not a target.

### App bar

The existing `banner` grows to carry the pane tabs. `.pane-nav` moves inside it and stops being `position: sticky` — the app bar itself is sticky, and becomes the only sticky element in the shell. Labels are always visible at `≥761px`; `.pane-nav__dot` remains mobile-only, as today.

Tabs are `role="tab"`-equivalent in behaviour but keep the current `button` + `aria-current="page"` markup, which already reads correctly and is asserted by existing tests.

### Pane title row

One row, ~64px, directly under the app bar:

- **Left:** the pane title in Newsreader at `section` (28px) — down from `hero` (`clamp(32px, 5vw, 48px)`) — with the pane subtitle beneath it as 12px `muted` Manrope.
- **Right:** pane-level controls. For Trends this is the `4w / 12w / Build` segmented toggle.

`.pane-heading`'s `clamp(48px, 7vw, 88px)` top padding drops to a fixed `28px`. Together with the smaller title this recovers ~120px of a ~900px viewport.

`.trends-range-control` loses `position: sticky` and `top: 12px` and becomes a static child of this row. This is the fix for the two overlapping floaters: both had no home, so both were pinned to the viewport. Giving each a home removes the collision rather than repositioning it.

Because the toggle is no longer sticky, it scrolls out of view on a long pane. That is acceptable at the primary target — post-change Trends is roughly two screens — and the alternative (a sticky toolbar) reintroduces the overlap class of bug. Revisit only if the pane grows.

### Switched pane rendering

At `≥761px`, render the selected pane and mark the other two `hidden`. `createPaneNavigation` already models this: `getSelectedPane()` and `selectPane()` exist and are already the source of truth. What changes is the shell, not the navigation contract.

Consequences:

- The desktop `scrollIntoView` path in `WorkspaceApp` (the `matchMedia("(max-width: 760px)")` false branch) is removed.
- The desktop scrollspy `IntersectionObserver` is removed. On mobile it stays.
- `PaneOriginReceipt.windowScrollY` keeps its meaning for pushed-screen return, but now records scroll *within* the selected pane. `paneScrollLeft` stays mobile-only. The receipt shape does not change, so persisted history state stays valid.
- Hash routing, `replaceState`/`pushState` semantics, deep-link restore, and the bare-URL → Today default are all unchanged. WebMCP navigation tools are unaffected.

Panes must stay mounted-but-hidden rather than unmounted, so that chart inspect state and scroll position survive a tab switch, and so `hidden` panes remain queryable by the WebMCP read tools.

## Trends composition

Reordered to read as a coach would ask it: **how am I arriving → why → what have I been doing → what is noted.** The six-stat summary currently sits near the bottom of the pane; promoting it to a strip under the title gives Trends the focal entry point it lacks, and removes the need for a separate card at the end.

### Two columns (761–1179px)

```
Trends                        [4w] [12w] [Build]
────────────────────────────────────────────────
 46%    1.33    7h22    55ms   52bpm   Unremark.
RECOV   LOAD    SLEEP   HRV    RHR     STRESS
────────────────────────────────────────────────
READINESS                     21 of 28 nights
┌──────────────────┐┌──────────────────┐
│ HRV       55 ms  ││ Resting HR 52bpm │
└──────────────────┘└──────────────────┘
┌────────────────────────────────────────┐
│ Sleep                        7h 22m    │
└────────────────────────────────────────┘
PERFORMANCE
┌────────────────────────────────────────┐
│ Weekly volume + Training Load  13.5 km │
└────────────────────────────────────────┘
┌──────────────────┐┌──────────────────┐
│ Pace vs HR       ││ Repeated sessions│
└──────────────────┘└──────────────────┘
LONGITUDINAL CONTEXT
┌──────────────────┐┌──────────────────┐
│ Monitoring       ││ Recent training  │
└──────────────────┘└──────────────────┘
```

### Three columns (≥1180px)

Readiness runs `HRV | Resting HR | Sleep` in one row. Weekly volume + Training Load spans two columns with Pace vs HR beside it. `Repeated sessions | Monitoring | Recent training` share the final row.

### Composition rules

1. **Arrival strip.** The six "How you're arriving" stats become one hairline-divided row spanning the full measure: Recovery, Load ratio, Sleep, HRV, Resting heart rate, Daily stress. At `761–1179px` it wraps to 3 × 2. The caution sentence ("Load and recovery support caution…") sits directly beneath it. The bottom "How you're arriving" card is **removed**, not duplicated.
2. **Group headers stop being cards.** "Readiness / 28 wake-up days" and "Performance / Workout Result aggregates" are currently full cards whose only content is a label. They become hairline section rules: small-caps Manrope eyebrow left, coverage caption right. This removes two card-sized blocks and reads as the journal's marginalia rather than dashboard chrome.
3. **Sleep spans both columns at narrow.** Three readiness charts do not divide into two columns. The bar chart gains most from width, so it takes the full row rather than leaving an orphan cell.
4. **Weekly volume + Training Load spans the full measure at narrow.** It is a two-panel chart (distance bars above, load line below); at ~410px the load line reads as decoration.
5. **Plot height rises from ~120px to 180–200px** in a ~410px-wide card, so a 28-point series stops being flattened. Cards in a row are equal height by grid default.
6. **Provenance consolidates.** The identical sentence "Source: seeded synthetic COROS-shaped observations" currently repeats on six cards, all visible at once in a grid. It becomes **one pane-level line in the Trends footer**. Cards whose provenance genuinely differs keep their own line: "Derived from your runs" (Pace vs HR) and "Aggregate-only comparison" (Repeated sessions). **Per-chart coverage captions are unchanged and stay verbatim** — "21 of 28 nights recorded", "26 of 28 nights recorded", "9 of 11 Workout Results with available load", "10 eligible Outdoor Run pairs · 1 missing a measure" — because those are per-series facts, not a shared source label. PRODUCT.md principle 3 (evidence with provenance) and DESIGN.md's coverage-caption requirement are both satisfied: nothing becomes less traceable, one duplicated sentence stops repeating.

## States and ranges

- **Data ranges** are fixed by the immutable `demo-athlete-v1` fixture: 28 wake-up days, 21–28 nights recorded per metric, 11 Workout Results of which 9 carry load, 10 eligible Outdoor Run pairs. The grid must hold at these counts and must not assume density that the fixture cannot supply.
- **Missing data** renders per the existing gap convention (broken lines, baseline dashes, "No recording" readouts). Wider charts must not interpolate.
- **Range toggle** states `4w / 12w / Build` all render in every layout; `Build` is the longest series and sets the widest x-domain.
- **Coach Agent connection** unavailable is the default state in a plain browser and must not disturb the frame.
- **Pushed screens** (`#workout/<id>`, `#adaptation/<id>`) stay full-viewport on both form factors and return to the origin pane with scroll restored.
- **Reduced motion** — nothing to disable, since the switch adds no transition.
- **Focus** — the 3px `#3f7e8a` / 3px offset outline applies to the tabs and the range toggle, non-negotiable. Hidden panes must not be focus-reachable.

## Verification

Existing tests coupled to scroll-based desktop navigation must be rewritten, not deleted:

- `e2e/pane-shell.spec.ts` — "desktop stacks sections and keeps the sticky section nav in sync" asserts `today.y < trends.y < coaching.y` at 1280×800 and that clicking a tab scrolls the pane to `top ≤ 150`. Replace with: at 1280×800 the selected pane is visible, the other two are `hidden`, the hash is correct, and `aria-current` tracks selection.
- `e2e/pane-shell.spec.ts` — "canonicalizes malformed routes and preserves selection across reload and resize" asserts a desktop bounding-box top after resize. Replace the desktop leg with a visibility assertion; keep the mobile `scrollLeft` leg as-is.
- `e2e/coaching-pane.spec.ts` — desktop `.pane-nav` assertions at lines ~573 and ~704 need to resolve against the app bar.
- `e2e/workout-screen.spec.ts` — `.workspace-panes` `scrollLeft` assertions are mobile-only and should keep passing; confirm they are not run at desktop viewports.

New coverage:

- Two-column and three-column Trends grids render at 880×900 and 1280×900 respectively, with no element overlapping another (the current floater bug, asserted directly).
- Mobile at 390×844 is unchanged: scroll-snap, dots visible, single column, original card order.
- The arrival strip renders once per pane, not twice.

Run the mechanical design detector over the changed UI once the work is complete:
`node .claude/skills/impeccable/scripts/detect.mjs --json src/ui/WorkspaceApp.tsx src/ui/charts/TrendsPane.tsx src/ui/styles.css`

## Reconciliation with the frozen IA spec

[dashboard-ia.md](dashboard-ia.md) §Structure currently reads:

> **Desktop**: the panes stack vertically as sections in a centered max-width column with a sticky scrollspy section nav; dots are mobile-only. (#46)

That clause is superseded by this spec. The reason it changes is a fact that was not true when #46 was decided: **WebMCP works on desktop only**, so the desktop rendering became the primary surface rather than an adaptation of the mobile one, and it is viewed beside an agent host rather than full-screen. Everything else in §Structure — pane order, hash routes, `replaceState`/`pushState` semantics, pushed-screen behaviour, demo chrome placement, and all five shared rules — is unchanged and still binding.

`dashboard-ia.md` must be edited as part of the implementation, not left contradicting this document. The resolution order it declares (umbrella → surface specs → ticket resolutions → ADRs) means the umbrella cannot be allowed to state the opposite of the built behaviour.

## Constraints and open decisions

Binding constraints:

- Client-only React/TypeScript/Vite; no server, no new runtime dependency.
- Rendering per ADR 0002: React-owned SVG, `d3-scale` + `d3-shape` only.
- Navigation per ADR 0001: hash routes, one navigation state serving both gestures and WebMCP tools.
- CONTEXT.md vocabulary verbatim in all UI copy — "Shared Coaching Workspace", "Athlete", "Coaching Evidence"; never "dashboard" or "user".
- DESIGN.md tokens are the only source of color, type, radius, and shadow values.
- The three-minute judging flow must keep working end to end.

A builder must not invent:

- Any new breakpoint beyond the three specified.
- Desktop grids for Today or Coaching (explicitly deferred).
- A sticky pane toolbar (explicitly rejected above).
- Chart aspect ratios outside the 180–200px plot-height range without measuring at 880px first.

Open, deferred deliberately:

- Whether Today and Coaching adopt two/three-column grids, and what those grids are. Follow-up, once the frame is proven on Trends.
- Whether the range toggle needs to become sticky if Trends later grows.
