# Reliable Fresh-Agent Coaching Context Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before reporting success.

**Goal:** Make a freshly attached, generic ChatGPT Agent able to discover the coaching workflow, retrieve enough current and longitudinal context to propose two useful plan adaptations, and return the approved outcome in later conversations without corrective prompting.

**Architecture:** Keep `WorkspaceState` as the only application state. Add sourced Athlete Profile values, one stable Coaching Topic, explicit feedback-to-result linkage, and evidence-bearing adaptation receipts to that state; validate and persist them through the existing envelope. Extend `get_athlete_context` into a bounded Coaching Briefing consumed unchanged by the UI and WebMCP adapter. Teach the six existing fallback tools their lifecycle responsibilities through descriptions. Preserve the on-page, human-only **Adapt my plan** mutation gate.

**Tech Stack:** TypeScript 5, React 19, Vite 7, Vitest 4, Playwright 1.58, browser `localStorage`, WebMCP progressive enhancement, Node 22.23.2.

## Global constraints

- Work from a dedicated issue-38 worktree created from the exact current `origin/main`; do not implement directly on `main`.
- Before claiming or changing issue #38, read `docs/agents/issue-tracker.md`; read `docs/agents/triage-labels.md` before changing an issue role.
- Keep the application client-only and browser-local. Do not add authentication, Supabase, a server, a new persistence layer, or a new agent tool.
- Keep exactly the six fallback tools. A generic attached Agent must succeed without a repository skill or hidden prompt.
- Treat tool descriptions as the Agent's workflow instructions. Treat Coaching Briefing data as the Agent's evidence, not as authored coaching advice.
- Only the Athlete pressing **Adapt my plan** may mutate the Training Plan. Selection, tool calls, and model prose remain non-mutating.
- Preserve storage `schemaVersion: 1`. A saved v1 state missing newly required fields is invalid and restores the exact fixture through the existing recovery path; do not add a migration.
- Keep read contract version `1.1`; the response is additively extended and no tool input or tool name changes.
- Keep Coaching Topic `coaching-topic:shin-discomfort` stable with status `monitoring`. New no-pain feedback may appear beside it in the briefing but must not rewrite or close it.
- Reject recommended and alternative options when their normalized Workout Changes are identical. Enabled-host acceptance still judges whether the alternatives are meaningfully different.
- Store only durable adaptation history: proposal evidence references, selected option identity, affected before/after values, application time, and plan versions. Do not retain discarded alternatives or free-form model reasoning.
- Do not push, open a PR, merge, deploy, or mutate issue state until the user grants the corresponding authority.
- Keep all text personal-use and provider-neutral. Do not add private-company or Spotify-specific references.

## File map

| Area               | Files                                                                                                                                                                                                                                | Responsibility                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Domain state       | `src/domain/types.ts`, `src/domain/validation.ts`, `src/demo/demoFixture.ts`                                                                                                                                                         | Profile, topic, feedback linkage, receipt shape, exact seed, invariants |
| Application writes | `src/application/createWorkspaceApplication.ts`, `src/application/ports.ts`, `src/application/initializeWorkspace.ts`                                                                                                                | Record feedback, apply/replay receipts, persist/reset/recover           |
| Shared reads       | `src/application/readSelectors.ts`                                                                                                                                                                                                   | One bounded Coaching Briefing for UI and WebMCP                         |
| Review safety      | `src/domain/review.ts`                                                                                                                                                                                                               | Structurally distinct Workout Changes                                   |
| WebMCP             | `src/adapters/webmcp/registerReadTools.ts`                                                                                                                                                                                           | Six-tool registration and lifecycle descriptions                        |
| UI                 | `src/ui/WorkspaceApp.tsx`, `src/ui/styles.css`                                                                                                                                                                                       | Profile, monitoring topic, feedback, and adaptation history             |
| Tests              | `tests/demo-fixture.test.ts`, `tests/workspace-application.test.ts`, `tests/persistence.test.ts`, `tests/read-selectors.test.ts`, `tests/review-coordinator.test.ts`, `tests/webmcp-read-tools.test.ts`, `e2e/training-plan.spec.ts` | Regression-first contract and behavior proof                            |
| Documentation      | `CONTEXT.md`, `README.md`, `docs/demo-athlete-coaching-contract-v1.md`, `docs/implementation-and-verification-architecture.md`, `docs/three-minute-judging-story.md`                                                                 | Domain language, public contract, architecture, judge flow              |

