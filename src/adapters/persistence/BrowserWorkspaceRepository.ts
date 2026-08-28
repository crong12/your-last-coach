import type {
  Durability,
  PersistedWorkspace,
  WorkspaceRepository,
} from "../../application/ports";

export const WORKSPACE_STORAGE_KEY = "your-last-coach.workspace.v1";

export class BrowserWorkspaceRepository implements WorkspaceRepository {
  durability: Durability = "persistent";
  private memoryEnvelope: PersistedWorkspace | null = null;

  constructor(private readonly storageProvider: () => Storage) {}

  async load(): Promise<unknown | null> {
    if (this.durability === "memory_only") return this.memoryEnvelope;

    let raw: string | null;
    try {
      raw = this.storageProvider().getItem(WORKSPACE_STORAGE_KEY);
    } catch {
      this.durability = "memory_only";
      return this.memoryEnvelope;
    }
    if (raw === null) return this.memoryEnvelope;

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }

  async save(workspace: PersistedWorkspace): Promise<Durability> {
    this.memoryEnvelope = structuredClone(workspace);
    if (this.durability === "memory_only") return this.durability;

    try {
      this.storageProvider().setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify(workspace),
      );
    } catch {
      this.durability = "memory_only";
    }
    return this.durability;
  }

  async clear(): Promise<void> {
    this.memoryEnvelope = null;

    try {
      this.storageProvider().removeItem(WORKSPACE_STORAGE_KEY);
    } catch {
      this.durability = "memory_only";
    }
  }
}
