---
# Machine-readable design tokens. Normative: components and charts read these
# through the CSS custom properties in src/ui/styles.css.
colors:
  ink: "#173330"
  ink-soft: "#465e59"
  deep-sea: "#1d4b51"
  sea: "#6f9e98"
  foam: "#dce9e4"
  mist: "#e8efeb"
  canvas: "#eef3ef"
  paper: "#f8faf6"
  white: "#ffffff"
  line: "#cbd9d3"
  muted: "#667772"
  track: "#e87851"
  track-soft: "#f7ddd2"
  sun: "#d8d273"
  sun-soft: "#f0ecca"
  ochre: "#7d6f1b"
  ember: "#b8431f"
semantic:
  attention: "track"
  warn: "ochre"
  warn-soft: "sun-soft"
  bad: "ember"
  bad-soft: "track-soft"
  warn-on-dark: "sun"
  bad-on-dark: "track"
  series-1: "deep-sea"
  series-2: "sea"
fonts:
  sans: '"Manrope", ui-sans-serif, system-ui, sans-serif'
  serif: '"Newsreader", Georgia, serif'
type-scale:
  display: "clamp(38px, 6vw, 72px)"
  hero: "clamp(32px, 5vw, 48px)"
  section: "28px"
  card-title: "18px"
  body: "13px"
  label: "11px"
  micro: "9px"
weights: [500, 700]
letter-spacing:
  smallcaps: "0.08em"
  eyebrow: "0.1em"
radii:
  pill: "999px"
  panel: "24px"
  card: "16px"
  control: "12px"
shadow:
  ambient: "0 24px 70px rgba(24, 58, 53, 0.1)"
  overlay: "0 32px 100px rgba(8, 30, 27, 0.35)"
breakpoints: [620, 760, 1050]
motion:
  default: "none"
  navigation: "browser smooth scroll / push transition only"
  reduced-motion: "all cuts"
---

# DESIGN.md — Your Last Coach

## North Star

**The Coastal Training Journal.** A runner's calm seaside logbook: paper surfaces under soft morning light, editorial serifs for the moments that matter, evidence written down carefully and never dressed up. Every visual decision serves this — if an element feels like a dashboard widget, a notification, or a sales page, it does not belong. The journal records; it does not shout.

Status: formalized from the incumbent implementation (`src/ui/styles.css`). The identity is **preferred, not binding** (PRODUCT.md): evolve it here deliberately, never drift.

## Color

The world is sea-green ink on cream paper. Surfaces are translucent paper (`rgba(248,250,246,0.82)`) over a `mist` field lit by one white radial gradient at the top-left — morning light, applied once on the app shell, never per-card.

- **Ink hierarchy:** `ink` for primary text, `ink-soft`/`muted` for secondary, `deep-sea` for emphasis and primary actions, `sea` for supporting strokes.
- **Structure:** `line` hairlines; `foam`/`canvas` for quiet fills.
- **Accents — used sparingly and with meaning:**
  - `track` (coral) = **attention**. The pending-review dot, the countdown numeral, the primary "Adapt my plan" moment, approved-adaptation diamonds. The Final Turn brand mark's single lower-right endpoint is the sole non-state exception: it represents the Athlete's target, not a status.
  - `sun` = ambient highlight (evidence accents), rarely.
- **Semantic states ("good is quiet", #47):** good news gets no color — default ink rendering. Deviations speak: `ochre` (warn) and `ember` (bad) for text/strokes on light surfaces — both AA (4.8:1 / 5.2:1 on `paper`); `sun-soft` / `track-soft` for their fills and bands. On dark `deep-sea` surfaces use `sun` / `track` (graphics-grade; pair small text with `foam`). Never color-only: every warn/bad pairs with a glyph or label.
- **Charts:** series are neutral — `series-1: deep-sea`, `series-2: sea`. Coral never draws a data series.

## Typography

Two voices, strictly cast:

- **Manrope (sans)** — the working hand: UI, labels, navigation, and **all data**. Numbers always set with `tabular-nums` (use the `.numeric` utility). Weights 700 for headings/actions, 500 for body.
- **Newsreader (serif)** — the editorial voice: race names, section display headings, coach's-intent prose, quoted Athlete Feedback. **Never for data values, labels, or UI controls.**

Scale (from frontmatter): `display` for the countdown numeral, `hero` for pane headlines, `section` (28px) for section headings, 13px body, 11px labels, 9px micro. Small-caps eyebrow labels are uppercase Manrope 700 with `0.08–0.1em` tracking — the journal's marginalia, used for entry types, phase names, and chart metric names.

## Spacing & Layout

- Content column: `min(1480px, calc(100% - 36px))` today; the pane era uses a centered max-width column on desktop (#46).
- Card padding ~20–22px; related rows gap 8–12px; sections gap 16–24px. No spacing-token scale is imposed retroactively — keep to this rhythm, multiples of 4.
- Breakpoints: 620 / 760 / 1050 (`max-width` media queries). Mobile-first surfaces must hold at 360px.

## Components

- **Cards:** translucent paper on hairline borders (`rgba(23,51,48,0.12)`), `panel` (24px) radius for major panels, `card` (16px) for inner cards, one `ambient` shadow — diffuse and low, never stacked elevations. Elevation is atmosphere, not hierarchy; hierarchy comes from type and position.
- **Buttons:** pill-shaped (`999px`), 40px min height, hairline border on translucent white. Variants: `--primary` (deep-sea fill, paper text), `--danger`/attention (track fill), `--quiet` (transparent). One primary action per surface.
- **Status dots:** 8px circles with a 4px soft halo of the same hue.
- **Focus:** 3px `#3f7e8a` outline, 3px offset — on everything interactive, non-negotiable.
- **Charts:** per the frozen data-viz language (#47 / `docs/design-specs/dashboard-ia.md`): hairline horizontal gridlines only, inline y-labels, tap-to-inspect fixed readout, gap-broken lines, baseline dashes for missing measurements, coverage captions, phase/adaptation/race annotations. Rendered per ADR 0002 (React-owned SVG + d3 math).

## Motion

The journal barely moves. The incumbent defines **no transitions** — state changes are honest cuts — and that restraint is the budget:

- Allowed: scroll-snap pane glides and smooth-scrolls (#46), pushed-screen slide-in, at most one soft fade for overlay chrome.
- `prefers-reduced-motion: reduce`: everything becomes an instant cut (already implemented; keep it total).
- Never: count-up numerals, chart draw-in animations, parallax, attention-seeking pulses.

## Anti-patterns

1. Coral as decoration, or drawing a data series. Coral means _attention_; the Final Turn brand endpoint is the sole brand exception.
2. Newsreader for numbers, labels, or controls.
3. Green "success" states — good is quiet here.
4. Fabricated continuity: interpolated gaps, zero-filled missing nights, unlabelled aggregates.
5. Notification chrome: badges, counts, red dots (the single coral pending-dot is the entire in-product status budget; the brand endpoint is not status chrome).
6. Stacked or hard shadows; per-card light sources.
7. Proportional-figure numerals in any table, stat, or chart.
8. "User", "dashboard", or non-CONTEXT.md vocabulary in UI copy.