## Task 1: Add the durable coaching context to the domain and exact fixture

**Files:**

- Modify: `src/domain/types.ts`
- Modify: `src/domain/validation.ts`
- Modify: `src/demo/demoFixture.ts`
- Test: `tests/demo-fixture.test.ts`

- [ ] **Step 1: Write failing fixture assertions**

Add assertions that describe the whole seed before changing production code:

```ts
expect(state.athlete.profile.preferredLongRunDay).toEqual({
  value: "Sunday",
  provenance: "seeded_athlete_profile",
});
expect(state.athlete.profile.maximumWeekdayTrainingDurationMinutes).toEqual({
  value: 60,
  provenance: "seeded_athlete_profile",
});

expect(state.athleteFeedback).toContainEqual(
  expect.objectContaining({
    id: "athlete-feedback:seed-shin-discomfort",
    relatedWorkoutId: "planned-2026-08-23-long",
    relatedWorkoutResultId: "result-2026-08-23",
    rawText:
      "My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.",
  }),
);

expect(state.coachingTopics).toEqual([
  expect.objectContaining({
    id: "coaching-topic:shin-discomfort",
    status: "monitoring",
    firstReportedAt: "2026-08-23T10:00:00+01:00",
    latestReportedAt: "2026-08-23T10:00:00+01:00",
  }),
]);
```

Extend the existing corruption table with these cases:

```ts
["missing Athlete Profile", (state) => delete state.athlete.profile],
["invalid weekday limit", (state) => {
  state.athlete.profile.maximumWeekdayTrainingDurationMinutes.value = 0;
}],
["feedback linked to another result", (state) => {
  state.athleteFeedback[0].relatedWorkoutResultId =
    "result-2026-08-26-threshold";
}],
["topic with unknown evidence", (state) => {
  state.coachingTopics[0].evidenceRefs = ["workout-result:missing"];
}],
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `npm test -- tests/demo-fixture.test.ts`

Expected: failures because `profile`, `relatedWorkoutResultId`, and `coachingTopics` do not exist.

- [ ] **Step 3: Add the domain types**

Move the existing slow-changing Athlete values into a sourced profile so every profile value follows one contract:

```ts
export interface AthleteProfileValue<T> {
  value: T;
  provenance: "seeded_athlete_profile";
  effectiveAt?: string;
}

export interface Athlete {
  id: string;
  displayName: string;
  profile: {
    normalWeeklyVolumeKm: AthleteProfileValue<{ min: number; max: number }>;
    recentHalfMarathonSeconds: AthleteProfileValue<number>;
    thresholdPaceSecondsPerKm: AthleteProfileValue<number>;
    preferredLongRunDay: AthleteProfileValue<"Sunday">;
    maximumWeekdayTrainingDurationMinutes: AthleteProfileValue<number>;
  };
}

