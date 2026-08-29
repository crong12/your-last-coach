# Release-candidate evidence

This record covers the corrected production candidate that completed enabled-host verification. Direct host results are distinguished from automated coverage and from conditions that could not be reproduced in the available environment.

## Candidate identity

| Field | Evidence |
| --- | --- |
| Commit SHA | `daeb31aca9d1ae85c5a602e17a42a6b0252fa39b` |
| Branch | `main` |
| Pull request | [#36 — Handle omitted Chrome WebMCP execution options](https://github.com/crong12/your-last-coach/pull/36), cumulative with #31 and #35 |
| GitHub Actions run | [Verify run 11](https://github.com/crong12/your-last-coach/actions/runs/33253632321) — success |
| Vercel deployment ID | `dpl_3xAi4VhkQuPdFh21JGqGgMvmbC1V` |
| Public HTTPS URL | https://your-last-coach.vercel.app/ |
| Resolved Vercel Node version and build-log link | Compatible `22.x` family; exact resolved patch was not exposed in the retained host evidence |
| Deployment UTC timestamp | 2026-08-29T12:59:55.898Z |

The original candidate `fdedfce77634da11cb13b87043a15a6751fff7da` exposed the Chrome fallback failure filed as #34. PRs #35 and #36 produced the corrected candidate above; enabled-host acceptance therefore applies to the corrected merge commit and deployment.

## Automated verification

PR #36's complete Verify workflow passed on head commit `36bd4b3a1019f78ff903977e6a8aaa1bc7dac5c5` before merge.

| Check | Result | Tester | UTC timestamp | Evidence |
| --- | --- | --- | --- | --- |
| Isolated public-registry `npm ci` | Pass | GitHub Actions | 2026-08-29 | Verify run 11 |
| `npm run format:check` | Pass | GitHub Actions | 2026-08-29 | Verify run 11 |
| `npm run typecheck` | Pass | GitHub Actions | 2026-08-29 | Verify run 11 |
| `npm test` | Pass | GitHub Actions | 2026-08-29 | Verify run 11, including omitted-execution-options regression |
| `npm run build` | Pass | GitHub Actions | 2026-08-29 | Verify run 11 |
| `npm run test:e2e` | Pass | GitHub Actions | 2026-08-29 | Verify run 11 |
| `npm run test:static` | Pass | GitHub Actions | 2026-08-29 | Verify run 11 |
| Workflow and Vercel configuration validation | Pass | GitHub Actions / Vercel | 2026-08-29 | Verify run 11; production deployment READY |
| `git diff --check` | Pass | GitHub Actions | 2026-08-29 | Verify run 11 |

## Static candidate inspection

| Check | Result | Evidence |
| --- | --- | --- |
| `dist/` contains the top-level app and referenced assets | Pass | Verify run 11 |
| No credentials, auth configuration, private data, or private registry paths | Pass | Verify run 11 |
| No repository-only file or runtime dependency | Pass | Verify run 11 |
| No external runtime request is required to load the workspace | Pass | Signed-out and Incognito production loads |
| `Origin-Agent-Cluster: ?1` appears on the public response | Pass | Candidate static verification retained from the release workflow |

## Signed-out browser verification

| Field | Evidence |
| --- | --- |
| Result | Pass with limitation |
| Browser and version | Chrome 152.0.7977.65 |
| Browser profile/session | Cleared ChatGPT in-app-browser data and Chrome Incognito |
| Tester | Ong Chin Rong |
| UTC start and end | 2026-08-29T07:53:02Z–2026-08-29T13:45:23Z |
| Public workspace loads | Pass |
| Demo Guide and fallback tool list are accurate | Pass |
| Week and Month views work | Pass |
| Reset restores plan version 1 and the fixed fixture | Pass |
| Reload preserves approved state when storage works | Pass |
| Unavailable-WebMCP workspace remains usable | Calendar remained usable in Incognito, but Chrome's native WebMCP host still reported connected; the truly unavailable state could not be reproduced in this installation and remains covered by controlled tests |
| Evidence links or attachments | Issue #32 comments and `codex://threads/01a04db5-7e00-70b2-b76b-654c85256e0a` |

## Enabled-host fallback verification

| Field | Evidence |
| --- | --- |
| Ready-for-human ticket | [#32 — Verify the release candidate in enabled WebMCP hosts](https://github.com/crong12/your-last-coach/issues/32) |
| Exact candidate commit and URL match | Pass — production deployment `dpl_3xAi4VhkQuPdFh21JGqGgMvmbC1V` resolves merge commit `daeb31aca9d1ae85c5a602e17a42a6b0252fa39b` |
| Enabled Chrome version | 152.0.7977.65 |
| Model Context Tool Inspector version | 1.9.13 |
| ChatGPT version and model | Desktop host build/model identifier not exposed; final journey ran in a Codex desktop task using the enabled in-app browser |
| Tester | Ong Chin Rong |
| UTC start and end | 2026-08-29T07:53:02Z–2026-08-29T13:45:23Z |

### Scenarios

| Scenario | Result | Evidence |
| --- | --- | --- |
| Exactly six fallback tools are registered | Pass | Inspector showed the six documented tools |
| Athlete, Training Plan, and workout context reads | Pass | Contract 1.1, fixture `demo-athlete-v1`, visible plan version 1 |
| Athlete Feedback preserves the original text and sparse reported fields | Pass | Exact raw text persisted in workout context |
| Repeated feedback request is idempotent | Pass | Repeated request ID produced one feedback record |
| Fallback review opens and decision initially reports `not_ready` | Pass | Modal opened in Chrome after PR #36; reader returned `not_ready` |
| Recommendation and alternative both preview without mutation | Pass | Recovery-first and keep-the-rhythm previews left plan version 1 |
| **Adapt my plan** applies once and returns the structured result | Pass | Recovery-first returned `approved`, version 1→2, durability `persistent` |
| Plan version and Athlete-visible calendar update agree with Agent reads | Pass | Thursday rest; Saturday 6 km easy; Sunday 14 km easy long run |
| **None — discuss further** does not mutate | Pass | Reader returned `discuss_further`; plan remained version 1 |
| Cancellation does not mutate | Pass | Reader returned `cancelled`, reason `athlete_dismissed` |
| Reset during review does not mutate | Pass with UI limitation | Modal blocks the background Reset button; outside click safely dismisses with `athlete_dismissed`. No mutation occurred. |
| Stale proposal is rejected | Pass | `stale_plan`; expected current planVersion 1; no modal or mutation |
| Duplicate review cannot apply twice | Pass | Second open returned `busy` while the first review remained active |
| Approved state survives reload when storage works | Pass | Version 2 and all three adaptations survived reload |
| Deterministic reset restores the fixture | Pass | Version 1, original workouts, empty feedback, and no active review |
| ChatGPT completes the exact fallback judge flow | Pass with host note | Enabled desktop in-app-browser task recorded feedback, opened the review, observed `not_ready`, waited for the Athlete, read the approved decision, and reported version 2. Thread: `codex://threads/01a04db5-7e00-70b2-b76b-654c85256e0a`. |

## Limitations and disposition

- Known limitations:
  - Chrome's native WebMCP support remained enabled in Incognito, so a truly unavailable host could not be reproduced manually.
  - The modal intentionally blocks the background Reset button; outside-click dismissal was verified instead.
  - The final enabled in-app-browser journey was surfaced as a Codex desktop task, and its model/build identifier was not exposed.
  - The generated alternative used 4 km rather than the documented 5 km on Thursday; this did not affect the selected recovery-first outcome or the approval-safety contract.
  - The first in-app review timed out while awaiting interaction; it cancelled without mutation, and a fresh review completed successfully.
- Failed or blocked checks: None after PR #36; unavailable-WebMCP manual reproduction was not possible in this enabled Chrome installation.
- Follow-up references: #34, PR #35, PR #36.
- Candidate disposition: Accepted for the enabled-host proof-of-concept with the limitations above.
- Reviewer: Ong Chin Rong
- Review UTC timestamp: 2026-08-29T13:45:23Z
