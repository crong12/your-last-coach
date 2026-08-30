import type {
  CoachingContextSource,
  Durability,
  PersistedFallbackResult,
  WorkspaceRepository,
} from "./ports";
import type { WorkspaceState } from "../domain/types";
import { deepFreeze } from "../domain/immutable";
import { isWorkspaceState } from "../domain/validation";

interface InitializeWorkspaceOptions {
  fixtureSource: CoachingContextSource;
  repository: WorkspaceRepository;
  now?: () => number;
}

export interface InitializedWorkspace {
  state: WorkspaceState;
  notice: string | null;
  durability: Durability;
  undeliveredFallbackResult?: PersistedFallbackResult;
}

const REFRESH_NOTICE =
  "Saved demo data could not be used, so the Training Plan was refreshed.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function migratePersistedWorkspace(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.state)) return value;
  if ("declinedAdaptations" in value.state) return value;
  return {
    ...value,
    state: {
      ...value.state,
      declinedAdaptations: [],
    },
  };
}

function isPersistedWorkspace(value: unknown): value is {
  schemaVersion: 1;
  seedVersion: "demo-athlete-v1";
  savedAt: string;
  state: WorkspaceState;
  undeliveredFallbackResult?: PersistedFallbackResult;
} {
  if (!(
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.seedVersion === "demo-athlete-v1" &&
    typeof value.savedAt === "string" &&
    isWorkspaceState(value.state) &&
    value.state.seedVersion === value.seedVersion
  ))
    return false;
  const result = value.undeliveredFallbackResult;
  if (result === undefined) return true;
  if (
    !isRecord(result) ||
    typeof result.reviewId !== "string" ||
    result.reviewId.trim() === ""
  )
    return false;
  const receipt = value.state.adaptationReceipts.find(
    (candidate) => candidate.reviewId === result.reviewId,
  );
  if (result.status === "discuss_further") {
    return (
      receipt === undefined &&
      Object.keys(result).every((key) => ["status", "reviewId"].includes(key))
    );
  }
  if (result.status === "cancelled") {
    return (
      receipt === undefined &&
      typeof result.reason === "string" &&
      result.reason.trim() !== "" &&
      Object.keys(result).every((key) =>
        ["status", "reviewId", "reason"].includes(key),
      )
    );
  }
  if (result.status === "declined") {
    const decision = value.state.declinedAdaptations.find(
      (candidate) => candidate.reviewId === result.reviewId,
    );
    return (
      decision !== undefined &&
      Object.keys(result).every((key) => ["status", "reviewId"].includes(key))
    );
  }
  if (result.status !== "approved") return false;
  return (
    receipt !== undefined &&
    JSON.stringify(result) ===
      JSON.stringify({
        status: "approved",
        ...receipt,
      })
  );
}

async function saveFixture(
  state: WorkspaceState,
  repository: WorkspaceRepository,
): Promise<Durability> {
  return repository.save({
    schemaVersion: 1,
    seedVersion: "demo-athlete-v1",
    savedAt: state.clock.now,
    state,
  });
}

export async function initializeWorkspace(
  options: InitializeWorkspaceOptions,
): Promise<InitializedWorkspace> {
  const saved = await options.repository.load();
  const migratedSaved = migratePersistedWorkspace(saved);
  if (isPersistedWorkspace(migratedSaved)) {
    const pending = migratedSaved.state.pendingAdaptationProposal;
    const expired =
      pending !== undefined &&
      Number.isFinite(Date.parse(pending.expiresAt)) &&
      Date.parse(pending.expiresAt) <= (options.now?.() ?? Date.now());
    if (expired) {
      const { pendingAdaptationProposal: _pending, ...stateWithoutPending } =
        migratedSaved.state;
      const state = deepFreeze(structuredClone(stateWithoutPending));
      const timeoutResult: PersistedFallbackResult = {
        status: "cancelled",
        reviewId: pending.proposal.reviewId,
        reason: "timeout",
      };
      const persistedFallbackResult =
        pending.delivery === "fallback" ? timeoutResult : undefined;
      let durability: Durability =
        options.repository.durability ?? "persistent";
      try {
        durability = await options.repository.save({
          schemaVersion: 1,
          seedVersion: "demo-athlete-v1",
          savedAt: state.clock.now,
          state,
          ...(persistedFallbackResult === undefined
            ? {}
            : { undeliveredFallbackResult: persistedFallbackResult }),
        });
      } catch {
        durability = "memory_only";
      }
      return {
        state,
        notice: null,
        durability,
        ...(persistedFallbackResult === undefined
          ? {}
          : { undeliveredFallbackResult: persistedFallbackResult }),
      };
    }
    return {
      state: deepFreeze(structuredClone(migratedSaved.state)),
      notice: null,
      durability: options.repository.durability ?? "persistent",
      ...(migratedSaved.undeliveredFallbackResult === undefined
        ? {}
        : {
            undeliveredFallbackResult: migratedSaved.undeliveredFallbackResult,
          }),
    };
  }

  const state = await options.fixtureSource.loadContext();
  const durability = await saveFixture(state, options.repository);
  return {
    state,
    notice: saved === null ? null : REFRESH_NOTICE,
    durability,
  };
}