export interface CoachingTopic {
  id: string;
  title: string;
  status: "monitoring";
  athleteReport: string;
  firstReportedAt: string;
  latestReportedAt: string;
  evidenceRefs: string[];
  followUpCondition: string;
}
```

Add `relatedWorkoutResultId?: string` to `AthleteFeedback`, `evidenceRefs: string[]` to `AppliedPlanAdaptation`, and `coachingTopics: CoachingTopic[]` to `WorkspaceState`.

- [ ] **Step 4: Seed the exact profile, historical feedback, and topic**

Wrap the existing volume, half-marathon, and threshold values in `athlete.profile`. Add Sunday and 60 minutes with `provenance: "seeded_athlete_profile"` and omit `effectiveAt` because the fixture has no known effective date.

Use this historical feedback record:

```ts
{
  id: "athlete-feedback:seed-shin-discomfort",
  requestId: "seed-shin-discomfort",
  relatedWorkoutId: "planned-2026-08-23-long",
  relatedWorkoutResultId: "result-2026-08-23",
  rawText:
    "My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.",
  reported: {
    legFeel: "Right shin felt a little sore near the end.",
  },
  recordedAt: "2026-08-23T10:00:00+01:00",
}
```

Use this stable topic:

```ts
{
  id: "coaching-topic:shin-discomfort",
  title: "Shin discomfort",
  status: "monitoring",
  athleteReport:
    "My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.",
  firstReportedAt: "2026-08-23T10:00:00+01:00",
  latestReportedAt: "2026-08-23T10:00:00+01:00",
  evidenceRefs: [
    "athlete-feedback:athlete-feedback:seed-shin-discomfort",
    "workout-result:result-2026-08-23",
  ],
  followUpCondition: "The next Athlete report about a run.",
}
```

- [ ] **Step 5: Validate relationships, not just field shapes**

Change workout-result validation to return a map from result ID to its optional Planned Workout ID. Pass that map into feedback validation and require an explicit result reference to resolve to the same `relatedWorkoutId`:

```ts
if (feedback.relatedWorkoutResultId !== undefined) {
  const resultWorkoutId = resultToPlannedWorkoutId.get(
    feedback.relatedWorkoutResultId,
  );
  if (resultWorkoutId !== feedback.relatedWorkoutId) {
    errors.push(
      `${path}.relatedWorkoutResultId must reference a Workout Result for relatedWorkoutId.`,
    );
  }
}
```

Validate each profile value, require a positive integer weekday limit, require unique topic IDs, require ISO timestamps with `firstReportedAt <= latestReportedAt`, and require every topic evidence reference to resolve to a seeded feedback or workout result. Do not make topic validity depend on the latest feedback's pain value.

- [ ] **Step 6: Run focused validation and type checks**

Run: `npm test -- tests/demo-fixture.test.ts && npm run typecheck`

Expected: fixture tests pass; typecheck identifies all old direct Athlete-field consumers that later tasks must update. Update only direct compile-time consumers needed to restore a green typecheck; do not add UI behavior yet.

- [ ] **Step 7: Commit the domain slice**

```bash
git add src/domain/types.ts src/domain/validation.ts src/demo/demoFixture.ts tests/demo-fixture.test.ts
git commit -m "feat: add durable coaching context"
```

## Task 2: Preserve feedback and adaptation evidence through write, replay, persistence, and reset

**Files:**

- Modify: `src/application/createWorkspaceApplication.ts`
- Modify: `src/application/ports.ts`
- Verify: `src/application/initializeWorkspace.ts`
- Test: `tests/workspace-application.test.ts`
- Test: `tests/persistence.test.ts`

- [ ] **Step 1: Write failing application tests**

Extend the existing feedback success test so the application derives the Workout Result link without changing the command input:

```ts
expect(result).toMatchObject({
  status: "recorded",
  feedback: {
    relatedWorkoutId: "planned-2026-08-26-threshold",
    relatedWorkoutResultId: "result-2026-08-26-threshold",
  },
});
```

Extend approval and replay assertions:

```ts
expect(approved.evidenceRefs).toEqual(acceptedProposal.evidenceRefs);
expect(replayed).toMatchObject({
  reviewId: approved.reviewId,
  evidenceRefs: acceptedProposal.evidenceRefs,
  planVersionAfter: approved.planVersionAfter,
});
```

Add a reset assertion that seeded feedback and the stable topic return, while feedback recorded during the test and adaptation receipts disappear.

- [ ] **Step 2: Write failing persistence tests**

Update `approvedEnvelope()` to include `evidenceRefs`. Add tests proving:

1. profile, topics, explicit result links, and receipt evidence references survive reload;
2. a schema-v1 envelope missing `athlete.profile` or `coachingTopics` restores the exact fixture and emits the existing refresh notice;
3. reset returns the exact fixture rather than an empty feedback array.

- [ ] **Step 3: Run the two focused suites and confirm failure**

Run: `npm test -- tests/workspace-application.test.ts tests/persistence.test.ts`

Expected: failures for absent result links and receipt evidence references.

- [ ] **Step 4: Derive the result link inside the existing feedback command**

Keep `record_athlete_feedback` input unchanged. Before creating `feedback`, derive the matching result:

```ts
const relatedWorkoutResultId = state.workoutResults.find(
  ({ plannedWorkoutId }) => plannedWorkoutId === command.relatedWorkoutId,
)?.id;

