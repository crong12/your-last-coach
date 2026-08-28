# Demo Athlete and coaching tool contract

Status: Accepted for the WebMCP Challenge proof of concept  
Contract version: `1.0`  
Fixture version: `demo-athlete-v1`  
Fixed demo time: `2026-08-26T20:15:00+01:00` (`Europe/London`)

This contract defines the deterministic fixture and Coach Agent–Shared Coaching Workspace boundary for the proof of concept. It is demo-oriented, not a production COROS integration contract.

## Demo Athlete

- Display name: Sam
- Persona: fictional intermediate recreational marathon runner
- Target Race: Brighton Marathon, 4 April 2027
- Performance objective: 3:40
- Recent half-marathon ability: approximately 1:42
- Normal weekly volume: 42–48 km
- Synthetic threshold pace: approximately 4:38/km
- Training Phase: Aerobic development

The Shared Coaching Workspace addresses the Athlete as “you” in coaching copy. “Sam” is used only where a name naturally belongs, such as the workspace header.

## Data horizons

- Planned Workouts cover August 2026 so the weekly and monthly Training Plan views share one fixture.
- Detailed Workout Results cover 13–26 August 2026.
- Older history is represented only by the current load snapshot.
- The hero interaction begins immediately after the incomplete workout on Wednesday 26 August.

The August Planned Workouts before the detailed result window exist to make the month view coherent; the coaching decision does not rely on their lap-level details.

## Recent training history

| Date | Planned Workout / Workout Result | Distance |
|---|---|---:|
| Thu 13 Aug | Easy run | 8 km |
| Sat 15 Aug | Easy run with strides | 8 km |
| Sun 16 Aug | Long run | 18 km |
| Tue 18 Aug | Easy run | 10 km |
| Wed 19 Aug | Steady run including 5 km tempo | 12 km |
| Fri 21 Aug | Easy run | 8 km |
| Sat 22 Aug | Recovery run | 6 km |
| Sun 23 Aug | Long run | 20 km |
| Mon 24 Aug | Recovery run | 6 km |
| Wed 26 Aug | Partial `5 × 1 km threshold` workout | see below |

The 18–23 August week totals 56 km, above the Athlete’s normal 42–48 km range. This establishes a credible heavy-week context without implying reckless training.

## Incomplete threshold workout

Planned structure:

- 2 km warm-up
- `5 × 1 km` at 4:35–4:40/km with 90-second jog recoveries
- 1.5 km cooldown

Recorded work repetitions:

| Rep | Pace | Average heart rate |
|---:|---:|---:|
| 1 | 4:36/km | 165 bpm |
| 2 | 4:39/km | 171 bpm |
| 3 | 4:48/km | 176 bpm |
| 4 | Not completed | — |
| 5 | Not completed | — |

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

The fixture keeps four sources structurally separate:

1. Synthetic COROS-shaped observations: workout, load, recovery, sleep, HRV, resting heart rate, and stress data.
2. Athlete Feedback: the Athlete’s subjective report.
3. Coach inference: rationale, counter-evidence, confidence, limitations, and ranking.
4. App-owned Training Plan: Planned Workouts, previews, approvals, and applied mutations.

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

Counter-evidence:

> Your sleep, HRV, resting heart rate, and stress remain close to your normal range.

Uncertainty:

- Confidence: `moderate`
- One difficult workout cannot establish the cause.
- The evidence supports reducing near-term load, not diagnosing injury or overtraining.
- `None — discuss further` remains available for unseen context or an unsuitable proposal.

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

| Tool | Responsibility | Input | Output | Mutation boundary |
|---|---|---|---|---|
| `get_athlete_context` | Read Athlete, Target Race, Training Phase, fitness, load, recovery, and health context | None | Versioned Athlete context plus `asOf` and synthetic provenance | Read-only |
| `get_training_plan` | Read calendar state | `from`, `to` | `planVersion` and Planned Workouts in the requested range | Read-only |
| `get_workout_context` | Read one workout and its evidence | `workoutId` | Planned Workout, optional Workout Result, and related Athlete Feedback | Read-only |
| `record_athlete_feedback` | Record the Athlete’s natural-language report and sparse explicit extraction | `requestId`, `relatedWorkoutId`, `rawText`, optional `reported` | Newly recorded feedback or the existing result for a repeated `requestId` | Mutates Athlete Feedback only |
| `review_workout_adaptation` | Primary imperative human review | Stable `reviewId`, evidence references, rationale, exactly two ranked options | Pending until `applied`, `discuss_further`, or `cancelled`; may return `busy` | Only the Athlete pressing **Adapt my plan** may mutate the Training Plan |
| `open_workout_adaptation_review` | Compatibility fallback only: open the same review without keeping a call pending | Same proposal payload | Immediate `review_opened` | The call itself does not mutate; later on-page approval may apply |
| `read_workout_adaptation_decision` | Compatibility fallback only: deliver and clear a stored terminal result | `reviewId` | `not_ready` or stored terminal result, then cleared for delivery | Read-only; any application already occurred on-page |

The standing surface covers reading Athlete/race context, Training Plan and workout context; recording Athlete Feedback; reviewing a Workout Adaptation; and applying or discarding it. Additional tools require a separately recorded need.

## Review proposal

```ts
{
  reviewId: string;
  sourceWorkoutId: string;
  evidenceRefs: string[];
  rationale: {
    summary: string;
    counterEvidence: string;
    confidence: "low" | "moderate" | "high";
    limitations: string[];
  };
  options: [
    {
      optionId: string;
      rank: 1 | 2;
      role: "recommended" | "alternative";
      label: string;
      summary: string;
      tradeoff: string;
      workoutChanges: WorkoutChange[];
    },
    {
      optionId: string;
      rank: 1 | 2;
      role: "recommended" | "alternative";
      label: string;
      summary: string;
      tradeoff: string;
      workoutChanges: WorkoutChange[];
    }
  ];
}
```

The app validates that there are exactly two options with distinct ranks and roles and that every referenced Planned Workout belongs to the current `planVersion`.

## Review lifecycle and mutation rules

- Exactly one pending imperative review may be active.
- Selecting a card changes only the calendar preview.
- Only **Adapt my plan** grants Plan Approval.
- Approval atomically applies the selected Workout Adaptation, increments `planVersion`, stores the terminal outcome, and settles the review.
- The applied result identifies the selected option, affected Planned Workouts, application time, and plan versions before and after.
- `reviewId` and `requestId` are idempotency keys; reuse cannot apply or record twice.
- `None — discuss further`, cancellation, timeout, unload before approval, and reset discard the pending proposal without changing the Training Plan.
- The primary pending-call path and compatibility open/read path use the same proposal, validation, preview, approval, application, and idempotency semantics. Only result delivery differs.

There is deliberately no agent-callable `apply_plan` tool. Training Plan mutation remains behind the Athlete’s explicit Plan Approval in the Shared Coaching Workspace.

## Explicit POC boundary

This contract does not add real COROS sync, scheduled COROS export, the future COROS MCP hydration bridge, full Training Plan generation, Phase Transition logic, injury diagnosis, multiple Athletes, authentication, server persistence, or in-app chat.
