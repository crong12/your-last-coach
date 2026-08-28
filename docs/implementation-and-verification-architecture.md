# Implementation and verification architecture

Status: Accepted for the WebMCP Challenge proof of concept  
Architecture version: `1.0`  
Fixture contract: [`demo-athlete-v1`](demo-athlete-coaching-contract-v1.md)

This document defines the module boundaries, state ownership, adapter seams, deterministic lifecycle, verification layers, and release evidence for the Shared Coaching Workspace. It is an architecture decision artifact, not a production implementation specification.

## Goals

- Keep the proof of concept small enough to deliver before the Challenge deadline.
- Ensure the Athlete and Coach Agent read and mutate one authoritative Training Plan.
- Isolate emerging WebMCP host behaviour from ordinary application logic.
- Make Plan Approval explicit, previewable, atomic, and idempotent.
- Preserve a direct transition from synthetic data to a bespoke Brighton 2027 product.
- Produce verifiable evidence for the exact public release build.

## System shape

```mermaid
flowchart TD
    S["Demo / future COROS source"] --> A["Application core"]
    R["localStorage / future server repository"] <--> A
    U["React workspace"] <--> A
    W["WebMCP adapter"] <--> A
```

The application is a client-only React, TypeScript, and Vite SPA. The application core is framework-independent and exposes ordinary typed commands and queries. UI and adapters depend on the application core; the core does not depend on React, WebMCP, browser storage, or a hosting provider.

## Source modules

```text
src/
  domain/          Coaching types, value objects and invariants
  demo/            demo-athlete-v1 fixture and validation
  application/     Workspace reducer, commands, selectors and review state machine
  adapters/
    persistence/   Browser storage implementation
    webmcp/        Tool schemas, registration, execution and cleanup
  ui/              React views and components
  main.tsx          Composition root
```

### `domain`

Owns the canonical application vocabulary and data structures for Athlete, Target Race, Training Plan, Planned Workout, Workout Result, Athlete Feedback, Coach Recommendation, Workout Adaptation, Plan Approval, plan versions, and idempotency receipts.

It contains no browser, storage, framework, WebMCP, or fixture code.

### `demo`

Owns the immutable `demo-athlete-v1` seed, fixed clock, source-labelled synthetic observations, and runtime fixture validation. It may create the initial `WorkspaceState`, but it does not own subsequent mutations.

### `application`

Owns:

- the pure workspace reducer;
- typed commands and queries;
- selectors used by both UI and WebMCP reads;
- validation of Plan Approval and Workout Changes;
- plan-version and idempotency checks;
- the transient review state machine;
- structured application outcomes.

React components and WebMCP callbacks never edit Training Plan objects directly.

### `adapters/persistence`

Implements `WorkspaceRepository` for browser-local storage. It loads, validates, saves, clears, and reports durability. It catches unavailable-storage and quota failures and supports the accepted in-memory fallback.

### `adapters/webmcp`

Owns only host mechanics:

- capability detection;
- tool names, descriptions, JSON input schemas, and annotations;
- registration after successful application initialization;
- translation between tool payloads and typed application commands/queries;
- `AbortSignal`, unload, cleanup, and single-settlement behaviour;
- the stored two-call fallback delivery;
- structured safe errors.

It does not generate Coach Recommendations, interpret Athlete evidence, or mutate the Training Plan independently.

### `ui`

Renders the weekly and monthly Training Plan views, workout detail, shared evidence, Athlete Feedback, temporary review modal, calendar preview, adapted-state receipts, Demo Guide, WebMCP connection status, persistence warnings, and reset flow.

Presentation components consume selectors and dispatch application commands. Component-local state is limited to non-authoritative presentation concerns.

### `main.tsx`

Acts as the composition root. It loads the repository, validates or restores the fixture, constructs the application and review coordinator, mounts React, registers WebMCP tools, and owns top-level cleanup.

## Product-transition ports

Two deliberately small interfaces isolate the POC implementations:

```ts
interface CoachingContextSource {
  loadContext(): Promise<CoachingContext>;
}

interface WorkspaceRepository {
  load(): Promise<PersistedWorkspace | null>;
  save(workspace: PersistedWorkspace): Promise<Durability>;
  clear(): Promise<void>;
}
```

For the POC:

- `CoachingContextSource` reads `demo-athlete-v1`;
- `WorkspaceRepository` uses `localStorage`.

For the future product:

- a separate scheduled process can query COROS MCP and hydrate a normalized context source;
- a server-backed repository can persist Training Plan, Athlete Feedback, and applied decisions.

Current COROS MCP data remains read-only for this POC. The application does not claim COROS wire-format compatibility. Future authenticated schemas map through an adapter rather than replacing the domain model.