const feedback: AthleteFeedback = {
  id: `athlete-feedback:${command.requestId}`,
  requestId: command.requestId,
  relatedWorkoutId: command.relatedWorkoutId,
  ...(relatedWorkoutResultId ? { relatedWorkoutResultId } : {}),
  rawText,
  ...(reported ? { reported } : {}),
  recordedAt: state.clock.now,
};
```

Preserve the existing duplicate-request ordering: duplicate lookup still happens before body validation.

- [ ] **Step 5: Copy proposal evidence into the immutable receipt**

Add this field when constructing the approval receipt:

```ts
evidenceRefs: [...activePlanReview.proposal.evidenceRefs],
```

The existing fallback port spread then returns the same field for approval and replay. Validate receipt evidence references as unique non-empty strings, but do not require them to resolve against the current plan because an approved adaptation may remove a referenced Planned Workout.

- [ ] **Step 6: Keep schema v1 recovery behavior explicit**

Do not change `src/application/initializeWorkspace.ts` or `src/application/ports.ts` envelope versioning beyond type propagation. Confirm the existing `validateWorkspaceState` failure path restores `createDemoWorkspaceState()` for older incomplete envelopes.

- [ ] **Step 7: Run focused and regression tests**

Run: `npm test -- tests/workspace-application.test.ts tests/persistence.test.ts tests/demo-fixture.test.ts`

Expected: all pass.

- [ ] **Step 8: Commit the write and persistence slice**

```bash
git add src/application/createWorkspaceApplication.ts src/application/ports.ts src/application/initializeWorkspace.ts tests/workspace-application.test.ts tests/persistence.test.ts
git commit -m "feat: preserve coaching evidence across sessions"
```

## Task 3: Extend `get_athlete_context` into the bounded Coaching Briefing

**Files:**

- Modify: `src/application/readSelectors.ts`
- Test: `tests/read-selectors.test.ts`

- [ ] **Step 1: Write the failing briefing contract test**

Assert one response contains the profile, a small plan summary, current evidence, stable topic, current feedback, and recent history:

```ts
expect(result.data).toMatchObject({
  athlete: {
    profile: {
      preferredLongRunDay: { value: "Sunday" },
      maximumWeekdayTrainingDurationMinutes: { value: 60 },
    },
  },
  trainingPlan: {
    planVersion: 1,
    currentWeek: { from: "2026-08-24", to: "2026-08-30" },
  },
  activeCoachingTopics: [
    { id: "coaching-topic:shin-discomfort", status: "monitoring" },
  ],
  recentAthleteFeedback: [{ id: "athlete-feedback:seed-shin-discomfort" }],
  recentAdaptationHistory: [],
});
expect(result.data.trainingPlan.currentWeekPlannedWorkouts).toHaveLength(5);
expect(result.evidenceRefs).toContain(
  "coaching-topic:coaching-topic:shin-discomfort",
);
```

Add a second test that records current `painReported: false` feedback in a cloned valid state and proves the response includes it while `activeCoachingTopics[0]` remains byte-for-byte equal to the seeded topic.

- [ ] **Step 2: Run the selector test and confirm failure**

Run: `npm test -- tests/read-selectors.test.ts`

Expected: briefing fields are absent.

- [ ] **Step 3: Define the additive read contract**

Add these fields to `AthleteContextData`:

```ts
trainingPlan: {
  planVersion: number;
  currentWeek: { from: IsoDate; to: IsoDate };
  currentWeekPlannedWorkouts: Array<
    Pick<PlannedWorkout, "id" | "date" | "type" | "title" | "purpose">
  >;
};
recentAthleteFeedback: AthleteFeedback[];
activeCoachingTopics: CoachingTopic[];
recentAdaptationHistory: AppliedPlanAdaptation[];
```

Keep the existing `asOf`, Athlete, race, phase, recent training, observations, and source fields.

- [ ] **Step 4: Build a deterministic bounded projection**

Use the fixture clock date to derive the ISO Monday-to-Sunday week, then project only that bounded decision window:

```ts
const plan = [...state.trainingPlan.plannedWorkouts].sort((a, b) =>
  a.date.localeCompare(b.date),
);
const today = state.clock.now.slice(0, 10) as IsoDate;
const currentDate = new Date(`${today}T00:00:00Z`);
const daysSinceMonday = (currentDate.getUTCDay() + 6) % 7;
const weekStart = new Date(currentDate);
weekStart.setUTCDate(currentDate.getUTCDate() - daysSinceMonday);
const weekEnd = new Date(weekStart);
weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
const from = weekStart.toISOString().slice(0, 10) as IsoDate;
const to = weekEnd.toISOString().slice(0, 10) as IsoDate;
const currentWeekPlannedWorkouts = plan
  .filter(({ date }) => date >= from && date <= to)
  .map(({ id, date, type, title, purpose }) => ({
    id,
    date,
    type,
    title,
    purpose,
  }));
