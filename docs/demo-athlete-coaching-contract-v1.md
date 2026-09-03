# Demo Athlete and coaching tool contract

Status: Accepted target for the WebMCP Challenge proof of concept

Contract version: `1.1`

Fixture version: `demo-athlete-v1`

Fixed demo time: `2026-08-26T20:15:00+01:00` (`Europe/London`)

This contract defines the deterministic fixture and Coach Agent–Shared Coaching Workspace boundary for the proof of concept. It is demo-oriented, not a production COROS integration contract.

Version 1.1 gives a fresh Coach Agent a bounded Coaching Briefing and makes the fallback review journey discoverable from the registered tools. The runtime exposes the six-tool fallback surface, and all Athlete-visible and Coach-Agent-readable context comes from the same workspace state. Issue 66 adds a durable pending proposal lifecycle and an explicit `declined` result for **Keep current plan** without changing that six-tool surface.

## Demo Athlete

- Display name: Sam
- Persona: fictional intermediate recreational marathon runner
- Target Race: Brighton Marathon, 4 April 2027
- Performance objective: 3:40
- Recent half-marathon ability: approximately 1:42
- Normal weekly volume: 42–48 km
- Synthetic threshold pace: approximately 4:38/km
- Training Phase: Aerobic development
- Preferred long-run day: Sunday
- Maximum weekday training duration: 60 minutes

The Shared Coaching Workspace addresses the Athlete as “you” in coaching copy. “Sam” is used only where a name naturally belongs, such as the workspace header.

## Data horizons

- Planned Workouts cover August 2026 so the weekly and monthly Training Plan views share one fixture.
- Detailed Workout Results cover the threshold sessions on 6, 13, and 26 August 2026.
- Older history is represented by the current load snapshot and one active Coaching Topic.
- The hero interaction begins immediately after the incomplete workout on Wednesday 26 August.

The other August Planned Workouts exist to make the month view coherent; the coaching decision does not rely on their lap-level details.

## Longitudinal coaching context

### Athlete Profile

The fixture carries only slow-changing fields that can materially affect a nearby coaching decision.

| Field                             | Value                 | Provenance                          | Effective time                 |
| --------------------------------- | --------------------- | ----------------------------------- | ------------------------------ |
| Normal weekly volume              | 42–48 km              | Synthetic training-history estimate | As of the fixed demo time      |
| Recent half-marathon ability      | Approximately 1:42    | Seeded Athlete Profile              | Current at the fixed demo time |
| Threshold pace                    | Approximately 4:38/km | Synthetic fitness estimate          | As of the fixed demo time      |
| Preferred long-run day            | Sunday                | Athlete-stated preference           | Current                        |
| Maximum weekday training duration | 60 minutes            | Athlete-stated recurring constraint | Current                        |

Height, weight, heart-rate zones, surface preference, and other possible profile fields are absent because they do not affect the judging decision. Missing profile values are not inferred.

### Coaching Topic

The fixture contains one ongoing matter:

| Field               | Value                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Stable ID           | `coaching-topic:shin-discomfort`                                                                                |
| Title               | Shin discomfort                                                                                                 |
| Status              | `monitoring`                                                                                                    |
| Athlete report      | “My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.” |
| First reported      | Sunday 23 August 2026, after the long run                                                                       |
| Last reported       | Sunday 23 August 2026, after the long run                                                                       |
| Evidence            | One historical Athlete Feedback record linked to the 23 August Workout Result                                   |
| Follow-up condition | The next Athlete report about a run                                                                             |

The topic preserves what the Athlete reported without diagnosing an injury. Silence does not resolve it. Recording new Athlete Feedback does not mutate or close this stable Coaching Topic. The judging message's “No pain” statement is relevant new evidence: it appears beside the topic in the Coaching Briefing, while accumulated fatigue remains the main basis for the current recommendation.

### Coaching Briefing

`get_coaching_briefing` returns a bounded Coaching Briefing containing:

- the Athlete, Target Race, and current Training Phase;
- the Athlete Profile fields above;
- the current load, recovery, and health snapshot;
- a current-week Training Plan summary with `planVersion`, ISO Monday-to-Sunday bounds, and the Planned Workouts in that week;
- `recentTraining`, which currently contains the complete `state.workoutResults` array (all ten fixture Workout Results); it is not separately truncated to exclude older results;
- the five newest Athlete Feedback records;
- the active monitoring Coaching Topics with their evidence references and follow-up conditions; and
- the three newest Adaptation History receipts when approved adaptations exist.

