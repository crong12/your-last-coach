# Post-hackathon product roadmap

Status: long-term product direction; each stage requires an approved specification before implementation

Product horizon: Brighton Marathon on 4 April 2027 and continued personal training use

## North star

Your Last Coach should give the Coach Agent the freshest, most relevant, trustworthy context needed to provide the best coaching guidance and advice to the Athlete.

The product is a continuing coaching relationship. A new conversation should not begin from zero, and a large undifferentiated history should not be loaded into every interaction. Durable records preserve what matters; a bounded Coaching Briefing selects what matters now.

## Foundation established by the Challenge

The WebMCP Challenge release establishes:

- one Athlete and one Target Race;
- a shared Training Plan visible to the Athlete and readable by the Coach Agent;
- structured Coaching Evidence and natural-language Athlete Feedback;
- a bounded Athlete Profile and active Coaching Topics;
- two ranked Workout Adaptations with rationale, trade-offs, and uncertainty;
- preview followed by explicit Plan Approval;
- Adaptation History for approved changes; and
- deterministic browser-local state for a repeatable judge flow.

This foundation proves the human-agent interaction. It does not determine the production persistence schema, COROS extraction format, synchronization service, or longer-horizon planning policy.

## Product principles

### Relevance over volume

Context earns its place by affecting the current coaching decision. The Coach Agent starts with a Coaching Briefing and retrieves deeper Workout Results or Training Plan details only when useful.

### Provenance over apparent certainty

COROS observations, Athlete reports, Coach inference, and app-owned plan state remain distinguishable. Every time-sensitive value carries its source and observation time. Missing values remain absent.

### Structured records over a memory transcript

The durable source should contain queryable Athlete Profile facts, Coaching Evidence, Coaching Topics, Training Plan state, and Adaptation History. Narrative summaries may help people read these records, but they do not become a competing source of truth.

### Deterministic boundaries around Agent work

An Agent may retrieve and interpret external data, but schemas, validation, uniqueness constraints, idempotent writes, cursors, and synchronization receipts determine what becomes durable state.

### Athlete authority over consequential changes

The Coach Agent recommends. The Athlete supplies unseen context and grants Plan Approval. Device imports and scheduled synchronization never authorize a Training Plan mutation.

## Target context model

### Athlete Profile

Slow-changing context used to personalize coaching:

- race goals and recent performance;
- current fitness estimates and training zones when supported by evidence;
- normal training volume and typical availability;
- preferred training days and maximum weekday duration;
- surface, equipment, and recurring schedule preferences; and
- other constraints that repeatedly affect planning.

Profile building combines imported evidence with an interview-style conversation. The Coach Agent asks for facts a device cannot know and records their provenance. Derived fields identify the evidence and method used to calculate them.

When COROS supplies a fitness, load, recovery, or zone value, preserve that source value and its observation time. Any app-derived estimate is a separate field with its own method and provenance rather than a silent replacement.

### Coaching Evidence

Time-stamped records used to support or challenge coaching judgment:

- Workout Results and laps;
- load, recovery, sleep, HRV, resting-heart-rate, stress, and available fitness observations;
- Athlete Feedback linked to a workout or date; and
- source, freshness, units, and raw-record references.

### Coaching Topic

An ongoing matter that deserves relevant follow-up across conversations, such as shin discomfort, schedule disruption, recurring fatigue, or confidence about a particular session.

A topic contains a stable ID, status, first and latest report times, evidence references, and a follow-up condition. Athlete-reported concerns can open or update a topic without a separate confirmation step. Silence does not resolve it. The Coach raises it when the Athlete next provides relevant evidence, rather than sending an unrelated proactive message by default.

### Training Plan and Adaptation History

The current Training Plan remains authoritative. Each approved adaptation records:

- the evidence considered;
- the Coach Recommendation, alternative, rationale, uncertainty, and trade-offs;
- the option the Athlete approved;
- affected Planned Workouts;
- application time; and
- plan versions before and after.

This history helps a later Coach understand why the plan differs from its original shape, avoid repeating or contradicting recent changes, and assess whether an earlier adaptation had the intended effect. Discarded chain-of-thought and ordinary chat history are unnecessary.

### Coaching Briefing

The briefing is a read model assembled for one interaction from:

- the current Athlete Profile;
- Target Race, Training Phase, and relevant Training Plan horizon;
- recent and decision-relevant Coaching Evidence;
- active Coaching Topics whose follow-up conditions may apply; and
- recent Adaptation History.

The Athlete can inspect the same briefing in the Shared Coaching Workspace. Selection rules should be deterministic and testable; the Coach Agent remains responsible for interpreting the selected evidence.

## Intended persistence direction

Supabase is the leading direction for a private, cross-device personal workspace because it can provide relational records, object storage, authentication, and scheduled or server-side execution in one small stack. This is a roadmap direction rather than an accepted ADR; the exact schema and operational model require a dedicated decision.

The conceptual record groups are:

- Athlete Profile facts and provenance;
- Workout Results and laps;
- health and fitness observations;
- Athlete Feedback;
- Coaching Topics and their evidence links;
- Training Plans and Planned Workouts;
- Adaptation History;
- synchronization cursors, idempotency keys, and receipts; and
- source-record references.

