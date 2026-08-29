# Your Last Coach

Your Last Coach is a personal Shared Coaching Workspace where an Athlete and a Coach Agent inspect the same training evidence, compare Workout Adaptations, and update a visible Training Plan through explicit Athlete approval.

The deterministic demonstration follows Sam, a fictional runner preparing for a 3:40 Brighton Marathon on 4 April 2027. After a partial threshold Workout Result, an attached Agent can read the shared context, record Sam's feedback, propose evidence-grounded options, and open a review in the workspace. Selecting an option previews the calendar change. Only **Adapt my plan** changes the Training Plan.

The fixture uses synthetic Athlete, workout, recovery, and device-shaped observations. The application does not diagnose injury, generate a complete training season, or connect to live device data.

## Product surface

The repository contains a client-only React, TypeScript, and Vite application. When an attached-site host provides WebMCP, the normal path registers exactly six fallback tools:

- `get_athlete_context`
- `get_training_plan`
- `get_workout_context`
- `record_athlete_feedback`
- `open_workout_adaptation_review`
- `read_workout_adaptation_decision`

The tool descriptions explain each responsibility and the review lifecycle. A fresh generic Agent learns that workflow from the attached-site descriptions. `get_athlete_context` returns a bounded Coaching Briefing with the Athlete Profile, current plan summary, recent evidence and feedback, active Coaching Topics, and recent Adaptation History. The workspace remains usable when an attached-site host is unavailable.

The Agent proposes adaptations from the evidence it reads. The app validates the proposal and renders the review; it does not generate coaching judgment or require fixed Agent wording or fixed workout changes.

## Local setup

The repository and CI use Node.js `22.23.2`, recorded in [`.nvmrc`](.nvmrc).

```bash
nvm install
nvm use
npm ci
npm run dev
```

Open the local URL printed by Vite. The Shared Coaching Workspace works as a human interface in an ordinary browser; an attached-site host is required only for Coach Agent tools.

## Architecture

`WorkspaceState` is the one authoritative application-owned state. React and WebMCP read it through the same application selectors and commands.

- `src/domain/` owns coaching types, invariants, Plan Approval, and Workout Change validation.
- `src/demo/` owns the immutable `demo-athlete-v1` fixture and fixed clock.
- `src/application/` owns commands, queries, plan versions, idempotency, and the review lifecycle.
- `src/adapters/persistence/` stores a versioned browser envelope and keeps the current page usable when browser storage is unavailable.
- `src/adapters/webmcp/` owns tool schemas, registration, lifecycle descriptions, and host cleanup.
- `src/ui/` renders the Training Plan, evidence, Demo Guide, review, preview, and reset flow.
- `src/main.tsx` initializes the fixture, repository, application, fallback tools, and UI.

The detailed boundaries are recorded in [Implementation and verification architecture](docs/implementation-and-verification-architecture.md). The fixture and tool schemas are recorded in [Demo Athlete and coaching tool contract](docs/demo-athlete-coaching-contract-v1.md).

## Judge flow

1. Open the workspace and use **Reset demo** to restore the fixed state.
2. Keep the Week view visible and inspect the partial threshold workout, the rest of the week, and the shared evidence.
3. In the attached Agent conversation, send:

   > That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn't hold the pace. No pain. Can you review what happened and make the rest of this week easier? Show me the options before changing my plan.

4. The Agent records the Athlete Feedback and uses the tool descriptions to retrieve Athlete, Training Plan, Workout Result, and observation context.
5. The Agent calls `open_workout_adaptation_review` with two ranked, evidence-grounded options. The review opens without changing the plan.
6. Select each option to inspect its calendar preview. Selection alone does not mutate the Training Plan.
7. Press **Adapt my plan** to grant Plan Approval, or choose **None — discuss further** to leave the plan unchanged.
8. The Agent calls `read_workout_adaptation_decision` with the same `reviewId` when it needs the fallback result.
9. Inspect the updated plan and its immutable Adaptation History receipt when an option was approved.

The fallback wire terminal statuses are `approved`, `discuss_further`, and `cancelled`. An `approved` result carries the applied adaptation receipt; the receipt is the history record, rather than a separate tool status.

## State, persistence, and reset

The application saves the complete validated workspace envelope in browser `localStorage`. If browser storage is unavailable or rejects a write, the current page remains authoritative and displays a warning that changes will be lost on reload. Invalid or incomplete saved state is replaced with the validated fixture.

**Reset demo** opens an in-page confirmation, cancels any active review, clears saved changes and review history, and restores `demo-athlete-v1`, its fixed clock, original Planned Workouts, seeded Athlete Feedback and Coaching Topic, and plan version 1.

## Automated verification

Run the local checks from a clean install:

```bash
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:static
```

The tests cover the fixture and relationships, bounded Coaching Briefing, persistence and recovery, feedback and review idempotency, preview-before-mutation, Plan Approval, fallback result delivery, and reset. The browser suites use a controlled WebMCP host harness; the human workspace remains the approval surface.

## Licence

Your Last Coach is available under the [MIT License](LICENSE).
