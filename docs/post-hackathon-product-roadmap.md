# Post-hackathon product roadmap

Status: long-term direction, not WebMCP Challenge acceptance scope  
Product horizon: Brighton Marathon on 4 April 2027 and continued personal training use

## Purpose

Your Last Coach is intended to become a bespoke agent-assisted marathon coaching system, not remain only a hackathon demonstration. This roadmap preserves that direction without allowing future-product work to expand the proof of concept.

Implementation agents must use the active ticket and parent specification for current scope. Items in this roadmap require separately approved specifications and tickets before implementation.

## Hackathon boundary

The Challenge proof of concept proves one product interaction with deterministic synthetic data:

- one Athlete and one Target Race;
- a shared Week-first Training Plan workspace;
- synthetic COROS-shaped observations visible to the Athlete and readable by the Coach Agent;
- natural-language Athlete Feedback;
- two ranked Workout Adaptations with evidence, trade-offs, and uncertainty;
- preview followed by explicit Plan Approval;
- one verified WebMCP review mode;
- a visible, deterministic Training Plan update.

The POC does not need to become a complete coaching platform to preserve the future architecture. Its two transition ports—coaching-context source and workspace repository—are sufficient seams for later replacement.

## Product horizon

### Real coaching context

Replace the seeded coaching-context source with a normalized, provenance-aware source hydrated from real services.

Likely work includes:

- authenticated COROS MCP reads;
- a scheduled process that refreshes activity, lap, recovery, load, sleep, HRV, stress, and fitness observations;
- freshness, partial-data, failure, and provenance handling;
- reconciliation between device observations and Athlete Feedback;
- explicit separation between COROS-confirmed observations, Athlete-reported facts, Coach inference, and app-owned Training Plan state.

Exact COROS wire formats remain unclaimed until authenticated schemas and representative calls are available.

### Durable personal workspace

Replace browser-local persistence with a server-backed workspace repository when cross-device durability or scheduled hydration requires it.

Likely work includes:

- authentication and a private single-Athlete account;
- durable Training Plan, Athlete Feedback, Plan Approval, and coaching-history storage;
- migration and backup;
- synchronization and conflict handling;
- bounded idempotency records and retention policies;
- audit history appropriate to consequential Training Plan changes.

Multi-Athlete rosters and human-coach administration are separate product decisions, not assumed extensions.

### Bespoke Training Plan generation

Extend the Coach Agent from nearby Workout Adaptations into longer-horizon planning only after the shared evidence and approval loop is reliable.

Likely work includes:

- initial Brighton 2027 Training Plan generation from Athlete history, constraints, and Target Race;
- training-phase and progression logic;
- recurring review of load, recovery, Workout Results, Athlete Feedback, and life constraints;
- rescheduling and missed-workout reasoning;
- Phase Transition proposals with stronger review and approval requirements;
- explanation of rationale, alternatives, uncertainty, and counter-evidence at each planning horizon.

The system should remain prescriptive without diagnosing injury or replacing qualified medical care.

### Product reliability and safety

Production use requires stronger guarantees than the hackathon fixture:

- schema evolution and migrations;
- observable scheduled jobs and connector failures;
- data freshness indicators;
- privacy and security review;
- recovery from partial writes and synchronization conflicts;
- bounded logs and idempotency records;
- regression evaluation of coaching payload construction;
- explicit escalation when reported pain or other risk context falls outside ordinary training adaptation.

### Broader integrations

Potential later integrations include:

- calendar export or synchronization;
- structured workout delivery to supported devices when write capability exists;
- race-result and route context;
- notifications and recurring check-ins;
- optional human-coach collaboration.

Each integration requires its own value, authority, provenance, and mutation-boundary decision.

## Promotion rule

An item moves from this roadmap into implementation only when:

1. its Athlete value and scope are explicit;
2. required external capabilities are verified;
3. source ownership and mutation authority are defined;
4. a buildable specification is approved;
5. demoable implementation tickets and blockers exist.

Until then, implementation agents should preserve the accepted ports and avoid speculative infrastructure.