```

Return the five most recent feedback records and three most recent receipts, and filter topics to `status === "monitoring"`. Clone arrays where necessary so callers cannot mutate state. Add evidence references for plan version, returned Planned Workouts, returned feedback, returned topics, and returned receipts.

- [ ] **Step 5: Run the selector and application suites**

Run: `npm test -- tests/read-selectors.test.ts tests/workspace-application.test.ts`

Expected: all pass, including the stable-topic test.

- [ ] **Step 6: Commit the shared read model**

```bash
git add src/application/readSelectors.ts tests/read-selectors.test.ts
git commit -m "feat: expose bounded coaching briefing"
```

## Task 4: Reject structurally identical adaptation alternatives

**Files:**

- Modify: `src/domain/review.ts`
- Test: `tests/review-coordinator.test.ts`

- [ ] **Step 1: Add a failing proposal-validation test**

Clone the accepted recommendation into the alternative while preserving a different option ID and label:

```ts
const proposal = structuredClone(acceptedProposal);
proposal.alternative.workoutChanges = structuredClone(
  proposal.recommended.workoutChanges,
);

expect(validateReviewProposal(proposal, context)).toEqual({
  valid: false,
  issues: expect.arrayContaining([
    expect.objectContaining({ path: "alternative.workoutChanges" }),
  ]),
});
```

Also reverse the alternative change order and object property order to prove normalization catches semantic identity.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- tests/review-coordinator.test.ts`

Expected: the proposal is currently accepted.

- [ ] **Step 3: Add a stable Workout Change signature**

Add a private canonical JSON helper that recursively sorts object keys, canonicalizes arrays, and sorts the resulting Workout Change strings before joining them. Compare only `workoutChanges`; explanations and labels do not make two adaptations different.

```ts
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function workoutChangeSignature(changes: unknown[]): string {
  return changes.map(stableJson).sort().join("|");
}
```

After both options have passed shape validation, reject equal signatures at path `alternative.workoutChanges` with a plain message: `Alternative Workout Changes must differ from the recommendation.`

- [ ] **Step 4: Run the review tests**

Run: `npm test -- tests/review-coordinator.test.ts`

Expected: identical normalized changes fail; existing valid options pass.

- [ ] **Step 5: Commit the proposal invariant**

```bash
git add src/domain/review.ts tests/review-coordinator.test.ts
git commit -m "fix: require distinct adaptation options"
```

## Task 5: Render the same Coaching Briefing in the shared workspace

**Files:**

- Modify: `src/ui/WorkspaceApp.tsx`
- Modify: `src/ui/styles.css`
- Test: `e2e/training-plan.spec.ts`

- [ ] **Step 1: Add failing public UI tests**

In the existing controlled browser harness, assert initial visibility:

```ts
await expect(
  page.getByRole("heading", { name: "Athlete Profile" }),
).toBeVisible();
await expect(page.getByText("Preferred long run")).toBeVisible();
await expect(page.getByText("Sunday", { exact: true })).toBeVisible();
await expect(page.getByText("Maximum weekday session")).toBeVisible();
await expect(page.getByText("60 minutes", { exact: true })).toBeVisible();
await expect(page.getByRole("heading", { name: "Monitoring" })).toBeVisible();
await expect(page.getByText("Shin discomfort", { exact: true })).toBeVisible();
await expect(
  page.getByText(
    "My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.",
  ),
).toBeVisible();
```