The result also carries a versioned `interactionContract`, separate from the authoritative coaching evidence. Its ordered steps require the Agent to read relevant evidence; obtain any host-required consent before recording supplied feedback and before composing or presenting adaptations; record the exact feedback; prepare one recommendation and one meaningful alternative without presenting them in conversation; make the native review their first user-facing presentation; wait without mutating; and read the terminal decision with the same `reviewId`. Feedback-recording consent authorizes only that write. Only **Adapt my plan** grants Plan Approval.

The Shared Coaching Workspace renders the same briefing from the same authoritative state. The briefing is a current projection, not a second source of truth or a transcript summary. Its bounded fields are the current ISO week plan, newest five feedback records, monitoring topics, and newest three receipts; the current `recentTraining` behavior is the complete fixture result array described above.

## Recent training history

| Date       | Planned Workout / Workout Result     |  Distance |
| ---------- | ------------------------------------ | --------: |
| Thu 6 Aug  | Completed `3 × 2 km threshold`       |     11 km |
| Thu 13 Aug | Completed `5 × 1 km threshold`       |    9.5 km |
| Sat 15 Aug | Easy run with strides                |      8 km |
| Sun 16 Aug | Long run                             |     18 km |
| Tue 18 Aug | Easy run                             |     10 km |
| Wed 19 Aug | Steady run including 5 km tempo      |     12 km |
| Fri 21 Aug | Easy run                             |      8 km |
| Sat 22 Aug | Recovery run                         |      6 km |
| Sun 23 Aug | Long run                             |     20 km |
| Mon 24 Aug | Recovery run                         |      6 km |
| Wed 26 Aug | Partial `5 × 1 km threshold` workout | see below |

The 18–23 August week totals 56 km, above the Athlete’s normal 42–48 km range. This establishes a credible heavy-week context without implying reckless training.

## Incomplete threshold workout

Planned structure:

- 2 km warm-up
- `5 × 1 km` at 4:35–4:40/km with 90-second jog recoveries
- 1.5 km cooldown

Recorded work repetitions:

| Rep |          Pace | Average heart rate |
| --: | ------------: | -----------------: |
|   1 |       4:36/km |            165 bpm |
|   2 |       5:08/km |            171 bpm |
|   3 |       5:27/km |            176 bpm |
|   4 | Not completed |                  — |
|   5 | Not completed |                  — |

Recorded jog recoveries after the first two repetitions slow from 7:52/km to 8:16/km.

The Athlete completes approximately 1 km of easy cooldown after stopping. The Workout Result status is `partial`.

The synthetic device-shaped observations establish pace deterioration, rising heart rate, and three completed work repetitions. They do not establish why the Athlete stopped.

## Synthetic COROS-shaped snapshot

```json
{
  "adapter": "synthetic-coros-shaped",
  "asOf": "2026-08-26T20:15:00+01:00",
  "provenance": "Seeded internal adapter grounded in documented read-only COROS capability classes; not an authenticated COROS wire format.",
  "trainingLoad": {
    "shortTerm": 68,
    "longTerm": 51,
    "ratio": 1.33
  },
  "recovery": {
    "percent": 46,
    "classification": "partially_recovered"
  },
  "sleep": {
    "durationMinutes": 442,
    "score": 81
  },
  "sleepHrvMs": {
    "value": 55,
    "syntheticNormalRange": [49, 63]
  },
  "restingHeartRateBpm": 52,
  "dailyStress": "unremarkable"
}
```

The evidence is intentionally mixed: elevated load and reduced recovery support caution, while sleep, HRV, resting heart rate, and stress do not indicate a broad collapse.

The Athlete and Coach Agent inspect the same seeded snapshot. The Athlete sees it in the Shared Coaching Workspace; the Coach Agent reads it structurally through WebMCP. The POC does not claim automatic COROS synchronization. A future product would require a separate scheduled process to query COROS MCP and hydrate the workspace with a normalized snapshot.

## Source boundaries

The fixture keeps five sources structurally separate:

1. Athlete Profile: seeded estimates, stated preferences, and recurring constraints with provenance.
2. Synthetic COROS-shaped observations: workout, load, recovery, sleep, HRV, resting heart rate, and stress data.
3. Athlete Feedback: the Athlete’s subjective reports, including evidence linked to Coaching Topics.
4. Coach inference: rationale, counter-evidence, confidence, limitations, and ranking.
5. App-owned state: Training Plan, Coaching Topics, previews, approvals, declined decisions, and Adaptation History.

