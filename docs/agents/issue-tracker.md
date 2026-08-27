# Issue tracker

The canonical tracker is GitHub Issues in [crong12/your-last-coach](https://github.com/crong12/your-last-coach/issues). Do not create a parallel local ticket system.

## Artifacts

- A Wayfinder map is one issue carrying the `wayfinder:map` label.
- Wayfinder decision tickets are issues that link to their map under a `## Parent` heading and carry one `wayfinder:<type>` label.
- Buildable specifications are GitHub issues labelled `ready-for-agent`.
- Implementation tickets are separate, demoable vertical-slice issues. They link to their parent specification and declare blockers.
- Refer to issues by linked title in prose; do not use a bare issue number as the human-facing name.

## Relationships

Use explicit issue-body relationships so every supported GitHub client and agent can read them:

- Parent relationship: a `## Parent` section containing the linked parent issue.
- Blocking relationship: a `## Blocked by` section containing linked issues, or `None — can start immediately`.
- A blocker is resolved only when the linked issue is closed.
- Create related issues first, then add relationship links in a second pass.

## Claiming work

Claims use issue comments because one GitHub user may operate several agent sessions.

1. Post `claim: <unique-id> | claimed-at: <UTC timestamp> | expires-at: <UTC timestamp>`. Use a two-hour lease unless the issue states otherwise.
2. Reload the issue comments immediately.
3. The claim is owned only if its unique ID is the newest unexpired claim.
4. Before publishing a resolution, reload once more and verify ownership.
5. A claimant may release early with `release: <unique-id>`. Expired claims require no cleanup.

## Wayfinding operations

- Map: query the open issue labelled `wayfinder:map`.
- Children: query open issues whose `## Parent` section links to the map.
- Frontier: children whose blockers are all closed and which have no unexpired claim.
- Resolution: add a resolution comment, close the decision ticket, then append a one-line linked gist to the map's `## Decisions so far`.
- Fog remains only in the map's `## Not yet specified`; once a question becomes precise, move it into a child issue.
- Research and other independent frontier tickets may run concurrently. Human-in-the-loop tickets require the user's live participation.

## Labels used by Wayfinder

- `wayfinder:map`
- `wayfinder:research`
- `wayfinder:prototype`
- `wayfinder:grilling`
- `wayfinder:task`
