import { describe, expect, it, vi } from "vitest";

import {
  PANE_IDS,
  createPaneNavigation,
  workoutFocusFromHistoryState,
  workoutOriginFromHistoryState,
  workspaceRouteFromHash,
  workspaceRouteHash,
} from "../src/application/createPaneNavigation";

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
    expect(workspaceRouteFromHash(hash)).toEqual({ kind: "pane", pane });
    expect(workspaceRouteHash({ kind: "pane", pane })).toBe(hash);
  });

  it("round-trips an encoded Workout ID", () => {
    expect(workspaceRouteFromHash("#workout/session%20one")).toEqual({
      kind: "workout",
      workoutId: "session one",
    });
    expect(
      workspaceRouteHash({ kind: "workout", workoutId: "session one" }),
    ).toBe("#workout/session%20one");
  });

  it("round-trips an encoded adaptation review ID", () => {
    expect(
      workspaceRouteFromHash("#adaptation/review%3Arest-of-week%2F1"),
    ).toEqual({
      kind: "adaptation",
      reviewId: "review:rest-of-week/1",
    });
    expect(
      workspaceRouteHash({
        kind: "adaptation",
        reviewId: "review:rest-of-week/1",
      }),
    ).toBe("#adaptation/review%3Arest-of-week%2F1");
  });

  it.each([
    "",
    "#",
    "#TODAY",
    "#trends/",
    "#workout",
    "#workout/",
    "#workout/one/two",
    "#workout/%E0%A4%A",
    "#adaptation",
    "#adaptation/",
    "#adaptation/one/two",
    "#adaptation/%E0%A4%A",
    "today",
  ])("rejects unsupported hash %j", (hash) => {
    expect(workspaceRouteFromHash(hash)).toBeNull();
  });
});

describe("Workout routes", () => {
  it("retains the origin pane while a Workout is pushed", () => {
    const navigation = createPaneNavigation("trends");

    navigation.pushWorkout("planned-2026-08-30-long");

    expect(navigation.getRoute()).toEqual({
      kind: "workout",
      workoutId: "planned-2026-08-30-long",
    });
    expect(navigation.getSelectedPane()).toBe("trends");
  });

  it("retains the origin pane while an adaptation review is pushed", () => {
    const navigation = createPaneNavigation("coaching");

    navigation.pushAdaptation("review:rest-of-week");

    expect(navigation.getRoute()).toEqual({
      kind: "adaptation",
      reviewId: "review:rest-of-week",
    });
    expect(navigation.getSelectedPane()).toBe("coaching");
  });

  it("restores pane and Workout routes through the same observable state", () => {
    const navigation = createPaneNavigation();
    const observer = vi.fn();
    navigation.subscribe(observer);

    navigation.restoreRoute({ kind: "pane", pane: "coaching" });
    navigation.restoreRoute({ kind: "workout", workoutId: "planned-one" });
    navigation.restoreRoute({ kind: "workout", workoutId: "planned-one" });

    expect(observer).toHaveBeenCalledTimes(2);
    expect(navigation.getSelectedPane()).toBe("coaching");
    expect(navigation.getRoute()).toEqual({
      kind: "workout",
      workoutId: "planned-one",
    });
  });

  it("parses a nested Workout origin receipt and rejects malformed coordinates", () => {
    expect(
      workoutOriginFromHistoryState({
        yourLastCoachNavigation: {
          version: 1,
          kind: "workout-origin",
          workoutId: "planned-current",
          workoutScrollTop: 144,
          invokerId: "previous-attempt-result-1",
        },
      }),
    ).toEqual({
      version: 1,
      kind: "workout-origin",
      workoutId: "planned-current",
      workoutScrollTop: 144,
      invokerId: "previous-attempt-result-1",
    });
    expect(
      workoutOriginFromHistoryState({
        yourLastCoachNavigation: {
          version: 1,
          kind: "workout-origin",
          workoutId: "planned-current",
          workoutScrollTop: -1,
          invokerId: "previous-attempt-result-1",
        },
      }),
    ).toBeNull();
    expect(
      workoutOriginFromHistoryState({
        yourLastCoachNavigationFocus: {
          version: 1,
          kind: "workout-origin",
          workoutId: "planned-current",
          workoutScrollTop: 144,
          invokerId: "previous-attempt-result-1",
        },
      }),
    ).toBeNull();
    expect(
      workoutFocusFromHistoryState({
        yourLastCoachNavigationFocus: {
          version: 1,
          kind: "workout-origin",
          workoutId: "planned-current",
          workoutScrollTop: 144,
          invokerId: "previous-attempt-result-1",
        },
      }),
    ).toMatchObject({
      kind: "workout-origin",
      workoutId: "planned-current",
    });
  });
});