## Authoritative state

One reducer-owned serializable `WorkspaceState` is authoritative for Athlete-visible and Coach-Agent-readable domain state:

```ts
type WorkspaceState = {
  athlete: Athlete;
  targetRace: TargetRace;
  trainingPhase: TrainingPhase;
  observations: SyntheticCorosShapedSnapshot;
  workoutResults: WorkoutResult[];
  trainingPlan: {
    planVersion: number;
    plannedWorkouts: PlannedWorkout[];
  };
  athleteFeedback: AthleteFeedback[];
  processedRequestIds: string[];
  appliedReviewIds: string[];
  adaptationReceipts: AdaptationReceipt[];
};
```

The persisted envelope contains the complete serializable snapshot:

```ts
type PersistedWorkspace = {
  schemaVersion: 1;
  seedVersion: "demo-athlete-v1";
  savedAt: string;
  state: WorkspaceState;
  undeliveredFallbackResult?: AdaptationDecision;
};
```

All human views and WebMCP reads use selectors over the same state instance. No independently cached Training Plan is authoritative.

## Transient review state

The active review is a separate in-memory state machine because Promise resolvers, abort listeners, registration handles, selection, and preview cannot meaningfully survive reload:

```text
idle -> reviewing -> applied | discuss_further | cancelled
```

The review coordinator exclusively owns:

- the active `reviewId`;
- the proposal and expected `planVersion`;
- the selected option and derived preview;
- the primary tool Promise resolver;
- abort and unload cleanup;
- exactly-once terminal settlement.

An unfinished primary review is cancelled on reload, unload, reset, or host abort. A compatibility-fallback review applies through the same application command; only its completed, undelivered terminal result persists for later delivery.

## Planned Workout and Workout Result

Planned intent and recorded outcome are separate but comparable.

```ts
type PlannedWorkout = {
  id: string;
  date: string;
  type: WorkoutType;
  title: string;
  purpose: string;
  prescription: {
    blocks: WorkoutBlock[];
  };
};

type WorkoutResult = {
  id: string;
  plannedWorkoutId?: string;
  startedAt: string;
  status: "completed" | "partial" | "stopped";
  summary: WorkoutSummary;
  laps: WorkoutLap[];
};
```

Planned Workout blocks express intent. Workout Result laps express device-recorded performance. Both use explicit units. A lap may reference a planned block only when the correspondence is reliable; adaptation never rewrites completed history.

The Workout Result model is conceptually COROS-shaped—activity summary plus laps—but remains an internal canonical structure because public COROS documentation does not publish exact response schemas.

## Workout Changes

Workout Adaptations contain validated CRUD mutations:

```ts
type WorkoutChange =
  | { kind: "create"; workout: PlannedWorkoutDraft }
  | {
      kind: "update";
      workoutId: string;
      changes: {
        date?: string;
        title?: string;
        purpose?: string;
        prescription?: WorkoutPrescription;
      };
    }
  | { kind: "delete"; workoutId: string };
```

Read operations remain in `get_training_plan` and `get_workout_context`. IDs are immutable. A nested prescription is replaced as one complete validated value; arbitrary JSON Patch paths are not accepted. Deleting the only Planned Workout on a date leaves that date as rest. An Adaptation Receipt allows the UI to show that the rest day was created by an approved adaptation.

Every proposed option records the `planVersion` on which it was based. A mismatch returns `stale_plan` without applying or merging changes.

## Plan Approval transaction

Only the Athlete pressing **Adapt my plan** authorizes mutation. The selected option already contains the exact changes shown in the preview.

The application command:

1. verifies the active review, unused `reviewId`, current `planVersion`, and valid selected option;
2. validates every Workout Change against the current Training Plan;
3. produces the entire next Training Plan or rejects without mutation;
4. increments `planVersion`;
5. records the `reviewId` and Adaptation Receipt atomically in state;
6. attempts to persist the complete resulting snapshot;
7. produces the terminal result for the pending primary call or stored fallback delivery.

The primary and fallback paths invoke the same command. If browser persistence fails, the in-memory application remains authoritative for the current page, the terminal result includes `durability: "memory_only"`, and the UI warns that reload will lose the changes.

Repeated `reviewId` or `requestId` values return their existing outcome and cannot apply or record twice.

## Initialization, connection and reset

Initialization order:

1. Load the persisted envelope.
2. Validate schema, seed version, and domain invariants.
3. Restore `demo-athlete-v1` when state is missing, invalid, or unsupported.
4. Construct the application core and review coordinator.
5. Mount the Shared Coaching Workspace.
6. Register the seven WebMCP tools exactly once when `document.modelContext` is available.
7. Publish `connected`, `unavailable`, or `error` status to the UI.

