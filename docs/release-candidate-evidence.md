# Release-candidate evidence

Complete this record against one exact commit and its public deployment. Leave an item `Pending` or `Not performed` until direct evidence exists; do not infer a public or enabled-host result from local automation.

## Candidate identity

| Field                                           | Evidence |
| ----------------------------------------------- | -------- |
| Commit SHA                                      | `fdedfce77634da11cb13b87043a15a6751fff7da` |
| Branch                                          | `main` |
| Pull request                                    | [Prepare the verified release-candidate surface](https://github.com/crong12/your-last-coach/pull/31) |
| GitHub Actions run                              | [Successful push-to-main Verify run](https://github.com/crong12/your-last-coach/actions/runs/33224476541) |
| Vercel deployment ID                            | `dpl_HoquHrqnk5XGPRrDHcvzyeEyEYky` |
| Public HTTPS URL                                | https://your-last-coach.vercel.app/ |
| Resolved Vercel Node version and build-log link | Resolved major `22.x`: Vercel documents that `package.json#engines` overrides the project default. The exact patch version was not emitted in the build log. [Deployment inspector and build log](https://vercel.com/ongchinrong12-6627s-projects/your-last-coach/HoquHrqnk5XGPRrDHcvzyeEyEYky) |
| Deployment UTC timestamp                        | 2026-08-29T07:09:33.275Z |

## Automated verification

Record the tester, UTC timestamp, command, exit status, and a link or attachment for each result.

| Check                                        | Result  | Tester  | UTC timestamp | Evidence |
| -------------------------------------------- | ------- | ------- | ------------- | -------- |
| Isolated public-registry `npm ci`            | Pending | Pending | Pending       | Pending  |
| `npm run format:check`                       | Pending | Pending | Pending       | Pending  |
| `npm run typecheck`                          | Pending | Pending | Pending       | Pending  |
| `npm test`                                   | Pending | Pending | Pending       | Pending  |
| `npm run build`                              | Pending | Pending | Pending       | Pending  |
| `npm run test:e2e`                           | Pending | Pending | Pending       | Pending  |
| `npm run test:static`                        | Pending | Pending | Pending       | Pending  |
| Workflow and Vercel configuration validation | Pending | Pending | Pending       | Pending  |
| `git diff --check`                           | Pending | Pending | Pending       | Pending  |

## Static candidate inspection

| Check                                                                       | Result  | Evidence |
| --------------------------------------------------------------------------- | ------- | -------- |
| `dist/` contains the top-level app and referenced assets                    | Pending | Pending  |
| No credentials, auth configuration, private data, or private registry paths | Pass | Independent merged-tree gate recorded on [release-candidate ticket](https://github.com/crong12/your-last-coach/issues/18) |
| No repository-only file or runtime dependency                               | Pass | Public deployment loaded from Vercel without repository access |
| No external runtime request is required to load the workspace               | Pass | Public HTML and bundled assets loaded successfully |
| `Origin-Agent-Cluster: ?1` appears on the public response                   | Pass | Unauthenticated public response header captured 2026-08-29T07:16:08Z |

## Signed-out browser verification

| Field                                               | Evidence      |
| --------------------------------------------------- | ------------- |
| Result                                              | Partial — cookie-free public access and in-app-browser Week/Month, deterministic reset, and reset-state reload passed; interactive signed-out-browser verification remains pending |
| Browser and version                                 | Codex in-app Browser; exact build identifier not exposed |
| Browser profile/session                             | Cookie-free command-line HTTPS request proved unauthenticated public access; UI checks ran in the Codex in-app Browser, whose signed-out state was not established |
| Tester                                              | crong12 with Codex verification agent |
| UTC start and end                                   | 2026-08-29T07:16:08Z to 2026-08-29T07:33:09.667Z |
| Public workspace loads                              | Pass in Codex in-app Browser and via cookie-free HTTP 200; interactive signed-out-browser check pending |
| Demo Guide and fallback tool list are accurate      | Pass — exactly six fallback tools |
| Week and Month views work                           | Pass |
| Reset restores plan version 1 and the fixed fixture | Pass — user performed reset; agent then observed plan version 1, Thursday 6 km recovery, Saturday 8 km easy with strides, and Sunday 18 km long run |
| Reload preserves approved state when storage works  | Not performed here — approved-state flow belongs to enabled-host ticket #32 |
| Unavailable-WebMCP workspace remains usable         | Not performed here — current browser exposes WebMCP; controlled coverage passed before deployment |
| Evidence links or attachments                       | [Vercel inspector](https://vercel.com/ongchinrong12-6627s-projects/your-last-coach/HoquHrqnk5XGPRrDHcvzyeEyEYky), [release-candidate ticket](https://github.com/crong12/your-last-coach/issues/18) |

## Enabled-host fallback verification

Reference the separate ready-for-human ticket created for the exact candidate commit.

| Field                                | Evidence |
| ------------------------------------ | -------- |
| Ready-for-human ticket               | [Verify the release candidate in enabled WebMCP hosts](https://github.com/crong12/your-last-coach/issues/32) |
| Exact candidate commit and URL match | Pass — deployment metadata records `fdedfce77634da11cb13b87043a15a6751fff7da` at https://your-last-coach.vercel.app/ |
| Enabled Chrome version               | Pending  |
| Model Context Tool Inspector version | Pending  |
| ChatGPT version and model            | Pending  |
| Tester                               | Pending  |
| UTC start and end                    | Pending  |

### Scenarios

| Scenario                                                                | Result        | Evidence |
| ----------------------------------------------------------------------- | ------------- | -------- |
| Exactly six fallback tools are registered                               | Not performed | Pending  |
| Athlete, Training Plan, and workout context reads                       | Not performed | Pending  |
| Athlete Feedback preserves the original text and sparse reported fields | Not performed | Pending  |
| Repeated feedback request is idempotent                                 | Not performed | Pending  |
| Fallback review opens and decision initially reports `not_ready`        | Not performed | Pending  |
| Recommendation and alternative both preview without mutation            | Not performed | Pending  |
| **Adapt my plan** applies once and returns the structured result        | Not performed | Pending  |
| Plan version and Athlete-visible calendar update agree with Agent reads | Not performed | Pending  |
| **None — discuss further** does not mutate                              | Not performed | Pending  |
| Cancellation does not mutate                                            | Not performed | Pending  |
| Reset during review does not mutate                                     | Not performed | Pending  |
| Stale proposal is rejected                                              | Not performed | Pending  |
| Duplicate review cannot apply twice                                     | Not performed | Pending  |
| Approved state survives reload when storage works                       | Not performed | Pending  |
| Deterministic reset restores the fixture                                | Not performed | Pending  |
| ChatGPT completes the exact fallback judge flow                         | Not performed | Pending  |

## Limitations and disposition

- Known limitations: Interactive signed-out/incognito UI verification remains pending; the exact in-app-browser build identifier was not exposed; unavailable-WebMCP and approved-state persistence require the separate enabled-host run.
- Failed or blocked checks: Interactive signed-out/incognito browser check remains pending; enabled Chrome and the full ChatGPT fallback journey remain pending in issue #32.
- Follow-up references: [Verify the release candidate in enabled WebMCP hosts](https://github.com/crong12/your-last-coach/issues/32)
- Candidate disposition: Public deployment checks passed; candidate acceptance remains pending enabled-host verification.
- Reviewer: crong12 with Codex verification agent
- Review UTC timestamp: 2026-08-29T07:33:09.667Z