The workspace may present these as “What happened”, “What you told me”, and “Coach’s read”. It must not imply that Coach inference or app-owned plan changes came from COROS.

## Athlete Feedback

Demo statement:

> “That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn’t hold the pace. No pain. Can we make the rest of this week easier?”

The Athlete supplies natural language, not an API-shaped form. The Coach Agent may ask clarifying questions when useful. `record_athlete_feedback` stores the original statement and may include only fields explicitly reported by the Athlete:

```ts
reported?: {
  sessionRpe?: number;
  legFeel?: string;
  painReported?: boolean;
  stoppedReason?: string;
}
```

All members of `reported` are optional. Missing facts are omitted, never guessed or defaulted. Objective facts such as three of five completed repetitions remain in the Workout Result rather than being copied into Athlete Feedback.

## Coach Recommendation

The Coach Agent supplies exactly two fully formed, ranked Workout Adaptations. The Shared Coaching Workspace validates and presents them but does not generate coaching judgment.

Coach’s read, addressed to the Athlete:

> The incomplete session is more consistent with accumulated fatigue than a sudden loss of fitness. You ran 56 km last week against your usual 42–48 km, your current short-term load is elevated relative to long-term load, and your recovery is 46%. During the workout, your pace slowed while your heart rate rose, and you reported heavy legs and 9/10 effort without pain.

Relevant follow-up:

> You previously mentioned mild right-shin soreness after Sunday's long run. You have reported no pain today, so I will treat that as relevant new evidence and keep the topic under monitoring rather than assume it has resolved.

Counter-evidence:

> Your sleep, HRV, resting heart rate, and stress remain close to your normal range.

Uncertainty:

- Confidence: `moderate`
- One difficult workout cannot establish the cause.
- The evidence supports reducing near-term load, not diagnosing injury or overtraining.
- `Discuss further` remains a distinct controlled-review outcome for unseen context or an unsuitable proposal; it is not the Athlete-facing meaning of **Keep current plan**.

### Rank 1: Coach’s recommendation — Recovery first

- Thursday: replace 6 km recovery with rest.
- Saturday: reduce 8 km with strides to 6 km easy, with no strides.
- Sunday: reduce 18 km long run to 14 km easy.
- Remaining planned volume: 32 km → 20 km.
- Trade-off: loses weekly volume and long-run stimulus but provides the clearest reduction in accumulated load.

### Rank 2: Alternative — Keep the rhythm

- Thursday: reduce 6 km recovery to 5 km very easy.
- Saturday: reduce 8 km with strides to 6 km easy, with no strides.
- Sunday: reduce 18 km long run to 16 km easy.
- Remaining planned volume: 32 km → 27 km.
- Trade-off: preserves running frequency and more aerobic volume but provides less recovery if the heavy-leg sensation reflects accumulated fatigue.

## WebMCP tool surface

| Tool                               | Responsibility                                                                                                   | Input                                                           | Output                                                                                                                                                                                                                                                                | Mutation boundary                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `get_coaching_briefing`            | Start a coaching interaction by reading the bounded Coaching Briefing and interaction contract                   | None                                                            | Athlete, Target Race, Training Phase, Athlete Profile, current-week plan summary, complete fixture `recentTraining`, newest five Athlete Feedback records, monitoring topics, newest three Adaptation History receipts, `asOf`, provenance, and `interactionContract` | Read-only                                                                  |
| `get_training_plan`                | Read calendar state                                                                                              | `from`, `to`                                                    | `planVersion` and Planned Workouts in the requested range                                                                                                                                                                                                             | Read-only                                                                  |
| `get_workout_context`              | Read one workout and its evidence                                                                                | `workoutId`                                                     | Planned Workout, optional Workout Result, `previousAttempts[]` containing `{ plannedWorkout, workoutResult, matchBasis: "planned_workout_type" }`, and related Athlete Feedback                                                                                       | Read-only                                                                  |
| `record_athlete_feedback`          | Record new Athlete-reported evidence before proposing an adaptation                                              | `requestId`, `relatedWorkoutId`, `rawText`, optional `reported` | Newly recorded feedback or the existing result for a repeated `requestId`, plus a canonical `evidenceRef` to reuse verbatim                                                                                                                                           | Mutates Athlete Feedback only; the stable Coaching Topic remains unchanged |
| `open_workout_adaptation_review`   | After recording and reading evidence, open the Athlete-facing review with one recommendation and one alternative | Same proposal payload                                           | Immediate `review_opened`                                                                                                                                                                                                                                             | The call itself does not mutate; later on-page approval may apply          |
| `read_workout_adaptation_decision` | After the Athlete decides on-page, retrieve the structured terminal result                                       | `reviewId`                                                      | `not_ready` or stored terminal result, then cleared for delivery                                                                                                                                                                                                      | Read-only; any application already occurred on-page                        |

