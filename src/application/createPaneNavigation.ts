export const PANE_IDS = ["today", "trends", "coaching"] as const;

export type PaneId = (typeof PANE_IDS)[number];

export type WorkspaceRoute =
  { kind: "pane"; pane: PaneId } | { kind: "workout"; workoutId: string };

export const NAVIGATION_STATE_KEY = "yourLastCoachNavigation";
export const NAVIGATION_FOCUS_STATE_KEY = "yourLastCoachNavigationFocus";

export interface PaneOriginReceipt {
  version: 1;
  kind: "pane-origin";
  pane: PaneId;
  windowScrollY: number;
  paneScrollLeft: number;
  invokerId: string;
}

export interface WorkoutOriginReceipt {
  version: 1;
  kind: "workout-origin";
  workoutId: string;
  workoutScrollTop: number;
  invokerId: string;
}

export type NavigationOriginReceipt = PaneOriginReceipt | WorkoutOriginReceipt;

function navigationReceiptFromHistoryState(
  value: unknown,
  key = NAVIGATION_STATE_KEY,
) {
  if (typeof value !== "object" || value === null) return null;
  const receipt = (value as Record<string, unknown>)[key];
  return typeof receipt === "object" && receipt !== null
    ? (receipt as Record<string, unknown>)
    : null;
}

export function paneOriginFromHistoryState(
  value: unknown,
): PaneOriginReceipt | null {
  const candidate = navigationReceiptFromHistoryState(value);
  if (
    !candidate ||
    candidate.version !== 1 ||
    candidate.kind !== "pane-origin" ||
    !PANE_IDS.includes(candidate.pane as PaneId) ||
    typeof candidate.windowScrollY !== "number" ||
    !Number.isFinite(candidate.windowScrollY) ||
    typeof candidate.paneScrollLeft !== "number" ||
    !Number.isFinite(candidate.paneScrollLeft) ||
    typeof candidate.invokerId !== "string"
  ) {
    return null;
  }
  return candidate as unknown as PaneOriginReceipt;
}

export function workoutOriginFromHistoryState(
  value: unknown,
): WorkoutOriginReceipt | null {
  return workoutReceiptFromHistoryState(value, NAVIGATION_STATE_KEY);
}

export function workoutFocusFromHistoryState(
  value: unknown,
): WorkoutOriginReceipt | null {
  return workoutReceiptFromHistoryState(value, NAVIGATION_FOCUS_STATE_KEY);
}

function workoutReceiptFromHistoryState(
  value: unknown,
  key: string,
): WorkoutOriginReceipt | null {
  const candidate = navigationReceiptFromHistoryState(value, key);
  if (
    !candidate ||
    candidate.version !== 1 ||
    candidate.kind !== "workout-origin" ||
    typeof candidate.workoutId !== "string" ||
    candidate.workoutId.trim() === "" ||
    typeof candidate.workoutScrollTop !== "number" ||
    !Number.isFinite(candidate.workoutScrollTop) ||
    candidate.workoutScrollTop < 0 ||
    typeof candidate.invokerId !== "string" ||
    candidate.invokerId.trim() === ""
  ) {
    return null;
  }
  return candidate as unknown as WorkoutOriginReceipt;
}

export function navigationOriginFromHistoryState(
  value: unknown,
): NavigationOriginReceipt | null {
  return (
    paneOriginFromHistoryState(value) ?? workoutOriginFromHistoryState(value)
  );
}

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
