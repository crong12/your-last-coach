# ADR 0003: Application-owned workspace state and explicit Plan Approval

- Status: Accepted
- Date: 2026-08-28
- Decision ticket: [Set the implementation and verification architecture](https://github.com/crong12/your-last-coach/issues/8)

## Context

The Athlete and Coach Agent must inspect and act on the same Training Plan and Coaching Evidence. React, browser persistence, and WebMCP all need access to that state without creating competing sources of truth. A Coach Recommendation must remain a proposal until the Athlete explicitly approves it.

Alternatives included keeping state inside React, allowing WebMCP adapters to mutate records directly, or treating the Agent's private conversation context as authoritative. Those approaches would make UI and Agent reads diverge, weaken the approval boundary, and couple domain behaviour to a particular host.

## Decision

One serializable, application-owned `WorkspaceState` is authoritative:

- `src/domain/` owns coaching vocabulary and invariants without browser, framework, fixture, or WebMCP dependencies.
- `src/demo/` creates and validates the immutable synthetic seed but does not own later mutations.
- `src/application/` owns commands, selectors, plan versions, idempotency, structured outcomes, and the adaptation-review lifecycle.
- `src/adapters/` owns browser persistence and WebMCP host mechanics without making coaching judgments or mutating Training Plan objects independently.
- `src/ui/` renders selectors and dispatches the same application commands used by WebMCP.
- `src/main.tsx` is the composition root.

Selecting or previewing a Workout Adaptation never changes the Training Plan. Only explicit Plan Approval applies validated Workout Changes atomically. Plan-version checks reject stale proposals, and stable request and review identifiers make writes idempotent.

The current repository persists a versioned envelope in browser `localStorage`, validates it before use, and falls back to page memory when storage is unavailable. A future persistence implementation must replace the repository adapter without bypassing the application commands or approval boundary.

## Consequences

- The Athlete-visible workspace and Coach-Agent tools share one source of truth.
- Domain and application behaviour can be tested without React, storage, or a WebMCP host.
- Host and persistence implementations can change behind narrow adapters.
- Browser-local persistence is intentionally single-profile and non-collaborative.
- New features must preserve application ownership, explicit approval, atomic mutation, stale-plan protection, and idempotency.
