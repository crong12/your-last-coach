# Agent instructions

This project is in discovery and wayfinding. Preserve resolved decisions, avoid selecting a production stack before the relevant decision is recorded, and use GitHub issues as the source of truth for planning work.

## Agent skills

- For work that could span planning, implementation, debugging, review, architecture, research, setup, or handoff, start with the Matt Skills Curated `engineering-workflow-guide` and select the smallest applicable workflow.
- Before creating, claiming, relating, triaging, or closing project work, read [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- Before applying or changing issue roles, read [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- When defining domain terms or recording consequential architectural decisions, read [docs/agents/domain.md](docs/agents/domain.md).

## Source authority

For implementation, the active ticket owns slice scope and acceptance criteria; its parent specification owns cross-ticket requirements. Linked architecture and domain documents provide durable constraints and rationale. Historical issues and prototypes are evidence.

When these sources conflict, pause implementation and reconcile the latest approved decision across the active ticket, parent specification, and linked documents. Do not silently choose a source or treat existing code as the decision.