While a fallback review is pending, `read_workout_adaptation_decision` returns `not_ready`; after the Athlete's decision it returns exactly one terminal status: `approved`, `declined`, `discuss_further`, or `cancelled`, then clears that result for delivery. **Keep current plan** is the explicit `declined` result: it records the Coach Recommendation in the Coaching timeline, leaves the Training Plan unchanged, and never creates an Approved Adaptation receipt.

For `get_workout_context`, `previousAttempts` is empty when the selected Planned Workout has no Workout Result. Otherwise it excludes the selected result and includes only earlier Workout Results whose linked Planned Workout has the same `type` as the selected workout. Entries are ordered newest first by `startedAt`, with Workout Result ID descending as the deterministic tie-break. Each entry carries the complete linked Planned Workout and Workout Result plus `matchBasis: "planned_workout_type"`; the response `evidenceRefs` includes both records for every returned attempt.

The shipped runtime exposes exactly the six fallback tools above. The entry briefing's structured interaction contract communicates the review lifecycle to a fresh Agent without relying on repository instructions, an installed skill, or a prior conversation. Downstream descriptions remain focused on their own operations and immediate preconditions. The fallback surface does not include `review_workout_adaptation`.

Controlled development harness only: a separate pending-call interface may be named `review_workout_adaptation` for settlement tests. It is outside the shipped six-tool contract, is not registered by the shipped runtime, and must not be counted as a standing or production tool. Any future pending-call or primary review experience remains future work and does not change the current v1.1 runtime surface.

## Review proposal

```ts
{
  reviewId: string;
  sourceWorkoutId: string;
  expectedPlanVersion: number;
  evidenceRefs: string[];
  rationale: {
    summary: string;
    counterEvidence: string;
    confidence: "low" | "moderate" | "high";
    limitations: string[];
  };
  recommended: {
    optionId: string;
    label: string;
    summary: string;
    tradeoff: string;
    workoutChanges: WorkoutChange[];
  };
  alternative: {
    optionId: string;
    label: string;
    summary: string;
    tradeoff: string;
    workoutChanges: WorkoutChange[];
  };
}
```

The named properties guarantee exactly one recommendation and one alternative. The app validates distinct option IDs, the expected `planVersion`, every referenced Planned Workout, and evidence references returned by the context selectors. `get_training_plan` makes `planVersion` and stable workout IDs prominent; context reads return reusable evidence references. Rejections identify the invalid field and expected correction so the Coach Agent can retry.

## Review lifecycle and mutation rules

- Exactly one pending imperative review may be active.
- Selecting a card changes only the calendar preview.
- Only **Adapt my plan** grants Plan Approval.
- Approval atomically applies the selected Workout Adaptation, increments `planVersion`, stores the terminal outcome, and settles the review.
- The applied result identifies the review, cited evidence references, selected option identity, affected Planned Workout before/after values, application time, and plan versions before and after. This becomes Adaptation History. It excludes proposal rationale, free-form reasoning, and the discarded alternative.
- `reviewId` and `requestId` are idempotency keys; reuse cannot apply or record twice.
- **Keep current plan** clears the pending proposal, records a durable declined decision, and returns `declined` without changing the Training Plan. `discuss_further` remains distinct from decline. Cancellation, timeout, and stale-plan change return `cancelled` where fallback delivery is applicable. An explicit demo reset clears pending and undelivered review state so a fresh Agent can start immediately. A published fallback proposal otherwise survives registration/page teardown and reload with its persisted expiry; a controlled-development pending call retains waiter-specific abort and teardown cancellation.
- The shipped open/read fallback path uses the same proposal, validation, preview, approval, application, and idempotency semantics end to end.
- A controlled development harness may exercise a pending-call path with the same application command for settlement tests; it is outside the shipped six-tool contract and is not a runtime registration choice.

There is deliberately no agent-callable `apply_plan` tool. Training Plan mutation remains behind the Athlete’s explicit Plan Approval in the Shared Coaching Workspace.

## Explicit POC boundary

This contract does not add real COROS sync, scheduled COROS export, the future COROS MCP hydration bridge, conversational Athlete Profile onboarding, full Training Plan generation, Phase Transition logic, injury diagnosis, multiple Athletes, authentication, server persistence, or in-app chat.
