import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import type {
  PersistedWorkspace,
  WorkspaceRepository,
} from "../src/application/ports";

function createRecordingRepository() {
  let cleared = 0;
  const saves: PersistedWorkspace[] = [];
  const repository: WorkspaceRepository = {
    async load() {
      return null;
    },
    async save(workspace: PersistedWorkspace) {
      saves.push(structuredClone(workspace));
      return "persistent";
    },
    async clear() {
      cleared += 1;
    },
  };
  return { repository, cleared: () => cleared, saves };
}

describe("Workspace application", () => {
  it("records the hero Athlete Feedback with only explicit normalized fields", async () => {
    const source = createDemoCoachingContextSource();
    const initialState = await source.loadContext();
    const { repository, saves } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState,
      fixtureSource: source,
      repository,
    });
    const rawText =
      "That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn’t hold the pace. No pain. Can we make the rest of this week easier?";

    const outcome = await application.command({
      type: "record_athlete_feedback",
      requestId: "hero-feedback-request",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText,
      reported: {
        sessionRpe: 9,
        legFeel: "  heavy from the warm-up  ",
        painReported: false,
        stoppedReason: "  couldn’t hold the pace  ",
      },
    });

    expect(outcome).toEqual({
      status: "ok",
      feedback: {
        id: "athlete-feedback:hero-feedback-request",
        requestId: "hero-feedback-request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText,
        reported: {
          sessionRpe: 9,
          legFeel: "heavy from the warm-up",
          painReported: false,
          stoppedReason: "couldn’t hold the pace",
        },
        recordedAt: "2026-08-26T20:15:00+01:00",
      },
      durability: "persistent",
    });
    expect(application.getState().athleteFeedback).toEqual([
      outcome.status === "ok" ? outcome.feedback : null,
    ]);
    expect(application.getState().processedRequestIds).toEqual([
      "hero-feedback-request",
    ]);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      savedAt: "2026-08-26T20:15:00+01:00",
      state: {
        athleteFeedback: [outcome.status === "ok" ? outcome.feedback : null],
      },
    });
  });

  it("keeps optional reported fields absent for sparse feedback", async () => {
    const source = createDemoCoachingContextSource();
    const { repository } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository,
    });

    const outcome = await application.command({
      type: "record_athlete_feedback",
      requestId: "sparse-feedback-request",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "Heavy legs today.",
      reported: { sessionRpe: 8.5, legFeel: "heavy" },
    });

    expect(outcome).toMatchObject({
      status: "ok",
      feedback: { reported: { sessionRpe: 8.5, legFeel: "heavy" } },
    });
    if (outcome.status !== "ok") throw new Error("Expected feedback");
    expect(Object.keys(outcome.feedback.reported ?? {})).toEqual([
      "sessionRpe",
      "legFeel",
    ]);
  });

  it("keeps recorded feedback authoritative when persistence throws", async () => {
    const source = createDemoCoachingContextSource();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository: {
        async load() {
          return null;
        },
        async save() {
          throw new Error("storage detail");
        },
        async clear() {},
      },
    });

    const outcome = await application.command({
      type: "record_athlete_feedback",
      requestId: "memory-only-feedback",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "Heavy legs.",
    });

    expect(outcome).toMatchObject({
      status: "ok",
      durability: "memory_only",
    });
    expect(application.getState().athleteFeedback).toHaveLength(1);
  });

  it("returns a valid duplicate request before validating its divergent body", async () => {
    const source = createDemoCoachingContextSource();
    const { repository, saves } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository,
    });
    const first = await application.command({
      type: "record_athlete_feedback",
      requestId: "duplicate-request",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "Original feedback",
    });

    const repeated = await application.command({
      type: "record_athlete_feedback",
      requestId: "duplicate-request",
      relatedWorkoutId: null,
      rawText: "   ",
      reported: { sessionRpe: 100 },
    });

    expect(repeated).toEqual(first);
    expect(application.getState().athleteFeedback).toHaveLength(1);
    expect(saves).toHaveLength(1);
  });

  it.each([
    [
      {
        requestId: "",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
      },
      "requestId",
    ],
    [
      {
        requestId: null,
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
      },
      "requestId",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "missing-workout",
        rawText: "Text",
      },
      "No Planned Workout",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "   ",
      },
      "rawText",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
        reported: { sessionRpe: Infinity },
      },
      "sessionRpe",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
        reported: { sessionRpe: 10.1 },
      },
      "sessionRpe",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
        reported: { legFeel: " " },
      },
      "legFeel",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
        reported: { painReported: "no" },
      },
      "painReported",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
        reported: { stoppedReason: 3 },
      },
      "stoppedReason",
    ],
    [
      {
        requestId: "request",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Text",
        reported: { confidence: "high" },
      },
      "reported",
    ],
  ])(
    "rejects invalid feedback without partial mutation %#",
    async (input, message) => {
      const source = createDemoCoachingContextSource();
      const { repository, saves } = createRecordingRepository();
      const application = createWorkspaceApplication({
        initialState: await source.loadContext(),
        fixtureSource: source,
        repository,
      });
      const before = application.getState();

      const outcome = await application.command({
        type: "record_athlete_feedback",
        ...input,
      });

      expect(outcome).toMatchObject({ status: "error", retryable: false });
      if (outcome.status !== "error") throw new Error("Expected error");
      expect(outcome.message).toContain(message);
      expect(application.getState()).toBe(before);
      expect(saves).toHaveLength(0);
    },
  );
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
