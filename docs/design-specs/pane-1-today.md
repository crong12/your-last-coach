# Pane 1 — Today (specification)

- Decision ticket: [Specify Pane 1 — Today](https://github.com/crong12/your-last-coach/issues/48)
- Route: `#today` (default pane; bare URL lands here per ADR 0001)
- Inputs: map #43 locked contents; ADR 0001/0002; data-viz language (#47); concept explorations A/B
- Status: draft accepted for implementation; marked iteration points expected to move during build

## Purpose

The pane the Athlete opens every day: where am I relative to the Target Race, what is today's session, and what does this week look like. No readiness data lives here (locked on the map — readiness belongs to Trends).

## Vertical order (mobile)

1. Race-countdown hero card
2. Pending-adaptation signal (conditional)
3. Today's workout card
4. 7-day week strip

Desktop: the same order as the top section of the stacked page (per #46), centered column.

## 1. Race-countdown hero card

Composition, top to bottom:

- **Race identity**: race name in Newsreader (editorial), date beneath in Manrope muted. From the Target Race record.
- **Days remaining**: the pane's single dramatic moment — large numeral in **coral** with "days" beside it in muted Manrope. ⚠️ *Iteration point: coral here is a product-accent use; #47 reserves coral for attention only within charts. If the dual role reads badly in build, fall back to ink/deep-sea.*
- **Training-build progress as a phase-segmented bar**: one segment per Training Phase, widths proportional to phase duration, hairline boundaries (`--line`), filled to today, current segment highlighted in `deep-sea`. Caption beneath in the #47 annotation style: small-caps phase name + position, e.g. `BASE 2 · WEEK 5 OF 18`. This is the Training Plan in miniature, not a generic percentage.

Terminal states:

- **Race week** (≤ 7 days): phase bar collapses to a taper framing; copy shifts to race-week voice; race date emphasized.
- **Race day**: "Race day" headline; no progress bar; start-time framing.
- **Post-race**: "Race complete" state; copy invites setting a new Target Race. Copy-only — no new-race flow exists; do not fake one.

## 2. Pending-adaptation signal (conditional)

When a proposed Workout Adaptation awaits review, a single quiet chip renders under the hero: coral dot + "1 proposal awaiting your review" + chevron. Tapping navigates to the Coaching pane (`#coaching`, `replaceState`). No badges, no notification chrome, never more than one chip (it aggregates). Absent entirely when nothing is pending — good is quiet.

## 3. Today's workout card

**Planned (default) state:**

- Eyebrow `TODAY`, workout title (e.g. "Threshold 6×1km"), type chips (Quality · Threshold).
- Summary rows (label + value, tabular numerals): target pace range, recovery protocol, planned duration/distance.
- Primary action: **View workout details** → pushes `#workout/<id>` (per #46 full push). There is **no "Start Workout" action** — the product cannot start a watch workout; concept A's button is dropped as dishonest capability.

**Completed state** (today's Workout Result exists): the card flips to a result summary — distance, time, average pace, average HR, Training Load as a stat row — plus a one-line coach acknowledgement and **View workout details**.

**Rest day state**: calm card, "Rest day" in editorial voice, tomorrow's session named in muted text. No CTA.

## 4. 7-day week strip

- Seven tiles Mon–Sun of the current plan week; horizontally scrollable only if it cannot fit (avoid nested horizontal gestures — prefer compression; the strip must not fight the pane axis, so any internal scroll requires build-time verification against #46 mechanics). ⚠️ *Iteration point: if 7 tiles cannot compress legibly at 360 px, switch to a 5+2 stacked week grid rather than inner horizontal scrolling.*
- Tile anatomy: weekday + date, type icon, workout title, key quantity (distance or duration), status treatment — **today** outlined in coral, **completed** with small check, **missed** muted (no red, no shaming — calm coach), **upcoming** default.
- Tap any tile → `#workout/<id>` push (planned or completed composition per the workout-detail spec).

## Data prerequisites & degraded states

- All content is application Training Plan / Target Race records (per #45, no COROS dependency on this pane).
- Missing today's workout record → rest-day treatment. Missing plan entirely → hero only, plus honest empty copy.

## Accessibility & motion

- Hero numeral is text (not SVG); the phase bar is a labelled `progressbar` element with phase names in the accessible name.
- All tiles/cards are buttons with full-text accessible labels (existing pattern in `WorkspaceApp.tsx` is kept).
- Reduced motion: no count-up animation on the days numeral; state transitions are cuts (per #46).

## Open iteration points

1. Coral vs ink days numeral (owner cancelled the grill round; coral chosen provisionally).
2. Week strip compression strategy at narrow widths.
3. Race-week card copy and exact taper framing.
