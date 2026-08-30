export const PANE_IDS = ["today", "trends", "coaching"] as const;

export type PaneId = (typeof PANE_IDS)[number];

export type WorkspaceRoute =
  { kind: "pane"; pane: PaneId } | { kind: "workout"; workoutId: string };

export function workspaceRouteFromHash(hash: string): WorkspaceRoute | null {
  if (!hash.startsWith("#")) return null;
  const fragment = hash.slice(1);
  const pane = PANE_IDS.find((candidate) => candidate === fragment);
  if (pane) return { kind: "pane", pane };
  const workoutMatch = /^workout\/([^/]+)$/.exec(fragment);
  if (!workoutMatch) return null;
  try {
    const workoutId = decodeURIComponent(workoutMatch[1]);
    return workoutId === "" ? null : { kind: "workout", workoutId };
  } catch {
    return null;
  }
}

export function workspaceRouteHash(route: WorkspaceRoute): string {
  return route.kind === "pane"
    ? `#${route.pane}`
    : `#workout/${encodeURIComponent(route.workoutId)}`;
}

export interface PaneNavigation {
  getRoute(): WorkspaceRoute;
  getSelectedPane(): PaneId;
  subscribe(listener: () => void): () => void;
  selectPane(pane: PaneId): void;
  restorePane(pane: PaneId): void;
  pushWorkout(workoutId: string): void;
  restoreRoute(route: WorkspaceRoute): void;
}

export function createPaneNavigation(
  initialPane: PaneId = "today",
): PaneNavigation {
  let selectedPane = initialPane;
  let route: WorkspaceRoute = { kind: "pane", pane: initialPane };
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());
  const setRoute = (nextRoute: WorkspaceRoute) => {
    if (
      route.kind === "pane" &&
      nextRoute.kind === "pane" &&
      route.pane === nextRoute.pane
    )
      return;
    if (
      route.kind === "workout" &&
      nextRoute.kind === "workout" &&
      route.workoutId === nextRoute.workoutId
    )
      return;
    route = nextRoute;
    if (nextRoute.kind === "pane") selectedPane = nextRoute.pane;
    notify();
  };

  const setSelectedPane = (pane: PaneId) => {
    if (route.kind === "pane" && pane === selectedPane) return;
    selectedPane = pane;
    route = { kind: "pane", pane };
    notify();
  };

  return {
    getRoute: () => route,
    getSelectedPane: () => selectedPane,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectPane: setSelectedPane,
    restorePane: setSelectedPane,
    pushWorkout(workoutId) {
      setRoute({ kind: "workout", workoutId });
    },
    restoreRoute: setRoute,
  };
}
