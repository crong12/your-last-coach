import type { CoachingContextSource, WorkspaceState } from "../domain/types";

export type Durability = "persistent" | "memory_only";

export interface PersistedWorkspace {
  schemaVersion: 1;
  seedVersion: "demo-athlete-v1";
  savedAt: string;
  state: WorkspaceState;
}

export interface WorkspaceRepository {
  readonly durability?: Durability;
  load(): Promise<unknown | null>;
  save(workspace: PersistedWorkspace): Promise<Durability>;
  clear(): Promise<void>;
}

export type { CoachingContextSource };
