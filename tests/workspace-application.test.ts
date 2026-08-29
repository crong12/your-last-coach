import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import type {
  PersistedWorkspace,
  WorkspaceRepository,
} from "../src/application/ports";
import { acceptedProposal } from "./review-coordinator.test";

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
  it("applies Recovery first atomically and persists one replayable outcome", async () => {
    const source = createDemoCoachingContextSource();
    const { repository, saves } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository,
    });
    const notifications: number[] = [];
    application.subscribe(() =>
      notifications.push(application.getState().trainingPlan.planVersion),
    );
    const proposal = acceptedProposal();
    application.activatePlanReview(proposal);

    const outcome = await application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: proposal.expectedPlanVersion,
      selectedOption: proposal.recommended,
    });

    expect(outcome).toEqual({
      status: "approved",
      reviewId: proposal.reviewId,
      selectedOption: {
        optionId: "recovery-first",
        label: "Recovery first",
      },
      affectedWorkouts: [
        {
          workoutId: "planned-2026-08-27-recovery",
          before: expect.objectContaining({ distanceKm: 6 }),
          after: null,
        },
        {
          workoutId: "planned-2026-08-29-strides",
          before: expect.objectContaining({ distanceKm: 8 }),
          after: expect.objectContaining({ distanceKm: 6 }),
        },
        {
          workoutId: "planned-2026-08-30-long",
          before: expect.objectContaining({ distanceKm: 18 }),
          after: expect.objectContaining({ distanceKm: 14 }),
        },
      ],
      appliedAt: "2026-08-26T20:15:00+01:00",
      planVersionBefore: 1,
      planVersionAfter: 2,
      evidenceRefs: proposal.evidenceRefs,
      durability: "persistent",
    });
    expect(application.getState().trainingPlan).toMatchObject({
      planVersion: 2,
      plannedWorkouts: expect.not.arrayContaining([
        expect.objectContaining({ id: "planned-2026-08-27-recovery" }),
      ]),
    });
    expect(application.getState().appliedReviewIds).toEqual([
      proposal.reviewId,
    ]);
    expect(application.getState().adaptationReceipts).toHaveLength(1);
    expect(application.getState().mutationHistory).toEqual([
      {
        id: `plan-adaptation:${proposal.reviewId}`,
        kind: "plan_adaptation",
        occurredAt: "2026-08-26T20:15:00+01:00",
      },
    ]);
    expect(saves).toHaveLength(1);
    expect(saves[0].state.trainingPlan.planVersion).toBe(2);
    expect(notifications).toEqual([2]);
  });

  it("replays an applied review without validating divergent input or saving again", async () => {
    const source = createDemoCoachingContextSource();
    const { repository, saves } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository,
    });
    const proposal = acceptedProposal();
    application.activatePlanReview(proposal);
    const command = {
      type: "apply_plan_approval" as const,
      reviewId: proposal.reviewId,
      expectedPlanVersion: proposal.expectedPlanVersion,
      selectedOption: proposal.recommended,
    };
    const first = await application.command(command);
    const repeated = await application.command({
      ...command,
      expectedPlanVersion: 999,
      selectedOption: null,
    });

    expect(repeated).toEqual(first);
    expect(saves).toHaveLength(1);
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("coalesces the same in-flight review and rejects a different concurrent approval", async () => {
    const source = createDemoCoachingContextSource();
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => (releaseSave = resolve));
    let saveCount = 0;
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository: {
        async load() {
          return null;
        },
        async save() {
          saveCount += 1;
          await saveGate;
          return "persistent";
        },
        async clear() {},
      },
    });
    const proposal = acceptedProposal();
    application.activatePlanReview(proposal);
    const command = {
      type: "apply_plan_approval" as const,
      reviewId: proposal.reviewId,
      expectedPlanVersion: 1,
      selectedOption: proposal.recommended,
    };

    const first = application.command(command);
    const repeated = application.command(command);
    const competing = await application.command({
      ...command,
      reviewId: "review:competing",
    });
    releaseSave();

    await expect(first).resolves.toEqual(await repeated);
    expect(competing).toMatchObject({ status: "error", code: "busy" });
    expect(saveCount).toBe(1);
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("orders reset after an in-flight approval save and never publishes the stale plan", async () => {
    const source = createDemoCoachingContextSource();
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => (releaseSave = resolve));
    const operations: string[] = [];
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository: {
        async load() {
          return null;
        },
        async save(workspace) {
          operations.push(`save:${workspace.state.trainingPlan.planVersion}`);
          await saveGate;
          return "persistent";
        },
        async clear() {
          operations.push("clear");
        },
      },
    });
    const observed: number[] = [];
    application.subscribe(() =>
      observed.push(application.getState().trainingPlan.planVersion),
    );
    const proposal = acceptedProposal();
    application.activatePlanReview(proposal, "fallback");

    const approval = application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: 1,
      selectedOption: proposal.recommended,
    });
    await Promise.resolve();
    const reset = application.command({ type: "reset_demo" });
    releaseSave();

    await expect(approval).resolves.toMatchObject({
      status: "error",
      code: "cancelled",
    });
    await expect(reset).resolves.toEqual({
      status: "reset",
      durability: "persistent",
    });
    expect(operations).toEqual(["save:2", "clear"]);
    expect(observed).toEqual([1]);
    expect(application.getState()).toEqual(await source.loadContext());
  });

  it("records feedback against the published plan after an in-flight approval", async () => {
    const source = createDemoCoachingContextSource();
    let releaseFirstSave!: () => void;
    const firstSaveGate = new Promise<void>(
      (resolve) => (releaseFirstSave = resolve),
    );
    const saves: PersistedWorkspace[] = [];
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository: {
        async load() {
          return null;
        },
        async save(workspace) {
          saves.push(structuredClone(workspace));
          if (saves.length === 1) await firstSaveGate;
          return "persistent";
        },
        async clear() {},
      },
    });
    const proposal = acceptedProposal();
    application.activatePlanReview(proposal);
    const approval = application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: 1,
      selectedOption: proposal.recommended,
    });
    await Promise.resolve();

    const feedback = application.command({
      type: "record_athlete_feedback",
      requestId: "during-approval",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "Still heavy.",
    });
    releaseFirstSave();

    await expect(approval).resolves.toMatchObject({ status: "approved" });
    await expect(feedback).resolves.toMatchObject({ status: "ok" });
    expect(application.getState()).toMatchObject({
      trainingPlan: { planVersion: 2 },
      athleteFeedback: [
        { id: "athlete-feedback:seed-shin-discomfort" },
        { requestId: "during-approval" },
      ],
    });
    expect(saves[1]).toMatchObject({
      state: {
        trainingPlan: { planVersion: 2 },
        athleteFeedback: [
          { id: "athlete-feedback:seed-shin-discomfort" },
          { requestId: "during-approval" },
        ],
      },
    });
  });

  it("keeps an approved snapshot authoritative and reports memory-only after save failure", async () => {
    const source = createDemoCoachingContextSource();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository: {
        durability: "memory_only",
        async load() {
          return null;
        },
        async save() {
          return "memory_only";
        },
        async clear() {},
      },
    });
    const proposal = acceptedProposal();
    application.activatePlanReview(proposal);

    const outcome = await application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: 1,
      selectedOption: proposal.recommended,
    });

    expect(outcome).toMatchObject({
      status: "approved",
      durability: "memory_only",
    });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("rejects an active option whose result falls outside the persisted plan horizon", async () => {
    const source = createDemoCoachingContextSource();
    const { repository, saves } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository,
    });
    const proposal = acceptedProposal();
    const update = proposal.recommended.workoutChanges[1];
    if (update.kind === "update") update.changes.date = "2026-09-01";
    application.activatePlanReview(proposal);
    const before = application.getState();

    const outcome = await application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: 1,
      selectedOption: proposal.recommended,
    });

    expect(outcome).toMatchObject({ status: "error", code: "invalid_input" });
    expect(application.getState()).toBe(before);
    expect(saves).toHaveLength(0);
  });

  it("rejects approval when no matching review is active", async () => {
    const source = createDemoCoachingContextSource();
    const { repository, saves } = createRecordingRepository();
    const application = createWorkspaceApplication({
      initialState: await source.loadContext(),
      fixtureSource: source,
      repository,
    });
    const proposal = acceptedProposal();
    const before = application.getState();

    const outcome = await application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: 1,
      selectedOption: proposal.recommended,
    });

    expect(outcome).toMatchObject({ status: "error", code: "invalid_input" });
    expect(application.getState()).toBe(before);
    expect(saves).toHaveLength(0);
  });

  it.each([
    [
      "stale_plan",
      (command: Record<string, unknown>) => (command.expectedPlanVersion = 2),
    ],
    [
      "invalid_input",
      (command: Record<string, unknown>) => (command.reviewId = ""),
    ],
    [
      "invalid_input",
      (command: Record<string, unknown>) => (command.selectedOption = null),
    ],
    [
      "invalid_input",
      (command: Record<string, unknown>) => {
        const option = structuredClone(command.selectedOption) as ReturnType<
          typeof acceptedProposal
        >["recommended"];
        option.workoutChanges.push({
          kind: "delete",
          workoutId: "planned-2026-08-27-recovery",
        });
        command.selectedOption = option;
      },
    ],
    [
      "invalid_input",
      (command: Record<string, unknown>) => {
        const option = structuredClone(command.selectedOption) as ReturnType<
          typeof acceptedProposal
        >["recommended"];
        const update = option.workoutChanges[1];
        if (update.kind === "update") update.changes.date = "2026-09-01";
        command.selectedOption = option;
      },
    ],
    [
      "invalid_input",
      (command: Record<string, unknown>) => {
        const option = structuredClone(command.selectedOption) as ReturnType<
          typeof acceptedProposal
        >["recommended"];
        option.workoutChanges[0] = { kind: "delete", workoutId: "missing" };
        command.selectedOption = option;
      },
    ],
  ])(
    "rejects approval %s without mutation or persistence",
    async (code, mutate) => {
      const source = createDemoCoachingContextSource();
      const { repository, saves } = createRecordingRepository();
      const application = createWorkspaceApplication({
        initialState: await source.loadContext(),
        fixtureSource: source,
        repository,
      });
      const proposal = acceptedProposal();
      application.activatePlanReview(proposal);
      const command: Record<string, unknown> = {
        type: "apply_plan_approval",
        reviewId: proposal.reviewId,
        expectedPlanVersion: proposal.expectedPlanVersion,
        selectedOption: proposal.recommended,
      };
      mutate(command);
      const before = application.getState();

      const outcome = await application.command(command as never);

      expect(outcome).toMatchObject({ status: "error", code });
      expect(application.getState()).toBe(before);
      expect(saves).toHaveLength(0);
    },
  );

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
      expect.objectContaining({
        id: "athlete-feedback:seed-shin-discomfort",
      }),
      outcome.status === "ok" ? outcome.feedback : null,
    ]);
    expect(application.getState().processedRequestIds).toEqual([
      "hero-feedback-request",
    ]);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      savedAt: "2026-08-26T20:15:00+01:00",
      state: {
        athleteFeedback: [
          expect.objectContaining({
            id: "athlete-feedback:seed-shin-discomfort",
          }),
          outcome.status === "ok" ? outcome.feedback : null,
        ],
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
    expect(application.getState().athleteFeedback).toHaveLength(2);
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
    expect(application.getState().athleteFeedback).toHaveLength(2);
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