Extend the existing approval/reload/reset test: after approval and reload, assert a `Recent plan adaptations` card contains the selected label and `Plan 1 → 2`; after reset, assert that card is absent while `Shin discomfort` remains.

- [ ] **Step 2: Run the focused E2E test and confirm failure**

Run: `npx playwright test e2e/training-plan.spec.ts --grep "coaching briefing|persists feedback"`

Expected: profile, topic, or history UI assertions fail.

- [ ] **Step 3: Make `ContextRail` consume only the shared read projection**

Remove the separate `athleteFeedback` prop from `ContextRail`; use `context.recentAthleteFeedback`. Add three concise sections:

1. `Athlete Profile`: existing volume, half-marathon, and threshold fields plus Sunday and 60 minutes;
2. `Monitoring`: topic title, exact Athlete quote, recorded date, and follow-up condition;
3. `Recent plan adaptations`: selected option label, version transition, applied date, and affected workout count.

Do not duplicate selector logic in React and do not add a UI cache. Keep historical feedback available in the existing feedback section.

- [ ] **Step 4: Style with existing context-rail primitives**

Reuse existing card spacing, borders, typography, and responsive rules. Add only semantic modifiers needed for profile value rows, the monitoring status, and history metadata. Confirm no horizontal overflow at the existing mobile viewport.

- [ ] **Step 5: Run focused E2E and type checks**

Run: `npm run typecheck && npx playwright test e2e/training-plan.spec.ts --grep "coaching briefing|persists feedback"`

Expected: all selected checks pass.

- [ ] **Step 6: Commit the shared projection UI**

```bash
git add src/ui/WorkspaceApp.tsx src/ui/styles.css e2e/training-plan.spec.ts
git commit -m "feat: show longitudinal coaching context"
```

## Task 6: Teach a fresh Agent the six-tool lifecycle

**Files:**

- Modify: `src/adapters/webmcp/registerReadTools.ts`
- Test: `tests/webmcp-read-tools.test.ts`
- Test: `e2e/training-plan.spec.ts`

- [ ] **Step 1: Write failing registration-contract tests**

Keep asserting exactly six fallback registrations and unchanged schemas. Add description assertions for these responsibilities:

```ts
expect(descriptionFor("get_athlete_context")).toMatch(/start here/i);
expect(descriptionFor("record_athlete_feedback")).toMatch(
  /record.*before.*propos/i,
);
expect(descriptionFor("get_training_plan")).toMatch(/planVersion/i);
expect(descriptionFor("get_workout_context")).toMatch(/Planned Workout ID/i);
expect(descriptionFor("open_workout_adaptation_review")).toMatch(
  /exactly two.*on-page review/i,
);
expect(descriptionFor("read_workout_adaptation_decision")).toMatch(
  /same reviewId.*terminal/i,
);
```

Assert `record_athlete_feedback` still has only `requestId`, `relatedWorkoutId`, `rawText`, and `reported`; `relatedWorkoutResultId` remains application-derived.

- [ ] **Step 2: Run the adapter tests and confirm failure**

Run: `npm test -- tests/webmcp-read-tools.test.ts`

Expected: current generic descriptions fail the lifecycle assertions.

- [ ] **Step 3: Replace stale and generic descriptions**

Use descriptions with these exact responsibilities:

- `get_athlete_context`: start here for a bounded Coaching Briefing; identify the current plan version, active topics, recent feedback, and evidence before proposing changes.
- `record_athlete_feedback`: when the current Athlete message reports new workout experience, preserve the raw words and only explicitly stated structured fields before proposing related changes.
- `get_training_plan`: retrieve the relevant date range from the current plan version; use returned Planned Workout IDs in later calls and proposals.
- `get_workout_context`: inspect prescription, result, and feedback for one returned Planned Workout ID before explaining what happened.
- `open_workout_adaptation_review`: submit evidence-grounded rationale and exactly two ranked, structurally different options; open the on-page review; never apply a plan directly; the call returns immediately.
- `read_workout_adaptation_decision`: use the same `reviewId` after opening; poll only as needed until `applied`, `discuss_further`, or `cancelled`; return the Athlete-controlled terminal outcome.

