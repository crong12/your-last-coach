import type { ToolActivity } from "./types";

export interface ToolActivityStore {
  getSnapshot(): ToolActivity | null;
  clear(): void;
  publish(activity: ToolActivity): void;
  subscribe(listener: () => void): () => void;
}

export function createToolActivityStore(): ToolActivityStore {
  let latest: ToolActivity | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => latest,
    clear() {
      latest = null;
      listeners.forEach((listener) => listener());
    },
    publish(activity) {
      latest = activity;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
