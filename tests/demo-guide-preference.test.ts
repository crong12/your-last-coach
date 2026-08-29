import { describe, expect, it } from "vitest";

import { createDemoGuidePreference } from "../src/adapters/persistence/demoGuidePreference";

describe("Demo Guide preference", () => {
  it("opens until intentionally dismissed and opens again after reset", () => {
    const values = new Map<string, string>();
    const preference = createDemoGuidePreference(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    }));

    expect(preference.shouldOpen()).toBe(true);
    preference.markSeen();
    expect(preference.shouldOpen()).toBe(false);

    const reloaded = createDemoGuidePreference(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    }));
    expect(reloaded.shouldOpen()).toBe(false);

    reloaded.reset();
    expect(reloaded.shouldOpen()).toBe(true);
  });

  it("keeps in-page seen state when storage is unavailable", () => {
    const preference = createDemoGuidePreference(() => {
      throw new Error("storage unavailable");
    });

    expect(preference.shouldOpen()).toBe(true);
    expect(() => preference.markSeen()).not.toThrow();
    expect(preference.shouldOpen()).toBe(false);
    expect(() => preference.reset()).not.toThrow();
    expect(preference.shouldOpen()).toBe(true);

    const reloaded = createDemoGuidePreference(() => {
      throw new Error("storage unavailable");
    });
    expect(reloaded.shouldOpen()).toBe(true);
  });
});
