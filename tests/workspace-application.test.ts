import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import type {
  PersistedWorkspace,
  WorkspaceRepository,
} from "../src/application/ports";

function createRecordingRepository() {
  let cleared = 0;
  const repository: WorkspaceRepository = {
    async load() {
      return null;
    },
    async save(_workspace: PersistedWorkspace) {
      return "persistent";
    },
    async clear() {
      cleared += 1;
    },
  };
  return { repository, cleared: () => cleared };
}

describe("Workspace application", () => {
  it("returns one authoritative Training Plan through Week and Month queries", async () => {
    const source = createDemoCoachingContextSource();
    const initialState = await source.loadContext();
    const { repository } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState,
      fixtureSource: source,
      repository,
    });
    const before = application.getState();

    const week = application.query({
      type: "get_week_training_plan",
      weekStart: "2026-08-24",
    });
    const month = application.query({
      type: "get_month_training_plan",
      month: "2026-08",
    });

    expect(week.planVersion).toBe(1);
    expect(week.plannedWorkouts.map((workout) => workout.id)).toEqual([
      "planned-2026-08-24-recovery",
      "planned-2026-08-26-threshold",
      "planned-2026-08-27-recovery",
      "planned-2026-08-29-strides",
      "planned-2026-08-30-long",
    ]);
    expect(
      month.plannedWorkouts
        .filter((workout) =>
          week.plannedWorkouts.some(({ id }) => id === workout.id),
        )
        .map((workout) => workout.id),
    ).toEqual(week.plannedWorkouts.map((workout) => workout.id));
    expect(application.getState()).toBe(before);
  });

  it("publishes state changes through its public subscription seam", async () => {
    const source = createDemoCoachingContextSource();
    const changedState = structuredClone(await source.loadContext());
    changedState.trainingPlan.planVersion = 4;
    changedState.mutationHistory.push({
      id: "mutation-before-reset",
      kind: "plan_adaptation",
      occurredAt: "2026-08-26T20:10:00+01:00",
    });
    const { repository } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: changedState,
      fixtureSource: source,
      repository,
    });
    const observedVersions: number[] = [];
    const unsubscribe = application.subscribe(() => {
      observedVersions.push(application.getState().trainingPlan.planVersion);
    });

    await application.command({ type: "reset_demo" });
    unsubscribe();

    expect(observedVersions).toEqual([1]);
  });

  it("resets to a byte-equivalent fixture with the initial planVersion and empty history", async () => {
    const source = createDemoCoachingContextSource();
    const changedState = structuredClone(await source.loadContext());
    changedState.trainingPlan.planVersion = 3;
    changedState.athleteFeedback.push({
      id: "feedback-before-reset",
      requestId: "request-before-reset",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "Heavy legs",
      recordedAt: "2026-08-26T20:10:00+01:00",
    });
    changedState.mutationHistory.push({
      id: "mutation-before-reset",
      kind: "plan_adaptation",
      occurredAt: "2026-08-26T20:10:00+01:00",
    });
    const { repository, cleared } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: changedState,
      fixtureSource: source,
      repository,
    });

    const outcome = await application.command({ type: "reset_demo" });
    const exactFixture = await source.loadContext();

    expect(outcome).toEqual({ status: "reset", durability: "persistent" });
    expect(application.getState()).toEqual(exactFixture);
    expect(application.getState().trainingPlan.planVersion).toBe(1);
    expect(application.getState().mutationHistory).toEqual([]);
    expect(cleared()).toBe(1);
  });
});
