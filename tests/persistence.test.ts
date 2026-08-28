import { describe, expect, it } from "vitest";

import { initializeWorkspace } from "../src/application/initializeWorkspace";
import type { PersistedWorkspace } from "../src/application/ports";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import {
  BrowserWorkspaceRepository,
  WORKSPACE_STORAGE_KEY,
} from "../src/adapters/persistence/BrowserWorkspaceRepository";

class ControlledStorage implements Storage {
  private readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  get length() {
    return this.values.size;
  }

  clear(): void {
    if (this.failWrites)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.failReads)
      throw new DOMException("Storage denied", "SecurityError");
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failWrites)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.values.set(key, value);
  }
}

async function fixtureEnvelope(planVersion = 1): Promise<PersistedWorkspace> {
  const state = structuredClone(
    await createDemoCoachingContextSource().loadContext(),
  );
  state.trainingPlan.planVersion = planVersion;
  return {
    schemaVersion: 1,
    seedVersion: "demo-athlete-v1",
    savedAt: "2026-08-26T20:14:00+01:00",
    state,
  };
}

const INVALID_SAVED_CASES = [
  "malformed JSON",
  "unsupported schema",
  "mismatched seed",
  "invalid workspace state",
] as const;

describe("browser workspace persistence", () => {
  it("loads and saves a versioned persistent envelope", async () => {
    const storage = new ControlledStorage();
    const repository = new BrowserWorkspaceRepository(() => storage);
    const envelope = await fixtureEnvelope(2);

    expect(await repository.save(envelope)).toBe("persistent");
    expect(JSON.parse(storage.getItem(WORKSPACE_STORAGE_KEY) ?? "")).toEqual(
      envelope,
    );
    expect(await repository.load()).toEqual(envelope);
    expect(repository.durability).toBe("persistent");
  });

  it("keeps the current page state in memory when browser storage is unavailable", async () => {
    const envelope = await fixtureEnvelope(2);
    const repository = new BrowserWorkspaceRepository(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(await repository.save(envelope)).toBe("memory_only");
    expect(await repository.load()).toEqual(envelope);
    expect(repository.durability).toBe("memory_only");

    await repository.clear();
    expect(await repository.load()).toBeNull();
  });

  it("falls back to memory when a storage write fails", async () => {
    const storage = new ControlledStorage();
    storage.failWrites = true;
    const repository = new BrowserWorkspaceRepository(() => storage);
    const envelope = await fixtureEnvelope(2);

    expect(await repository.save(envelope)).toBe("memory_only");
    expect(await repository.load()).toEqual(envelope);
  });
});

describe("workspace initialization", () => {
  it("restores a valid saved workspace", async () => {
    const storage = new ControlledStorage();
    const saved = await fixtureEnvelope(3);
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(saved));
    const repository = new BrowserWorkspaceRepository(() => storage);

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository,
    });

    expect(initialized.state.trainingPlan.planVersion).toBe(3);
    expect(initialized.notice).toBeNull();
    expect(initialized.durability).toBe("persistent");
  });

  it.each(INVALID_SAVED_CASES)(
    "replaces %s with the exact fixture and a restrained notice",
    async (savedCase) => {
      const envelope = await fixtureEnvelope();
      const rawByCase = {
        "malformed JSON": "{broken",
        "unsupported schema": JSON.stringify({
          ...envelope,
          schemaVersion: 99,
        }),
        "mismatched seed": JSON.stringify({
          ...envelope,
          seedVersion: "another-seed",
        }),
        "invalid workspace state": JSON.stringify({
          ...envelope,
          state: { seedVersion: "demo-athlete-v1" },
        }),
      };
      const storage = new ControlledStorage();
      storage.setItem(WORKSPACE_STORAGE_KEY, rawByCase[savedCase]);
      const repository = new BrowserWorkspaceRepository(() => storage);
      const source = createDemoCoachingContextSource();

      const initialized = await initializeWorkspace({
        fixtureSource: source,
        repository,
      });

      expect(initialized.state).toEqual(await source.loadContext());
      expect(initialized.notice).toBe(
        "Saved demo data could not be used, so the Training Plan was refreshed.",
      );
      expect(await repository.load()).toEqual({
        schemaVersion: 1,
        seedVersion: "demo-athlete-v1",
        savedAt: "2026-08-26T20:15:00+01:00",
        state: initialized.state,
      });
    },
  );
});
