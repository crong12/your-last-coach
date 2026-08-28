import type {
  CoachingContextSource,
  Durability,
  WorkspaceRepository,
} from "./ports";
import type { WorkspaceState } from "../domain/types";
import { deepFreeze } from "../domain/immutable";
import { isWorkspaceState } from "../domain/validation";

interface InitializeWorkspaceOptions {
  fixtureSource: CoachingContextSource;
  repository: WorkspaceRepository;
}

export interface InitializedWorkspace {
  state: WorkspaceState;
  notice: string | null;
  durability: Durability;
}

const REFRESH_NOTICE =
  "Saved demo data could not be used, so the Training Plan was refreshed.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersistedWorkspace(value: unknown): value is {
  schemaVersion: 1;
  seedVersion: "demo-athlete-v1";
  savedAt: string;
  state: WorkspaceState;
} {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.seedVersion === "demo-athlete-v1" &&
    typeof value.savedAt === "string" &&
    isWorkspaceState(value.state) &&
    value.state.seedVersion === value.seedVersion
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
  if (isPersistedWorkspace(saved)) {
    return {
      state: deepFreeze(structuredClone(saved.state)),
      notice: null,
      durability: options.repository.durability ?? "persistent",
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