Remove the stale issue-14 wording. Do not encode fixed workout IDs, fixed dates, or an exact model-generated adaptation.

- [ ] **Step 4: Extend the controlled fallback-path E2E proof**

In the existing six-tool harness, exercise this order against one browser state:

1. read Coaching Briefing;
2. record the supplied no-pain threshold feedback;
3. read plan and threshold workout context;
4. open two distinct adaptations using returned evidence references and current `planVersion`;
5. verify selection alone leaves `planVersion` unchanged;
6. press **Adapt my plan**;
7. read the applied result with the same `reviewId`;
8. reload and read Coaching Briefing again;
9. assert history contains the evidence references, chosen identity, before/after values, time, and `1 → 2` versions.

The test controls tool calls; it proves the contract is sufficient and coherent, while the enabled-host trials in Task 9 prove model discovery.

- [ ] **Step 5: Run adapter and controlled-flow tests**

Run: `npm test -- tests/webmcp-read-tools.test.ts && npx playwright test e2e/training-plan.spec.ts --grep "fallback|coaching briefing"`

Expected: exact six-tool registration and the complete controlled flow pass.

- [ ] **Step 6: Commit the discoverability contract**

```bash
git add src/adapters/webmcp/registerReadTools.ts tests/webmcp-read-tools.test.ts e2e/training-plan.spec.ts
git commit -m "feat: teach agents the coaching lifecycle"
```

## Task 7: Update the self-contained product and domain documentation

**Files:**

- Modify: `CONTEXT.md`
- Modify: `README.md`
- Modify: `docs/demo-athlete-coaching-contract-v1.md`
- Modify: `docs/implementation-and-verification-architecture.md`
- Modify: `docs/three-minute-judging-story.md`

- [ ] **Step 1: Record the resolved domain language**

Add concise definitions to `CONTEXT.md`:

```md
- **Athlete Profile** — Sourced, slow-changing coaching values such as normal volume, recent performance, threshold pace, preferred long-run day, and maximum weekday duration.
- **Coaching Topic** — A stable, timestamped Athlete concern that remains visible until its explicit follow-up condition is met.
- **Coaching Briefing** — The bounded `get_athlete_context` projection shared by the workspace and an attached Agent: profile, plan summary, recent evidence and feedback, active topics, and recent adaptation history.
- **Adaptation History** — Immutable receipts for Athlete-approved plan changes, including evidence, chosen option, affected before/after values, application time, and plan versions.
```

Do not add a separate “memory” or “coach-athlete skill” domain object.

- [ ] **Step 2: Update the contract and architecture docs**

In `docs/demo-athlete-coaching-contract-v1.md`, retain version 1.1 and document the additive Coaching Briefing fields, application-derived Workout Result reference, stable topic behavior, receipt payload, normalized option distinctness, and unchanged six-tool input contracts.

In `docs/implementation-and-verification-architecture.md`, show this single path:

```text
WorkspaceState
  -> validate / persist / reset
  -> selectAthleteContext (Coaching Briefing)
  -> React ContextRail + get_athlete_context
```

State that old incomplete schema-v1 data restores the exact fixture and that no second cache or server state exists.

- [ ] **Step 3: Update the README and judging story**

Explain that a fresh Agent learns the workflow from attached-site tool descriptions and obtains coaching facts from the briefing. Preserve the natural Athlete message exactly:

```text
That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn't hold the pace. No pain. Can you review what happened and make the rest of this week easier? Show me the options before changing my plan.
```

Describe adaptations as model-proposed and evidence-grounded without promising exact workout changes. Keep the human-only **Adapt my plan** gate explicit.

- [ ] **Step 4: Check prose, links, and formatting**

Run:

```bash
npx prettier --check CONTEXT.md README.md docs/demo-athlete-coaching-contract-v1.md docs/implementation-and-verification-architecture.md docs/three-minute-judging-story.md
rg -n "Spotify|Supabase|apply_plan|coach_athlete|coach-athlete" CONTEXT.md README.md docs/demo-athlete-coaching-contract-v1.md docs/implementation-and-verification-architecture.md docs/three-minute-judging-story.md
```