Supabase tables should hold normalized, queryable records. Supabase Storage should hold raw FIT files only when they provide useful detail that is not retained in normalized rows. Every stored file is referenced from its corresponding activity or import record.

Markdown may remain an export or human-readable view. Obsidian and bidirectional vault synchronization are not roadmap requirements.

## COROS synchronization

COROS MCP is expected to be a query interface rather than a push feed. A scheduled cloud Agent can perform a daily synchronization until a deterministic connector is available.

The synchronization procedure should be encoded as a tightly specified skill:

1. Read the last successful cursor and synchronization receipt.
2. Ask COROS MCP only for activities and observations newer than that cursor.
3. Require a versioned structured result containing source IDs, timestamps, units, and provenance.
4. Validate all values before persistence.
5. Upsert normalized records idempotently using stable source identities.
6. Store raw source payloads or FIT files only under an explicit retention rule.
7. Write a synchronization receipt containing counts, omissions, errors, and source freshness.
8. Advance the cursor only after all required writes succeed.

The Agent follows the retrieval procedure; application code and database constraints enforce correctness. Retries must not duplicate workouts, laps, observations, or receipts.

Exact COROS MCP schemas must be verified with authenticated representative calls. The product should use the most useful supported data without claiming fields the connector does not expose:

- activity summaries and laps for ordinary synchronization;
- daily resting-heart-rate and other health trends when available;
- lap-average heart rate for workout comparison when available; and
- detailed heart-rate, GPS, terrain, or interval traces from FIT files only when available and useful.

## Time-series experience

The Athlete dashboard should make trends legible without treating every metric as equally important. Candidate views include:

- weekly volume and training-load progression;
- resting heart rate, HRV, sleep, and recovery over time;
- pace and average heart rate by lap within a workout;
- repeated-session comparisons; and
- a timeline connecting Athlete Feedback, Coaching Topics, approved adaptations, and subsequent Workout Results.

Chart requirements follow verified data granularity. Minute-by-minute heart-rate charts should not be designed until the COROS MCP or retained FIT files provide that resolution reliably.

## Delivery stages

### 1. Durable personal workspace

- Select the production persistence and authentication architecture.
- Define normalized schemas, provenance, migrations, backup, and retention.
- Move the single-Athlete workspace from browser-local state to the durable repository.
- Preserve the same application commands, selectors, and Plan Approval boundary.

### 2. Reliable COROS hydration

- Verify authenticated COROS MCP response shapes and available history.
- Implement the scheduled synchronization skill and validated ingestion boundary.
- Add freshness, partial-import, retry, and failure visibility.
- Retain FIT files only for explicitly chosen analyses.

### 3. Longitudinal coaching relationship

- Build conversational Athlete Profile onboarding and correction.
- Persist Coaching Topics and retrieve them by explicit status and follow-up rules.
- Assemble a bounded Coaching Briefing for every new conversation.
- Evaluate whether relevant topics and Adaptation History improve coaching without crowding out current evidence.

### 4. Training analytics

- Add high-value time-series views supported by verified source granularity.
- Connect adaptations to subsequent outcomes so the Athlete and Coach can evaluate them.
- Add data-quality and freshness indicators that are meaningful to coaching decisions.

### 5. Longer-horizon planning

- Generate the initial Brighton 2027 Training Plan from the Athlete Profile and evidence.
- Support recurring progression and Training Phase review.
- Handle missed workouts, schedule changes, and emerging pain across multiple weeks.
- Give Phase Transitions stronger evidence and approval requirements than nearby Workout Adaptations.

## Product reliability and safety

Before relying on the system throughout a marathon cycle, add:

- observable scheduled jobs and connector failures;
- recovery from partial writes and synchronization conflicts;
- schema evolution and migrations;
- privacy and security review;
- bounded logs, idempotency records, and retention policies;
- regression evaluation of Coaching Briefing selection and recommendation payloads; and
- clear escalation when reported pain or other risk context falls outside ordinary training adaptation.

The Coach Agent may monitor and adapt training around Athlete-reported discomfort. It must not diagnose injury or replace qualified medical care.

## Decisions required before implementation

- Whether Supabase is the durable source of truth and how a private Athlete account is secured.
- Which COROS MCP operations and history windows are available in authenticated use.
- Whether FIT export is available and which analyses justify retaining raw files.
- The synchronization schedule, retry policy, and stale-data behavior.
- Which Athlete Profile facts are stated, imported, or derived, and how corrections work.
- Coaching Topic status transitions and follow-up selection rules.
- Time-series retention and down-sampling requirements.
- Safety boundaries for pain, illness, and other non-routine reports.

## Promotion rule

A roadmap item becomes implementation work only when:

1. its Athlete value and scope are explicit;
2. required external capabilities are verified;
3. source ownership and mutation authority are defined;
4. consequential architecture decisions are recorded;
5. a buildable specification is approved; and
6. demoable implementation tickets and blockers exist in GitHub Issues.
