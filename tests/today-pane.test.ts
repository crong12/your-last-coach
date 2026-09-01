// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectTodayPane } from "../src/application/today";
import { createDemoWorkspaceState } from "../src/demo/demoFixture";
import { TodayPane } from "../src/ui/TodayPane";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderPane(
  projection = selectTodayPane(structuredClone(createDemoWorkspaceState())),
  onViewPendingProposal = vi.fn(),
  onSelectWorkout = vi.fn(),
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(TodayPane, {
        projection,
        onViewPendingProposal,
        onSelectWorkout,
      }),
    );
  });
  return { onViewPendingProposal, onSelectWorkout };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("TodayPane", () => {
  it("renders the normal hero, result metrics, and all seven week labels", () => {
    const { onSelectWorkout } = renderPane();

    expect(container.querySelector(".today-pane")).not.toBeNull();
    const heroArtwork = container.querySelector<HTMLImageElement>(
      ".today-hero__artwork",
    );
    expect(heroArtwork).not.toBeNull();
    expect(heroArtwork?.getAttribute("alt")).toBe("");
    expect(
      container.querySelector(".today-countdown__number")?.textContent,
    ).toBe("221");
    expect(
      container.querySelector("[role=progressbar]")?.getAttribute("aria-label"),
    ).toBe("Training build progress by day");
    expect(
      container
        .querySelector("[role=progressbar]")
        ?.getAttribute("aria-valuenow"),
    ).toBe("10");
    expect(container.textContent).toContain(
      "AEROBIC DEVELOPMENT · DAY 26 OF 247",
    );
    expect(
      container
        .querySelector("[role=progressbar]")
        ?.getAttribute("aria-valuetext"),
    ).toBe("Day 26 of 247; Aerobic development");
    expect(container.querySelectorAll(".today-phase-segment")).toHaveLength(0);
    expect(
      container.querySelector(".today-phase-progress__fill"),
    ).not.toBeNull();
    expect(container.textContent).toContain("5 × 1 km threshold");
    expect(container.textContent).not.toContain("PARTIAL");
    expect(container.textContent).toContain("45:47");
    expect(container.textContent).toContain("6:06/km");
    expect(container.textContent).toContain("169 bpm");
    expect(container.textContent).not.toContain("TRAINING LOAD");
    expect(container.textContent).toContain("Workout recorded.");
    expect(container.textContent).toContain("Today's Workout (26 August 2026)");
    expect(container.textContent).not.toContain("Target Race");
    expect(container.textContent).not.toContain("CURRENT PLAN WEEK");
    expect(
      container.querySelector("#today-week-title")?.textContent?.trim(),
    ).toBe("24–30 August 2026");
    expect(
      container.querySelectorAll('[aria-label="Unavailable"]'),
    ).toHaveLength(0);
    expect(container.textContent).not.toContain("Start Workout");

    const tiles = container.querySelectorAll(".today-week-day");
    expect(tiles).toHaveLength(7);
    expect(container.textContent).toContain("Monday 24 August");
    expect(container.textContent).toContain("Tuesday 25 August");
    expect(container.textContent).toContain("Rest day");
    expect(container.textContent).not.toContain("Space to recover");
    expect(container.textContent).toContain("Wednesday 26 August");
    expect(container.textContent).toContain("Thursday 27 August");
    expect(container.textContent).toContain("Friday 28 August");
    expect(container.textContent).toContain("Saturday 29 August");
    expect(container.textContent).toContain("Sunday 30 August");
    expect(
      container.querySelectorAll(".today-week-day--rest button"),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(".today-week-day--workout button"),
    ).toHaveLength(5);

    const thresholdButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".today-week-day button"),
    ).find((button) => button.textContent?.includes("5 × 1 km threshold"));
    expect(thresholdButton).not.toBeUndefined();
    act(() => thresholdButton!.click());
    expect(onSelectWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ id: "planned-2026-08-26-threshold" }),
      thresholdButton,
    );
  });

  it("switches between the week and month calendar while preserving workout navigation", () => {
    const { onSelectWorkout } = renderPane();
    const weekButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show week calendar"]',
    );
    const monthButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show month calendar"]',
    );

    expect(weekButton?.getAttribute("aria-pressed")).toBe("true");
    expect(monthButton?.getAttribute("aria-pressed")).toBe("false");

    act(() => monthButton!.click());

    expect(
      container
        .querySelector('button[aria-label="Show week calendar"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      container
        .querySelector('button[aria-label="Show month calendar"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.querySelector(".today-week-grid")).toBeNull();
    expect(container.querySelector("#today-calendar-title")?.textContent).toBe(
      "August 2026",
    );
    expect(container.querySelectorAll(".today-month-day")).toHaveLength(31);
    expect(
      container.querySelector('.today-month-day[aria-current="date"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("5 × 1 km threshold");
    expect(container.textContent).toContain("Completed");
    expect(container.textContent).not.toContain("Missed");

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Show next month"]',
        )!
        .click(),
    );
    expect(container.querySelector("#today-calendar-title")?.textContent).toBe(
      "September 2026",
    );
    expect(container.querySelectorAll(".today-month-day")).toHaveLength(30);
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Show previous month"]',
        )!
        .click(),
    );

    const longRun = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".today-month-day__workout",
      ),
    ).find((button) => button.textContent?.includes("20 km long run"));
    expect(longRun).not.toBeUndefined();
    act(() => longRun!.click());
    expect(onSelectWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ id: "planned-2026-08-23-long" }),
      longRun,
    );
  });

  it("renders and removes the single pending proposal signal without exposing proposal details", () => {
    const state = structuredClone(createDemoWorkspaceState());
    const projection = selectTodayPane(state);
    const callback = vi.fn();

    renderPane(projection, callback);
    expect(container.querySelector("#today-pending-proposal")).toBeNull();

    state.pendingAdaptationProposal = {
      proposal: {
        reviewId: "review:today",
        sourceWorkoutId: "planned-2026-08-26-threshold",
        expectedPlanVersion: state.trainingPlan.planVersion,
        evidenceRefs: [],
        rationale: {
          summary: "Reduce load.",
          counterEvidence: "The rest of the evidence is stable.",
          confidence: "moderate",
          limitations: ["One session cannot establish the cause."],
        },
        recommended: {
          optionId: "recovery-first",
          label: "Recovery first",
          summary: "Reduce the next session.",
          tradeoff: "Loses a little volume.",
          workoutChanges: [],
        },
        alternative: {
          optionId: "keep-the-rhythm",
          label: "Keep the rhythm",
          summary: "Keep the current plan.",
          tradeoff: "Provides less recovery.",
          workoutChanges: [],
        },
      },
      openedAt: state.clock.now,
      expiresAt: "2026-08-27T20:15:00+01:00",
      delivery: "fallback",
      selectedOptionId: null,
    };
    const pendingProjection = selectTodayPane(state);
    act(() => {
      root.render(
        createElement(TodayPane, {
          projection: pendingProjection,
          onViewPendingProposal: callback,
          onSelectWorkout: vi.fn(),
        }),
      );
    });
    const signal = container.querySelector<HTMLButtonElement>(
      "#today-pending-proposal",
    );
    expect(signal).not.toBeNull();
    expect(signal?.textContent).toContain("1 proposal awaiting your review");
    expect(signal?.textContent).not.toContain("Reduce load");
    act(() => signal!.click());
    expect(callback).toHaveBeenCalledWith(signal);

    act(() => {
      root.render(
        createElement(TodayPane, {
          projection,
          onViewPendingProposal: callback,
          onSelectWorkout: vi.fn(),
        }),
      );
    });
    expect(container.querySelector("#today-pending-proposal")).toBeNull();
  });

  it.each([
    [
      "race week",
      "2027-03-28T12:00:00Z",
      "Race week",
      "Keep the work light. Arrive rested.",
    ],
    ["race day", "2027-04-04T12:00:00Z", "Race day", "Your race starts today."],
    [
      "post-race",
      "2027-04-05T12:00:00Z",
      "Race complete",
      "Ready for the next chapter when you are.",
    ],
  ] as const)(
    "renders the %s hero framing without a progress bar or fabricated start time",
    (_name, now, heading, copy) => {
      const state = structuredClone(createDemoWorkspaceState());
      state.clock.now = now;
      renderPane(selectTodayPane(state));

      expect(container.textContent).toContain(heading);
      expect(container.textContent).toContain(copy);
      expect(container.querySelector("[role=progressbar]")).toBeNull();
      expect(container.textContent).not.toContain("starts at");
      expect(container.textContent).not.toContain("Start Workout");
    },
  );

  it("renders a planned card, a rest card, and an honest empty-plan message", () => {
    const plannedState = structuredClone(createDemoWorkspaceState());
    plannedState.clock.now = "2026-08-27T12:00:00+01:00";
    const planned = renderPane(selectTodayPane(plannedState));
    expect(container.textContent).toContain("Today's Workout (27 August 2026)");
    expect(container.textContent).toContain("6 km recovery");
    expect(container.textContent).toContain("Planned distance");
    expect(container.querySelectorAll("button")).toHaveLength(8);
    expect(
      container.querySelector('button[aria-label="View workout details"]'),
    ).not.toBeNull();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="View workout details"]',
        )
        ?.click(),
    );
    expect(planned.onSelectWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ id: "planned-2026-08-27-recovery" }),
      expect.any(HTMLButtonElement),
    );

    const restState = structuredClone(createDemoWorkspaceState());
    restState.clock.now = "2026-08-25T12:00:00+01:00";
    renderPane(selectTodayPane(restState));
    expect(container.textContent).toContain("Rest day");
    expect(container.textContent).toContain("6 km recovery");
    expect(
      container.querySelector('button[aria-label="View workout details"]'),
    ).toBeNull();

    const emptyState = structuredClone(createDemoWorkspaceState());
    emptyState.trainingPlan.plannedWorkouts = [];
    renderPane(selectTodayPane(emptyState));
    expect(container.textContent).toContain(
      "No Training Plan is available yet.",
    );
    expect(container.querySelector(".today-week")).toBeNull();
    expect(container.querySelector(".today-workout-card")).toBeNull();
  });
});
