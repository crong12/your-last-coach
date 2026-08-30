# Task 1 report — issue #64 Trends pane

## Status

`DONE_WITH_CONCERNS`

Implementation commit: `a66adfa` (`Build the Trends pane (#64)`).

## Files changed and design notes

- `src/application/trends.ts` owns the linked `4w` / `12w` / `Build` windows, local-date projections, finite/degraded/empty/unavailable states, readiness gaps and averages, weekly volume/load aggregation, Outdoor Run pace/heart-rate pairs, strict repeated-session grouping, and dated annotations.
- `src/demo/demoFixture.ts`, `src/domain/types.ts`, and `src/domain/validation.ts` add deterministic provenance-labelled readiness history, Workout Result aggregates/activity classification, explicit build start, phase history, and latest-snapshot agreement checks.
- `src/ui/charts/TrendsPane.tsx` renders the Readiness and Performance groups, linked range control, inspectable SVG marks, source/coverage copy, repeated-session entry card, and Workout Result/adaptation actions. It reuses issue #63 `ChartCard`, `ChartPlot`, chart math, annotations, and hit-area conventions.
- `src/ui/charts/HrvChart.tsx`, `ChartCard.tsx`, and `ChartPlot.tsx` extend the existing chart seams for Resting heart rate, configurable evidence groups, and unambiguous axis dates.
- `src/ui/WorkspaceApp.tsx` places Trends inside the existing Context Rail, preserves the surrounding Monitoring/How you're arriving/Recent training evidence, and restores focus after Coaching or Workout Result navigation. `src/ui/styles.css` supplies responsive mobile/desktop layout and 44px targets.
- `tests/trends.test.ts` and `e2e/trends-pane.spec.ts` cover projection contracts and the full dynamic mobile/desktop slice. Existing HRV, release-candidate, training-plan, and selector tests were updated only where the accepted fixture extension changes their expected data or preserves state validation.

No dependency or package configuration changed. D3 usage remains limited to the existing `d3-scale` and `d3-shape` chart math modules.

## Red/green TDD ledger

1. Fixture extension: added a failing history/summary fixture assertion; `npx vitest run tests/trends.test.ts` was red with `2 failed, 1 passed` because the history was absent. Adding the typed fixture data made the focused run green with `3 passed`.
2. Authority validation: corruption cases initially made `npx vitest run tests/trends.test.ts` red with `8 failed`; adding strict provenance/date/measurement/plan/phase/result validation made it green with `11 passed`. Regression command `npx vitest run tests/trends.test.ts tests/demo-fixture.test.ts tests/workspace-application.test.ts tests/persistence.test.ts` then passed `4 files, 106 tests`.
3. Range and projection contracts: the first range Playwright assertion was red (`1 failed`, missing Trends group), and the unit test was red on `Cannot find module '../src/application/trends'`. The minimal projection module and range control made the targeted unit assertions green with `17 passed`.
4. Shared chart slice: the first Trends UI pass was exercised with `npx playwright test e2e/trends-pane.spec.ts --project=chromium`; the focused flow passed `1`. `npx vitest run tests/hrv-chart.test.ts tests/trends.test.ts` passed `23` after the existing HRV seam was generalized.
5. Missing/invalid metric handling: focused projection tests first failed `3` cases (null readiness and invalid readiness/load values were misclassified). After preserving null as a gap and rejecting non-finite inputs before chart math, the targeted run passed `22`; the expanded Trends suite passed `26`, including the local adaptation annotation case (`1 passed, 26 skipped`).
6. Empty zero state: `npx vitest run tests/trends.test.ts -t 'explicit empty states'` first failed because empty load was `null` rather than a true zero. The green run passed `1` after zero-volume/load weeks were represented explicitly.
7. Keyboard/navigation E2E: initial SVG hit-area click attempts failed; switching to focus plus Enter/Space made `CI=1 npx playwright test e2e/trends-pane.spec.ts --project=chromium --workers=1` pass `4`. Adaptation navigation then required a reload after seeded local storage, and the repeated-session action required the latest result target; each focused flow was red before its corresponding fix and green afterward. The completed issue-specific spec passed `6` tests.
8. Authority hardening: activity classification, missing plan authority, and invalid phase history tests first failed `3` focused cases with `npx vitest run tests/trends.test.ts -t 'activity classification authority|without a resolvable|invalid phase history'`; the strict guards made the focused run pass `4`.
9. Empty UI harness: the first empty-range Playwright run showed the normal result/readout because the mutated saved state was invalid through unrelated coaching references. Clearing those references in the test harness made `CI=1 npx playwright test e2e/trends-pane.spec.ts --project=chromium --workers=1 -g 'honest zero'` pass `1`.
10. Regression preservation: the first full unit run had `1` selector failure (`expected 10, received 11`) after adding the required second repeat attempt; updating that fixture expectation produced `12 files, 204 tests` green. The first full dynamic run had `9` failures when the old context cards were replaced and strict labels collided; retaining the existing Context Rail and scoping/clarifying labels made the training-plan run pass `21` and the full dynamic run pass `53`.
11. Calendar semantics: a local-time grouping test first expected `33.5 km` but received `13.5 km`; grouping through the Training Plan timezone and rerunning the focused test passed `1`.
12. Strict dates: an invalid normalized date initially returned `partial` instead of `unavailable`; strict date parsing made the focused test pass `1`.
13. Strict source timestamps: an invalid provenance timestamp initially returned `partial`; strict source validation made the focused test pass `1`.
14. Snapshot agreement: a missing latest snapshot counterpart initially validated as true; always comparing the latest history record to all three latest snapshot values made the focused test pass `1`.
15. True-zero geometry: the empty UI geometry assertion initially found non-zero bar heights; zero-anchored scale domains made the focused Playwright test pass `1`.
16. Provenance completeness: the focused test `npx vitest run tests/trends.test.ts -t 'requires provenance when a Workout Result includes duration'` was red with `1 failed` because duration alone did not trigger source validation. Including duration in the extended-summary authority check made the same command green with `1 passed`.

