import { describe, expect, it, vi } from "vitest";

import {
  PANE_IDS,
  createPaneNavigation,
} from "../src/application/createPaneNavigation";
import { paneHash, paneIdFromHash } from "../src/ui/WorkspaceApp";

describe("pane navigation", () => {
  it("starts at Today unless an external pane is restored", () => {
    expect(createPaneNavigation().getSelectedPane()).toBe("today");
    expect(createPaneNavigation("coaching").getSelectedPane()).toBe("coaching");
    expect(PANE_IDS).toEqual(["today", "trends", "coaching"]);
  });

  it("notifies observers only when selection changes", () => {
    const navigation = createPaneNavigation();
    const observer = vi.fn();
    const unsubscribe = navigation.subscribe(observer);

    navigation.selectPane("trends");
    navigation.selectPane("trends");
    navigation.restorePane("coaching");
    unsubscribe();
    navigation.selectPane("today");

    expect(observer).toHaveBeenCalledTimes(2);
    expect(navigation.getSelectedPane()).toBe("today");
  });
});

describe("pane hashes", () => {
  it.each([
    ["#today", "today"],
    ["#trends", "trends"],
    ["#coaching", "coaching"],
  ] as const)("parses %s as %s", (hash, pane) => {
    expect(paneIdFromHash(hash)).toBe(pane);
    expect(paneHash(pane)).toBe(hash);
  });

  it.each(["", "#", "#TODAY", "#trends/", "#workout/one", "today"])(
    "falls back safely for unsupported hash %j",
    (hash) => {
      expect(paneIdFromHash(hash)).toBe("today");
    },
  );
});
