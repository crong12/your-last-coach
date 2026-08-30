export const PANE_IDS = ["today", "trends", "coaching"] as const;

export type PaneId = (typeof PANE_IDS)[number];

export interface PaneNavigation {
  getSelectedPane(): PaneId;
  subscribe(listener: () => void): () => void;
  selectPane(pane: PaneId): void;
  restorePane(pane: PaneId): void;
}

export function createPaneNavigation(
  initialPane: PaneId = "today",
): PaneNavigation {
  let selectedPane = initialPane;
  const listeners = new Set<() => void>();

  const setSelectedPane = (pane: PaneId) => {
    if (pane === selectedPane) return;
    selectedPane = pane;
    listeners.forEach((listener) => listener());
  };

  return {
    getSelectedPane: () => selectedPane,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectPane: setSelectedPane,
    restorePane: setSelectedPane,
  };
}
