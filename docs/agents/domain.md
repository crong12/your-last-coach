# Domain documentation

This repository currently has one domain context.

- The canonical domain glossary is [../../CONTEXT.md](../../CONTEXT.md).
- Context-specific and system-wide architectural decisions live under [../adr/](../adr/).
- A `CONTEXT-MAP.md` should be introduced only if the repository develops genuinely separate domain contexts.

Use the glossary for domain vocabulary and relationships only. Keep implementation choices, plans, requirements, and temporary notes out of it.

Create an ADR only when the decision is all three of:

1. Meaningfully expensive to reverse.
2. Surprising without historical context.
3. The result of a genuine trade-off between alternatives.

Update the glossary as terms are resolved. Record qualifying ADRs at the time the decision is made rather than batching documentation later.
