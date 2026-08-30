import type {
  AppliedPlanAdaptation,
  CoachingContextSource,
  DeclinedPlanAdaptation,
  PendingAdaptationProposal,
  WorkspaceState,
} from "../domain/types";

export type Durability = "persistent" | "memory_only";

export type PersistedFallbackResult =
  | ({ status: "approved" } & AppliedPlanAdaptation)
  | { status: "discuss_further"; reviewId: string }
  | { status: "declined"; reviewId: string }
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

export type ReviewOpenResult =
  | { status: "review_opened"; reviewId: string }
  | {
      status: "error";
      code: "invalid_input" | "stale_plan" | "busy";
      message: string;
      retryable: boolean;
      issues?: unknown[];
    };

export type AdaptationRecord =
  | { status: "pending"; pending: PendingAdaptationProposal }
  | { status: "approved"; receipt: AppliedPlanAdaptation }
  | { status: "declined"; decision: DeclinedPlanAdaptation }
  | { status: "stale"; reviewId: string }
  | { status: "unknown" };

export type { CoachingContextSource };