An invalid saved snapshot is replaced rather than heuristically repaired. The UI shows a restrained notice that demo state was refreshed. A migration switch remains available when a second schema version actually exists.

**Reset demo** uses a lightweight in-page confirmation. Approval of reset:

- cancels an active review with reason `reset`;
- clears the persisted envelope and undelivered fallback result;
- clears Athlete Feedback, plan changes, idempotency records, receipts, selection, and preview;
- restores the exact fixture, fixed clock, and initial `planVersion`;
- leaves browser capability detection and tool definitions available.

## Structured outcomes

Expected tool and application failures return safe structured outcomes rather than raw exceptions or stack traces:

```ts
type ApplicationError = {
  status: "error";
  code:
    | "invalid_input"
    | "not_found"
    | "busy"
    | "stale_plan"
    | "cancelled"
    | "storage_unavailable";
  message: string;
  retryable: boolean;
};
```

Unknown programming faults are logged locally in development and converted to a generic non-sensitive failure at the WebMCP boundary.

## Demo Guide and integration status

Week and Month remain the primary Training Plan views. A restrained persistent header badge displays WebMCP state. Activating it opens a Demo Guide utility drawer or tab containing:

- the synthetic scenario and provenance label;
- a suggested ChatGPT prompt;
- connection state and registered tool names;
- the latest tool outcome;
- browser-enablement guidance;
- Reset demo.

This information is subordinate to the coaching experience. The full human workspace remains usable when WebMCP is unavailable.

## Automated verification

Every release candidate must pass:

1. TypeScript type-check.
2. Production Vite build.
3. Vitest domain and application tests:
   - fixture and state validation;
   - create, update, and delete Workout Changes;
   - version rejection and atomic application;
   - feedback and adaptation idempotency;
   - review state-machine transitions and exactly-once settlement;
   - selection/preview without mutation;
   - primary and fallback semantic equivalence;
   - deterministic reset.
4. Vitest adapter tests:
   - valid, invalid, unsupported, and unavailable storage;
   - exact tool names, descriptions, schemas, and read-only annotations;
   - structured read and mutation results;
   - absent WebMCP API behaviour;
   - abort, unload, cleanup, duplicate calls, and fallback delivery.
5. Playwright product flows:
   - seeded first visit and Demo Guide;
   - Week and Month views;
   - workout details and shared evidence;
   - feedback recording;
   - review card selection and calendar preview;
   - explicit Plan Approval and adapted markers;
   - reload persistence;
   - reset and graceful non-WebMCP operation.

Playwright begins each scenario from cleared storage and the fixed demo clock. Test helpers invoke application/tool handlers through public interfaces rather than editing internal state.

## CI and deployment

GitHub Actions uses a pinned supported Node version and committed lockfile. The required workflow runs install, type-check, Vitest, production build, and Playwright. Vercel supplies preview deployments for review and a public top-level HTTPS production deployment.

Version-controlled deployment configuration must provide `Origin-Agent-Cluster: ?1`. The normal human interface must not require `document.modelContext`. Production promotion occurs only from a commit that passed the automated gate.

## Manual host release gate

The exact production URL and release commit require headed smoke testing in:

- enabled Chrome 149+ through the Model Context Tool Inspector;
- ChatGPT's in-app browser with the deployed Shared Coaching Workspace attached.

The checklist verifies:

- discovery of all seven tools;
- shared Athlete, Training Plan, Workout Result, and health/load reads;
- Athlete Feedback recording;
- the pending imperative review through Plan Approval;
- preview-before-mutation and visible calendar updates;
- the stored compatibility fallback;
- cancellation, stale/duplicate protection, reload, and reset;
- consistent evidence for the Athlete and Coach Agent;
- accurate behaviour when WebMCP is unavailable.

ChatGPT-specific attachment and timeout behaviour cannot be inferred from the successful Chrome prototype and remains submission-blocking manual evidence.

## Acceptance evidence

A version-controlled release checklist records:

- release commit SHA;
- production deployment URL;
- automated commands and results;
- Chrome and ChatGPT versions;
- tester and UTC timestamp;
- each manual scenario result;
- known limitations.

The README links to this checklist and identifies the exact judge flow. The public video, Devpost entry, tested commit, and production deployment must describe the same release. The tested release is frozen for judging after submission.

## Scope boundary

This architecture does not implement real COROS authentication or synchronization, a scheduled hydration process, server persistence, accounts, full plan generation, Phase Transition logic, injury diagnosis, multiple Athletes, or in-app chat. The ports make later replacement possible; they do not expand the POC.
