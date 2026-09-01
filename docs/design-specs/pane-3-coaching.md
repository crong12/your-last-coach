# Pane 3 — Coaching notebook

- Active implementation ticket: [Revamp Coaching as a weekly coaching notebook](https://github.com/crong12/your-last-coach/issues/89)
- Route: `#coaching`; adaptation review and receipt routes remain `#adaptation/<id>`
- Visual authority: [`DESIGN.md`](../../DESIGN.md) and the shared tokens in `src/ui/styles.css`

## Purpose

Coaching is the durable, readable account of what the Coach has learned, what still matters, and which approved decisions shaped the Training Plan. Objective measurements and charts remain in Trends; Coaching interprets and links to that evidence without reproducing it.

This demo slice uses deterministic synthetic Weekly Progress Reviews and one seeded Adaptation History entry. It does not add a review-generation command, persistence schema, Coaching Briefing projection, scheduler, or WebMCP write tool.

## Reading order

The semantic and mobile order is:

1. Latest Weekly Progress Review
2. Coaching Topics
3. Weekly Progress Review archive
4. Adaptation History

Desktop uses the same DOM order in a balanced two-column notebook. The latest review remains the focal surface; Topics, archive, and history provide supporting context.

## Latest Weekly Progress Review

The focal card shows the reviewed Monday–Sunday range, recorded date, editorial headline, overall assessment, Progress, Watch, Next focus, and links to the supporting Coaching Evidence. Newsreader is reserved for the assessment and headline; dates and counts use tabular numerals.

When no completed review is available, the card states this explicitly without substituting a generated summary.

## Weekly Progress Review archive

Prior deterministic demo reviews appear newest first. Each archive row shows its week-ending date and headline. The native disclosure expands to the complete assessment, Progress, Watch, Next focus, and evidence references. Summary rows and evidence links provide at least a 44 px effective target and retain the shared focus treatment.

## Coaching Topics

The former Monitoring presentation is renamed Coaching Topics. Each active topic shows its status, current Athlete report, existing follow-up condition, last-reported date, and supporting evidence links. The UI does not add private Coach notes or hidden memory.

## Adaptation History

Approved application receipts appear newest first with selected option, application date, affected-workout count, and Training Plan version change. Persisted receipts link to their complete `#adaptation/<id>` record. The deterministic seed demonstrates the composition without pretending that a non-persisted demo record has a complete receipt route.

## Removed composition

Coaching no longer renders:

- the chronological Coaching timeline;
- the raw Recent training list and hard-coded weekly summary;
- the pending Plan Adaptation card; or
- the Athlete Profile summary.

The full-page Plan Approval flow and its explicit Athlete decision remain unchanged. A pending proposal can still be opened through its existing adaptation route; it is simply not promoted inside the Coaching notebook.

## Empty and degraded states

Each notebook collection owns a quiet explicit state: no completed review, no active Coaching Topics, no prior reviews, or no approved adaptations. Unresolvable evidence remains a literal evidence reference rather than being inferred or silently dropped.

## Accessibility and responsive behavior

- Heading hierarchy and DOM order remain logical in both layouts.
- Evidence references and archive disclosures are semantic links or native controls with visible focus treatment.
- Mobile collapses to one column at the established breakpoint and remains usable at 360 px.
- The notebook adds no animation; existing reduced-motion behavior remains authoritative.
- Sea-green and cream carry structure. Coral remains reserved for genuine attention states and is not used decoratively in the notebook.