Expected: Prettier passes; search finds only deliberate statements rejecting `apply_plan` if already part of the public safety contract, and no private-company, Supabase, or required-skill language.

- [ ] **Step 5: Commit the documentation**

```bash
git add CONTEXT.md README.md docs/demo-athlete-coaching-contract-v1.md docs/implementation-and-verification-architecture.md docs/three-minute-judging-story.md
git commit -m "docs: explain fresh-agent coaching context"
```

## Task 8: Run the complete local candidate gate

**Files:**

- Verify: all files changed in Tasks 1–7
- Verify: `.github/workflows/ci.yml`

- [ ] **Step 1: Install with the pinned runtime**

Run:

```bash
nvm use 22.23.2
npm ci
```

Expected: clean install succeeds from the lockfile.

- [ ] **Step 2: Run the exact local CI sequence**

Run each command separately and stop on the first failure:

```bash
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:static
```

Expected: every command exits 0.

- [ ] **Step 3: Inspect the final diff and repository state**

Run:

```bash
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline --decorate origin/main..HEAD
```

Expected: no whitespace errors, no generated artifacts, no tracked `.DS_Store`, and only the planned commits ahead of the exact base.

- [ ] **Step 4: Perform the implementation self-review**

Confirm every acceptance path is covered by a named automated test: exact seed, invalid relationships, derived result link, stable topic, persistence/recovery/reset, receipt completeness, normalized distinctness, shared UI, six tools, selection non-mutation, approval mutation, replay, and reload history. Confirm there are no placeholders, `TODO`s, `any` escapes, new network calls, or an agent-callable apply path.

Run:

```bash
rg -n "TODO|FIXME|as any|apply_plan" src tests e2e
```

Expected: no new placeholder or unsafe-cast matches; any existing `apply_plan` documentation match states that the tool does not exist.

- [ ] **Step 5: Stop at the remote authority gate**

Report the exact commit SHA, the complete command results, and any remaining variance. Do not push, open a PR, change issue #38, merge, or deploy without explicit user authorization.

## Task 9: Prove fresh-Agent behavior on the exact deployed candidate

**Authority gate:** Do not begin this task until the user authorizes the remote workflow and deployment. Re-read `docs/agents/issue-tracker.md` before claiming or updating issue #38.

**Evidence target:** issue #38, using the exact deployed commit and URL.

- [ ] **Step 1: Publish and deploy the exact reviewed candidate through the repository's authorized path**

Record the commit SHA and deployed URL before trials. Verify the deployed page reports the same fixture and build identity where available. Do not treat local Playwright evidence as deployed-host evidence.

- [ ] **Step 2: Run three independent fresh-conversation trials**

For each trial:

1. reset the workspace;
2. attach the exact deployed page to a fresh generic ChatGPT Agent conversation with no repository skill and no corrective prompt;
3. send only the natural Athlete message from Task 7;
4. record the tool sequence, whether the current feedback was preserved before proposal, the evidence used, the two proposed adaptations, whether the on-page review opened, and whether the applied result returned;
5. record any clarification or recovery prompt verbatim.

Success requires all three trials to discover the workflow, use the context to propose two adaptations, and reach the human approval surface. The exact adaptations may vary. Report that variance rather than forcing identical model prose.

- [ ] **Step 3: Verify longitudinal recall from a second fresh conversation**

After approving one trial, open another fresh generic Agent conversation against the same browser-local workspace. Ask for current coaching context. Confirm `get_athlete_context` exposes the approved adaptation receipt with proposal evidence, chosen option, affected before/after values, application time, and plan version transition.

- [ ] **Step 4: Record the acceptance evidence in issue #38**

Post a concise table with exact deployed SHA/URL, host/model, trial result, observed tool order, proposed adaptation summary, corrective prompting, approval outcome, second-conversation history result, and variability. Link automated CI evidence. Do not copy private deliberation or abandoned approaches into the issue.

- [ ] **Step 5: Close only when the issue acceptance criteria are evidenced**

Use the repository's issue-closing workflow. If any trial needs corrective prompting or cannot reach the review, leave issue #38 open with the concrete failure and exact reproduction evidence.
