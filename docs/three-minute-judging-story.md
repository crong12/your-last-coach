# Three-minute judging story

Status: approved Wayfinder decision  
Story version: `judging-story-v1`  
Companion decisions:

- [Demo Athlete and coaching tool contract](demo-athlete-coaching-contract-v1.md)
- [Implementation and verification architecture](implementation-and-verification-architecture.md)
- [Shared Coaching Workspace interaction resolution](https://github.com/crong12/your-last-coach/issues/4)

## Purpose

This guide defines the public WebMCP Challenge demonstration for **Your Last Coach**. It is a recording and submission contract, not a word-for-word narration script. The presenter may refine the language while preserving the story, evidence, mutation boundary, and truthful disclosure below.

The video should make four things obvious:

1. **WebMCP leverage:** the Coach Agent reads structured state and negotiates an app-owned change through the same Shared Coaching Workspace the Athlete can see.
2. **Execution:** the Athlete reviews a polished calendar preview and explicitly approves the change.
3. **Potential impact:** recreational runners can receive bespoke, evidence-aware adaptations instead of following a static plan when real training diverges from it.
4. **Creativity and ambition:** the web page is not another chatbot; it is shared visual working space for a human and an agent.

## Core positioning

### Personal opening

Open with the builder's real motivation: training for Brighton Marathon on 4 April 2027 and wanting a plan that can adapt to fatigue, completed workouts, and athlete feedback.

Keep competitor framing category-level and experiential. Do not show competitor names, logos, or make unsupported claims about a product the presenter has not personally used.

Suggested broad point:

> Subscription training plans can be convenient, but I wanted something genuinely bespoke: an agent that can reason over my current training evidence, discuss an adaptation with me, and then safely update the plan we can both see.

### One-sentence pitch

> Your Last Coach is a Shared Coaching Workspace where a recreational Athlete and Coach Agent inspect the same training evidence, negotiate bespoke Workout Adaptations, and safely update a visible Training Plan through WebMCP.

### Cost framing

Do not claim universal savings. Current public prices vary by billing period, and subscribing to ChatGPT Plus solely for this product may cost roughly the same as a specialist monthly plan.

A defensible optional line is:

> Comparable training platforms often cost roughly £10–£20 or $10–$20 per month. For runners who already use ChatGPT Plus, Your Last Coach could provide bespoke adaptive coaching without another specialist subscription.

This is a statement of product potential, not a claim that the POC already replaces a complete commercial service. Real hosting, synchronization, and future data integration may add costs.

Pricing references checked on 28 August 2026:

- [Runna pricing](https://www.runna.com/en-gb/pricing): $19.99 monthly or $119.99 annually.
- [Coopah](https://coopah.com/): £9.99 per month equivalent with annual billing.
- [TrainingPeaks athlete pricing](https://www.trainingpeaks.com/pricing/for-athletes/): $19.95 monthly or $134.99 annually.
- [ChatGPT Plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus): $20 per month.

Use the cost line once in the Devpost description or near the close, not as a pricing slide.

## Recording contract

- Public YouTube video with audio.
- Target duration: **2:40–2:50**; hard limit: under three minutes.
- Record ChatGPT and its in-app browser side by side for one continuous visual layout.
- Use the intended submission agent/host, currently GPT-5.6 Sol in ChatGPT.
- Record the successful product interaction first, then add voiceover.
- Simple cuts in iMovie are sufficient. Remove waiting time and failed takes; no elaborate animation is required.
- Keep the product readable at the final video resolution.
- Do not switch between unrelated windows during the hero flow.
- The presenter writes the final narration. The timings and beats below are the content boundary.

## Early ChatGPT host gate

Before production review work begins, run the corrected disposable prototype in ChatGPT's enabled in-app browser:

- three consecutive pending-call approvals;
- one **None — discuss further** outcome;
- one cancellation or reset;
- recorded attachment steps, registered tools, approximate durations, host version, timestamps, and results.

Reliable results select `primary` mode. Any timeout or inconsistency selects `fallback` mode. The configured app exposes only that review path; it never asks the Coach Agent to choose between primary and fallback tools.

## Pre-recording state

Reset the Shared Coaching Workspace to `demo-athlete-v1` and the fixed clock:

- Wednesday 26 August 2026, 20:15
- Europe/London
- one unchanged August Training Plan
- no Athlete Feedback for the threshold workout
- no active or stored adaptation review

The visible weekly calendar should show the original rest-of-week plan:

| Date | Before approval |
|---|---|
| Thursday 27 August | 6 km recovery |
| Saturday 29 August | 8 km easy with strides |
| Sunday 30 August | 18 km long run |

The workspace should also make the failed workout and restrained, mixed evidence inspectable:

- previous week: 56 km against a usual 42–48 km;
- partial `5 × 1 km threshold`: three completed repetitions at 4:36, 4:39, and 4:48 per kilometre;
- average repetition heart rates: 165, 171, and 176 bpm;
- load ratio: 1.33 and recovery: 46%;
- normal-range sleep, HRV, resting heart rate, and stress.

The Demo Guide opens automatically once after a fresh browser state or reset, then remains reachable from the WebMCP/status control. It should provide:

- a compact explanation of the demo;
- setup and reset guidance;
- the copyable prompt;
- WebMCP connection/status visibility;
- a concise troubleshooting path.

Do not clutter the primary workspace with permanent debug panels or a permanent synthetic-data badge.

## Suggested Athlete message

Use a normal conversational request; do not instruct the agent to “use Your Last Coach.”

> That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn't hold the pace. No pain. Can you review what happened and make the rest of this week easier? Show me the options before changing my plan.

The runtime Coach Agent is not assumed to read this repository or its `AGENTS.md`. It receives the conversation, attached site, and registered WebMCP tool descriptions.

## Timed story

| Time | Visual and interaction | Broad narration point |
|---|---|---|
| 0:00–0:25 | ChatGPT and workspace visible side by side | Brighton 2027 motivation; static or generic plans struggle when actual training diverges; introduce the shared workspace idea. |
| 0:25–0:40 | Original week, failed workout, and health context visible | This is a synthetic Athlete and synthetic COROS-shaped snapshot for a truthful, reproducible demo. Human and agent can inspect the same underlying state. |
| 0:40–1:20 | Send the natural Athlete message; ChatGPT invokes tools | The Agent records what the Athlete reported and retrieves structured athlete, plan, workout, and health context instead of guessing from prose or scraping the rendered page. |
| 1:20–1:45 | Coaching explanation and two ranked options appear | Evidence suggests accumulated fatigue with moderate confidence, while normal sleep and recovery indicators provide counter-evidence. The Agent recommends rather than diagnoses. |
| 1:45–2:18 | Review modal; briefly preview Alternative, return to Coach's recommendation, press **Adapt my plan** | Selecting a card previews only. The consequential Training Plan change requires explicit Athlete approval. |
| 2:18–2:35 | Modal closes; calendar updates; structured tool result appears in ChatGPT | Narrate one or two visible before-and-after changes. Human and agent now see the same approved plan version. |
| 2:35–2:48 | Updated calendar remains visible | Close on the broader product vision and, if useful, the qualified incremental-cost line. |

Do not artificially hold the post-approval UI. Let the polished product transition occur normally and narrate the updated calendar while it is visible.

## Expected WebMCP trace

The exact conversational ordering may vary when the Agent asks a justified clarification, but the successful demo should expose these responsibilities:

1. `record_athlete_feedback`
2. `get_athlete_context`
3. `get_training_plan`
4. `get_workout_context`
5. `review_workout_adaptation` in primary mode, or `open_workout_adaptation_review` followed later by `read_workout_adaptation_decision` in fallback mode

The ChatGPT trace may be inspected or narrated to show structured tool use. The video need not dwell on raw payloads.

## Review beat and before/after

The modal offers:

1. **Coach's recommendation — Recovery first**
   - Thursday: 6 km recovery to rest
   - Saturday: 8 km with strides to 6 km easy without strides
   - Sunday: 18 km long run to 14 km easy
2. **Alternative — Keep the rhythm**
   - Thursday: 6 km recovery to 5 km very easy
   - Saturday: 8 km with strides to 6 km easy without strides
   - Sunday: 18 km long run to 16 km easy
3. **None — discuss further**
   - no plan mutation

If the interaction is smooth, briefly select the Alternative to show its calendar preview, then select and approve the recommendation.

Only **Adapt my plan** may mutate the Training Plan. After approval:

- the recommendation is applied atomically;
- `planVersion` increments;
- the modal closes normally;
- the calendar shows the changed workouts;
- the pending tool returns the structured outcome to ChatGPT.

Cancellation, timeout, unload before approval, reset, and **None — discuss further** must not change the Training Plan.

## Primary and fallback host paths

Confirm the early ChatGPT gate result against the final release before recording. Expose only the selected review mode.

### Primary path

Use `review_workout_adaptation` when the host keeps the tool call pending during the on-page decision and returns the structured result after approval. If the early and final gates succeed, use it in the video and do not register or mention the fallback.

### Compatibility fallback

If the intended host cannot reliably keep the call pending:

1. the Agent calls `open_workout_adaptation_review`;
2. the modal opens and the call immediately returns;
3. the Athlete decides on-page;
4. the Agent calls `read_workout_adaptation_decision` to retrieve the stored result.

Explain the split in one short line only if it is the path actually used. Both paths preserve the same preview, explicit approval, idempotence, and mutation semantics. Primary and fallback tools are never offered together.

## Synthetic-data disclosure

Use two lightweight disclosures:

- the Demo Guide states that the POC uses seeded synthetic COROS-shaped observations and does not claim authenticated COROS synchronization;
- the narration identifies the Athlete and data as synthetic once.

The structured data retains `synthetic-coros-shaped`, `asOf`, and source boundaries for the Agent. A permanent technical provenance label is not required in the main workspace.

A future scheduled COROS MCP extraction and workspace hydration process remains outside this POC.

## Demo runbook

1. Open the deployed workspace inside ChatGPT's in-app browser and attach/connect it to the conversation as required by the current host.
2. Reset to `demo-athlete-v1`.
3. Confirm the WebMCP/status control reports that the tools are available.
4. Confirm the original Thursday, Saturday, and Sunday workouts.
5. Copy or type the suggested Athlete message.
6. Allow the Agent to record feedback and inspect the relevant context.
7. Confirm the explanation retains the mixed evidence and avoids injury or overtraining diagnosis.
8. Open the adaptation review.
9. Optionally preview the Alternative, then choose the recommendation.
10. Press **Adapt my plan**.
11. Confirm the changed calendar and structured Agent result.
12. Reset and repeat once before recording the final take.

Chrome's local WebMCP inspector remains a development and release-verification aid, not part of the judging video.

## Devpost description outline

The final prose may be edited for voice, but it should cover the required substance.

### Problem

A runner's real training rarely follows a static plan perfectly. Fatigue, incomplete workouts, schedule constraints, and subjective feedback create a need for timely, bespoke adaptation.

### Why WebMCP

WebMCP lets the Coach Agent interact with the Shared Coaching Workspace as a structured participant. The Agent can read the same app-owned context the Athlete sees, present a proposal in the web interface, wait for explicit human review, and receive the approved result.

### Better experience

Conversation stays in ChatGPT while the calendar-first web interface handles visual comparison, preview, and approval. This is more inspectable than an isolated chatbot response and safer than silently changing the plan.

### What humans and agents can do together

- inspect athlete, race, training, workout, and recovery context;
- preserve subjective Athlete Feedback separately from device-shaped observations;
- produce two ranked Workout Adaptations with rationale, trade-offs, counter-evidence, and uncertainty;
- preview changes on the calendar;
- apply exactly one option only after explicit Athlete approval;
- share the resulting Training Plan version.

### Implementation

Describe the client-only React/TypeScript/Vite application, deterministic versioned browser-local state, typed application core, synthetic COROS-shaped data adapter, WebMCP adapter, atomic plan operations, primary pending review, compatibility fallback, automated tests, and manual host verification.

A separate “Future” section is optional, not required. Do not imply that real COROS synchronization, full plan generation, authentication, or production persistence already exists.

## Submission and release checklist

### Challenge artifacts

- [ ] Live public HTTPS URL works without repository access.
- [ ] Public source repository is accessible.
- [ ] An OSI-approved license is clearly visible.
- [ ] Public YouTube video has audio and is under three minutes.
- [ ] Devpost text explains WebMCP fit, the better user experience, human-agent capabilities, and implementation.
- [ ] Submission is completed before 3 September 2026, 1:00 PM PDT (9:00 PM UK time).

### Product verification

- [ ] Automated unit, contract, component, and end-to-end checks pass.
- [ ] Production build passes.
- [ ] Fresh-browser hydration and reset are deterministic.
- [ ] Weekly and monthly calendars show the intended August plan.
- [ ] ChatGPT in-app-browser attachment and all read tools pass manually.
- [ ] Feedback recording is idempotent and preserves sparse, explicitly reported fields.
- [ ] Exactly one active review is enforced.
- [ ] Selecting each option produces the correct preview without mutation.
- [ ] **Adapt my plan** applies once and increments `planVersion`.
- [ ] **None — discuss further**, cancellation, timeout, unload, and reset do not mutate.
- [ ] The final host exposes only the review mode selected by the verified ChatGPT gate.
- [ ] Human and Agent read the same post-approval Training Plan.
- [ ] Synthetic provenance and limitations remain truthful.

### Recording checks

- [ ] ChatGPT and workspace remain legible side by side.
- [ ] Browser notifications, personal tabs, and unrelated account information are hidden.
- [ ] Synthetic disclosure is spoken once.
- [ ] Mixed evidence remains normal sleep plus reduced recovery/elevated load.
- [ ] The trace shows meaningful WebMCP calls.
- [ ] Both options and the explicit approval boundary are visible.
- [ ] The updated calendar is clearly narrated.
- [ ] Final export is 2:40–2:50 where practical and definitely under three minutes.
- [ ] YouTube visibility and audio are verified from a signed-out session.

### Freeze

Aim to freeze the submission, repository, and live deployment by the evening of **2 September 2026**, leaving the final day for verification and submission recovery only. After the official deadline, preserve the submitted repository and live experience unchanged through judging as required by the Challenge rules.

Official references:

- [WebMCP Challenge rules](https://webmcp.devpost.com/rules)
- [WebMCP Challenge resources](https://webmcp.devpost.com/resources)
