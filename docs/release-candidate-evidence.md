# Release-candidate evidence

Complete this record against one exact commit and its public deployment. Leave an item `Pending` or `Not performed` until direct evidence exists; do not infer a public or enabled-host result from local automation.

## Candidate identity

| Field                                           | Evidence |
| ----------------------------------------------- | -------- |
| Commit SHA                                      | Pending  |
| Branch                                          | Pending  |
| Pull request                                    | Pending  |
| GitHub Actions run                              | Pending  |
| Vercel deployment ID                            | Pending  |
| Public HTTPS URL                                | Pending  |
| Resolved Vercel Node version and build-log link | Pending  |
| Deployment UTC timestamp                        | Pending  |

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
| No credentials, auth configuration, private data, or private registry paths | Pending | Pending  |
| No repository-only file or runtime dependency                               | Pending | Pending  |
| No external runtime request is required to load the workspace               | Pending | Pending  |
| `Origin-Agent-Cluster: ?1` appears on the public response                   | Pending | Pending  |

## Signed-out browser verification

| Field                                               | Evidence      |
| --------------------------------------------------- | ------------- |
| Result                                              | Not performed |
| Browser and version                                 | Pending       |
| Browser profile/session                             | Pending       |
| Tester                                              | Pending       |
| UTC start and end                                   | Pending       |
| Public workspace loads                              | Pending       |
| Demo Guide and fallback tool list are accurate      | Pending       |
| Week and Month views work                           | Pending       |
| Reset restores plan version 1 and the fixed fixture | Pending       |
| Reload preserves approved state when storage works  | Pending       |
| Unavailable-WebMCP workspace remains usable         | Pending       |
| Evidence links or attachments                       | Pending       |

## Enabled-host fallback verification

Reference the separate ready-for-human ticket created for the exact candidate commit.

| Field                                | Evidence |
| ------------------------------------ | -------- |
| Ready-for-human ticket               | Pending  |
| Exact candidate commit and URL match | Pending  |
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

- Known limitations: Pending
- Failed or blocked checks: Pending
- Follow-up references: Pending
- Candidate disposition: Pending human acceptance
- Reviewer: Pending
- Review UTC timestamp: Pending
