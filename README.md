# Your Last Coach

Your Last Coach is a Shared Coaching Workspace where a recreational Athlete and a Coach Agent inspect the same training evidence, compare Workout Adaptations, and update a visible Training Plan through explicit Athlete approval.

The demonstration follows Sam, a fictional runner preparing for a 3:40 Brighton Marathon on 4 April 2027. After an incomplete threshold workout, the Coach Agent can read the seeded training context, record Sam's feedback, propose two ranked adaptations, and open a review in the workspace. Selecting an option previews the calendar change. Only **Adapt my plan** changes the Training Plan.

All Athlete, workout, recovery, and COROS-shaped observations are deterministic synthetic data. The application does not connect to COROS, diagnose injury, generate a complete training season, or provide authenticated multi-user persistence.

## Product surface

The repository ships a client-only React, TypeScript, and Vite application. When WebMCP is available, the Coach Agent receives these six fallback tools:

- `get_athlete_context`
- `get_training_plan`
- `get_workout_context`
- `record_athlete_feedback`
- `open_workout_adaptation_review`
- `read_workout_adaptation_decision`

The tool descriptions provide the Agent’s workflow. A fresh generic Agent uses them to preserve the Athlete’s report, read the bounded Coaching Briefing, inspect the relevant Training Plan and Workout Result, and open a review. The normal workspace remains usable when WebMCP is unavailable.

## Local setup

The exact repository and CI Node.js version is `22.23.2`, recorded in [`.nvmrc`](.nvmrc). Vercel selects the compatible `22.x` runtime family from `package.json` because its build platform supports Node versions at major-version granularity.

With a version manager that reads `.nvmrc`:

```bash
nvm install
nvm use
npm ci
npm run dev
```

Open the local URL printed by Vite. The Shared Coaching Workspace works as a human interface in an ordinary browser; a WebMCP host is required only for Coach Agent tools.

## Architecture

The application keeps one authoritative, application-owned workspace state. React and WebMCP use the same application commands and selectors.

- `src/domain/` owns coaching types, invariants, Plan Approval, and Workout Adaptation validation.
- `src/demo/` owns the immutable `demo-athlete-v1` fixture and fixed clock.
- `src/application/` owns commands, queries, plan versions, idempotency, and the review lifecycle.
- `src/adapters/persistence/` stores a versioned browser envelope and falls back to page memory when storage is unavailable.
- `src/adapters/webmcp/` owns tool registration and host mechanics without making coaching judgments.
- `src/ui/` renders the Training Plan, evidence, Demo Guide, adaptation review, and reset flow.
- `src/main.tsx` initializes the fixture, repository, application, fallback WebMCP tools, and UI.

The detailed boundaries are recorded in [Implementation and verification architecture](docs/implementation-and-verification-architecture.md). The fixture and tool schemas are recorded in [Demo Athlete and coaching tool contract](docs/demo-athlete-coaching-contract-v1.md).

## Judge flow

1. Open the workspace and use **Reset demo** to restore the fixed state.
2. Keep the Week view visible. The original plan shows Thursday's 6 km recovery run, Saturday's 8 km easy run with strides, and Sunday's 18 km long run.
3. In ChatGPT with the site attached, send:

   > That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn't hold the pace. No pain. Can you review what happened and make the rest of this week easier? Show me the options before changing my plan.

4. The Coach Agent follows the attached-site descriptions to record Athlete Feedback and read the Coaching Briefing and relevant context.
5. The Agent calls `open_workout_adaptation_review` with two model-proposed, evidence-grounded options.
6. In the workspace, preview the options before deciding.
7. Press **Adapt my plan**. Selection alone does not mutate the Training Plan.
8. The Agent calls `read_workout_adaptation_decision` to receive the structured result.
9. Confirm that the selected proposal changes the visible plan and that the resulting Adaptation History receipt is available.

The approved three-minute presentation contract is in [Three-minute judging story](docs/three-minute-judging-story.md).

## Reset and persistence

**Reset demo** opens an in-page confirmation and restores `demo-athlete-v1`, its fixed clock, plan version 1, original Planned Workouts, seeded Athlete Feedback and Coaching Topic, and no session review or adaptation state.

Approved state is stored in browser `localStorage` and normally survives reloads in the same browser profile. If storage is unavailable or rejects a write, the current page remains authoritative and displays a warning that changes will be lost on reload. Invalid or unsupported saved state is replaced with the validated fixture.

The application has no account, server database, cross-device synchronization, or production COROS integration. Browser data belongs to the current browser profile and can be restored with **Reset demo**.

## Automated verification

Run the full local gate from a clean install:

```bash
npm ci
npm run format:check && \
  npm run typecheck && \
  npm test && \
  npm run build && \
  npm run test:e2e && \
  npm run test:static
```

`npm run test:e2e` exercises the application and both review semantics through a controlled WebMCP harness. `npm run test:static` serves the existing production build from `dist/` and verifies that the public fallback workspace loads without WebMCP or external runtime requests. Neither test substitutes for manual verification in an enabled WebMCP host.

GitHub Actions runs the same stages for pull requests targeting `main` and pushes to `main`. See the [verification workflow](.github/workflows/ci.yml) and the [release-candidate evidence template](docs/release-candidate-evidence.md).

## Vercel deployment

[`vercel.json`](vercel.json) declares the Vite build, lockfile-only install, `dist/` output, and `Origin-Agent-Cluster: ?1` response header. It does not link this repository to a Vercel project or authorize deployment.

For an authorized release candidate:

1. Select the exact commit whose GitHub Actions verification succeeded.
2. Import or deploy the repository root as a Vite project without adding application credentials.
3. Keep the committed install, build, output, Node `22.x`, and header configuration.
4. Record the immutable commit, deployment identifier, public HTTPS URL, CI run, resolved Vercel Node version from the build log, and UTC deployment time in the evidence template.
5. Verify the public URL signed out, inspect the response header, and complete the separate enabled-host WebMCP checks before accepting the candidate.

No deployment URL or manual-host result is claimed by this repository documentation.

## Licence

Your Last Coach is available under the [MIT License](LICENSE).
