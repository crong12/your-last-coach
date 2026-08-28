import type {
  AppliedPlanAdaptation,
  CoachingContextSource,
  WorkspaceState,
} from "../domain/types";

export type Durability = "persistent" | "memory_only";

export type PersistedFallbackResult =
  | ({ status: "approved" } & AppliedPlanAdaptation)
  | { status: "discuss_further"; reviewId: string }
  | { status: "cancelled"; reviewId: string; reason: string };

export interface PersistedWorkspace {
  schemaVersion: 1;
  seedVersion: "demo-athlete-v1";
  savedAt: string;
  state: WorkspaceState;
  undeliveredFallbackResult?: PersistedFallbackResult;
}

export interface WorkspaceRepository {
  readonly durability?: Durability;
  load(): Promise<unknown | null>;
  save(workspace: PersistedWorkspace): Promise<Durability>;
  clear(): Promise<void>;
}

export type { CoachingContextSource };
