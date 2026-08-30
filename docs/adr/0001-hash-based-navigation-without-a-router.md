# ADR 0001: Hash-based navigation without a router

- Status: Accepted
- Date: 2026-08-30
- Decision ticket: [Specify pane navigation mechanics and the desktop adaptation](https://github.com/crong12/your-last-coach/issues/46)

## Context

The dashboard IA (Wayfinder map #43) fixes a paned Shared Coaching Workspace: three page-level panes on mobile (Today, Trends, Coaching) and pushed screens (workout detail, Workout Adaptation review) above them. The app is a client-only React/TypeScript/Vite SPA with no routing library, deployed on static hosting. The Coach Agent opens the adaptation review through a WebMCP tool, so screen state must be reachable from application state as well as from user gestures. On mobile web, users physically expect the browser back gesture to close a detail screen rather than exit the app.

Alternatives considered:

1. No URLs — pure in-app state. Back gesture exits the app from any screen; no deep links.
2. Hash-based routes, every pane change pushes a history entry. Back walks through swipe history, which users experience as being trapped.
3. Hash-based routes with asymmetric history (chosen).
4. Path-based routes via the History API. Prettier URLs, but requires a router dependency or hand-rolled history code plus host rewrite configuration.

## Decision

Navigation state lives in the URL hash, with no router dependency:

- Panes: `#today`, `#trends`, `#coaching`. Pane changes (swipe, dot tap, section-nav click) update the hash with `replaceState` — changing pane never creates a history entry.
- Pushed screens: e.g. `#workout/<id>` and the adaptation review route. Opening a pushed screen uses `pushState`, so browser/OS back pops the screen and returns to the pane (mobile) or scroll position (desktop) beneath it.
- Deep links restore state on load: a pane hash opens that pane (mobile) or scrolls to that section (desktop); a pushed-screen hash opens the screen above its parent pane. A bare URL lands on Today.
- Screens opened by WebMCP tools go through the same route mechanism as user gestures; there is one navigation state, owned by the application layer.

## Consequences

- Back always means "close what is on top", never "undo a swipe"; the app never traps the back gesture.
- Deep links and reload restoration come for free from the hash; no server or host rewrite configuration is needed.
- URLs are hash-fragment URLs, not clean paths. Migrating to path-based URLs later would change every shared link and require a rewrite layer.
- e2e tests and WebMCP flows may assert on `location.hash` as the single source of navigation truth.
- The route vocabulary becomes a public-ish contract: pane and screen identifiers should change only with a recorded decision.