## Final verification

All commands below exited `0` in the issue-64 worktree after commit preparation:

- `npm test` — `12 files passed, 208 tests passed`.
- `npm run typecheck` — TypeScript build passed.
- `npm run format:check` — all matched files passed Prettier.
- `git diff --check` plus `git diff --no-index --check /dev/null <each untracked changed file>` — no whitespace errors.
- `npm run build` — typecheck and Vite production build passed (`255 modules transformed`).
- `CI=1 npm run test:e2e` — `53 passed`.
- `CI=1 npm run test:static` — `2 passed`; static candidate made no external runtime requests.
- Dependency/config audit — no `package.json`, lockfile, Vite, TypeScript, or Playwright config diff; chart imports use only `d3-scale` and `d3-shape`.
- Personal-only audit — no Spotify, organization, company, or private references were added. The one matching provenance sentence in `src/demo/demoFixture.ts` is pre-existing and unchanged.

## Screenshots and visual inspection

- `/tmp/issue-64-trends-mobile.png` — 360px full-app capture. The range control and all Trends cards remain in the accepted vertical order, source lines and coverage are visible, and the existing context cards continue below Trends.
- `/tmp/issue-64-trends-desktop.png` — 1280px full-app reduced-motion capture. Trends stays a centered readable column inside the existing stacked workspace; surrounding plan, context, and Coaching sections remain present.
- `/tmp/issue-64-trends-static-mobile.png` — 360px built static-candidate capture in Build range. The linked cards render without runtime dependencies and preserve the static candidate layout.

## Concerns and unverified requirements

- The Impeccable detector was run exactly once as required: `node /Users/chinrongo/.agents/skills/impeccable/scripts/detect.mjs --json <changed targets>` exited `2` with existing palette/side-tab advisories and one new repeated-summary side-tab advisory. The new repeated-summary rule was changed from `border-left` to `border-top` afterward; the detector was not rerun to preserve the exactly-once audit requirement. The desktop Build volume chart also has dense phase labels where the two early phase boundaries are close together; this is follow-up visual polish.
- This local implementation proves the deterministic synthetic fixture and static/runtime UI only. It does not prove live COROS/FIT ingestion, deployment, or enabled-host WebMCP behavior; those are outside issue #64's accepted slice.
