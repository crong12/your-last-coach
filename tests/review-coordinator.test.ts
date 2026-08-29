import { afterEach, describe, expect, it, vi } from "vitest";

import { createReviewCoordinator } from "../src/application/createReviewCoordinator";
import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type {
  PersistedWorkspace,
  WorkspaceRepository,
} from "../src/application/ports";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import {
  validateReviewProposal,
  type ReviewProposal,
} from "../src/domain/review";

const easyPrescription = (distanceKm: number) => ({
  blocks: [{ kind: "easy" as const, distanceKm }],
});

function acceptedProposal(): ReviewProposal {
  return {
    reviewId: "review:rest-of-week:2026-08-26",
    sourceWorkoutId: "planned-2026-08-26-threshold",
    expectedPlanVersion: 1,
    evidenceRefs: [
      "planned-workout:planned-2026-08-26-threshold",
      "workout-result:result-2026-08-26-threshold",
      "observation:training-load",
      "observation:recovery",
    ],
    rationale: {
      summary:
        "Your incomplete session is more consistent with accumulated fatigue than a sudden loss of fitness.",
      counterEvidence:
        "Your sleep, HRV, resting heart rate, and stress remain close to your normal range.",
      confidence: "moderate",
      limitations: [
        "One difficult workout cannot establish the cause.",
        "This does not diagnose injury or overtraining.",
      ],
    },
    recommended: {
      optionId: "recovery-first",
      label: "Recovery first",
      summary: "Make the clearest reduction in accumulated load.",
      tradeoff: "Loses weekly volume and long-run stimulus.",
      workoutChanges: [
        { kind: "delete", workoutId: "planned-2026-08-27-recovery" },
        {
          kind: "update",
          workoutId: "planned-2026-08-29-strides",
          changes: {
            title: "Easy run",
            purpose: "Keep the run relaxed and leave the strides out.",
            distanceKm: 6,
            prescription: easyPrescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "Easy long run",
            purpose: "Keep the long run easy and finish fresher.",
            distanceKm: 14,
            prescription: easyPrescription(14),
          },
        },
      ],
    },
    alternative: {
      optionId: "keep-the-rhythm",
      label: "Keep the rhythm",
      summary: "Preserve running frequency and more aerobic volume.",
      tradeoff: "Provides less recovery if fatigue has accumulated.",
      workoutChanges: [
        {
          kind: "update",
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "Very easy run",
            purpose: "Keep the run very easy.",
            distanceKm: 5,
            prescription: easyPrescription(5),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-29-strides",
          changes: {
            title: "Easy run",
            purpose: "Keep the run relaxed and leave the strides out.",
            distanceKm: 6,
            prescription: easyPrescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "Easy long run",
            purpose: "Keep the long run easy while preserving more volume.",
            distanceKm: 16,
            prescription: easyPrescription(16),
          },
        },
      ],
    },
  };
}

async function setup() {
  const fixtureSource = createDemoCoachingContextSource();
  const initialState = await fixtureSource.loadContext();
  const saved: PersistedWorkspace[] = [];
  const repository: WorkspaceRepository = {
    async load() {
      return null;
    },
    async save(workspace) {
      saved.push(workspace);
      return "persistent";
    },
    async clear() {},
  };
  const application = createWorkspaceApplication({
    initialState,
    fixtureSource,
    repository,
  });
  const coordinator = createReviewCoordinator({ application });
  return { application, coordinator, fixtureSource, saved };
}

describe("Workout Adaptation review coordinator", () => {
  afterEach(() => vi.useRealTimers());

  it("persists one fallback timeout after five minutes without mutating the plan", async () => {
    vi.useFakeTimers();
    const { application } = await setup();
    const coordinator = createReviewCoordinator({ application });
    const before = application.getState();

    coordinator.open(acceptedProposal(), "fallback");
    await vi.advanceTimersByTimeAsync(300_000);

    expect(coordinator.getState()).toEqual({ status: "idle" });
    await expect(
      application.readFallbackResult("review:rest-of-week:2026-08-26"),
    ).resolves.toEqual({
      status: "cancelled",
      reviewId: "review:rest-of-week:2026-08-26",
      reason: "timeout",
    });
    expect(application.getState()).toBe(before);
  });

  it("rejects stale UI actions from an earlier review generation", async () => {
    const { coordinator } = await setup();
    coordinator.open(acceptedProposal());
    const first = coordinator.getState();
    if (first.status !== "reviewing") throw new Error("Expected review");
    await coordinator.dismiss("athlete_dismissed", first.generation);
    coordinator.open(acceptedProposal());

    expect(
      coordinator.select("recovery-first", first.generation),
    ).toMatchObject({ status: "error", code: "not_found" });
    expect(coordinator.getState()).toMatchObject({
      status: "reviewing",
      selectedOptionId: null,
    });
    expect(coordinator.discussFurther(first.generation)).toMatchObject({
      status: "error",
      code: "not_found",
    });
    expect(coordinator.getState()).toMatchObject({ status: "reviewing" });
  });

  it("settles in memory when fallback cancellation persistence rejects", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository: {
        async load() {
          return null;
        },
        async save() {
          throw new Error("storage failed");
        },
        async clear() {},
      },
    });
    const coordinator = createReviewCoordinator({ application });
    coordinator.open(acceptedProposal(), "fallback");

    await expect(coordinator.discussFurther()).resolves.toEqual({
      status: "discuss_further",
      reviewId: "review:rest-of-week:2026-08-26",
    });
    expect(coordinator.getState()).toEqual({ status: "idle" });
    expect(application.hasUndeliveredFallbackResult()).toBe(true);
  });

  it("disposes an active primary waiter once and clears its timeout", async () => {
    vi.useFakeTimers();
    const { application } = await setup();
    const coordinator = createReviewCoordinator({ application });
    coordinator.open(acceptedProposal());
    const pending = coordinator.waitForSettlement(
      "review:rest-of-week:2026-08-26",
    );

    coordinator.dispose();
    coordinator.dispose();

    await expect(pending).resolves.toMatchObject({
      status: "cancelled",
      reason: "teardown",
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(coordinator.getState()).toEqual({ status: "idle" });
  });

  it("lets the first fallback cancellation win across abort, teardown, and timeout", async () => {
    vi.useFakeTimers();
    const { application, saved } = await setup();
    const coordinator = createReviewCoordinator({ application });
    const controller = new AbortController();
    coordinator.open(acceptedProposal(), "fallback", controller.signal);

    controller.abort();
    coordinator.dispose();
    await vi.advanceTimersByTimeAsync(300_000);
    await expect.poll(() => coordinator.getState()).toEqual({ status: "idle" });

    expect(saved).toHaveLength(1);
    await expect(
      application.readFallbackResult("review:rest-of-week:2026-08-26"),
    ).resolves.toEqual({
      status: "cancelled",
      reviewId: "review:rest-of-week:2026-08-26",
      reason: "host_aborted",
    });
  });
  it("requires a selection, then approves and settles with the structured application result", async () => {
    const { application, coordinator, saved } = await setup();
    coordinator.open(acceptedProposal());

    expect(await coordinator.approve()).toMatchObject({
      status: "error",
      code: "invalid_input",
    });
    expect(application.getState().trainingPlan.planVersion).toBe(1);
    coordinator.select("recovery-first");
    const settlement = coordinator.waitForSettlement(
      "review:rest-of-week:2026-08-26",
    );

    const approved = await coordinator.approve();

    expect(approved).toMatchObject({
      status: "approved",
      selectedOption: { optionId: "recovery-first" },
      planVersionBefore: 1,
      planVersionAfter: 2,
      durability: "persistent",
    });
    await expect(settlement).resolves.toEqual(approved);
    expect(coordinator.getState()).toEqual({ status: "idle" });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
    expect(saved).toHaveLength(1);
  });

  it("returns an applied review outcome without reopening the modal", async () => {
    const { coordinator } = await setup();
    const proposal = acceptedProposal();
    coordinator.open(proposal);
    coordinator.select("recovery-first");
    const first = await coordinator.approve();

    expect(coordinator.open(proposal)).toEqual(first);
    expect(coordinator.getState()).toEqual({ status: "idle" });
  });

  it("opens the accepted proposal and previews both exact fixture options without mutation", async () => {
    const { application, coordinator, saved } = await setup();
    const before = structuredClone(application.getState());

    expect(coordinator.open(acceptedProposal())).toEqual({
      status: "review_opened",
      reviewId: "review:rest-of-week:2026-08-26",
    });

    expect(coordinator.select("recovery-first")).toMatchObject({
      status: "preview_ready",
      optionId: "recovery-first",
      preview: [
        {
          date: "2026-08-27",
          before: { distanceKm: 6 },
          after: null,
        },
        {
          date: "2026-08-29",
          before: { distanceKm: 8 },
          after: { distanceKm: 6, prescription: easyPrescription(6) },
        },
        {
          date: "2026-08-30",
          before: { distanceKm: 18 },
          after: { distanceKm: 14, prescription: easyPrescription(14) },
        },
      ],
    });
    expect(coordinator.select("keep-the-rhythm")).toMatchObject({
      status: "preview_ready",
      optionId: "keep-the-rhythm",
      preview: [
        {
          date: "2026-08-27",
          before: { distanceKm: 6 },
          after: { distanceKm: 5, prescription: easyPrescription(5) },
        },
        {
          date: "2026-08-29",
          before: { distanceKm: 8 },
          after: { distanceKm: 6, prescription: easyPrescription(6) },
        },
        {
          date: "2026-08-30",
          before: { distanceKm: 18 },
          after: { distanceKm: 16, prescription: easyPrescription(16) },
        },
      ],
    });
    expect(application.getState()).toEqual(before);
    expect(saved).toHaveLength(0);
  });

  it("rejects alternatives with identical Workout Changes regardless of order", async () => {
    const { application } = await setup();
    const proposal = structuredClone(acceptedProposal());
    proposal.alternative.workoutChanges = structuredClone(
      proposal.recommended.workoutChanges,
    ).reverse();
    const workspace = application.getState();

    expect(
      validateReviewProposal(proposal, {
        planVersion: workspace.trainingPlan.planVersion,
        plannedWorkouts: workspace.trainingPlan.plannedWorkouts,
        evidenceRefs: new Set(proposal.evidenceRefs),
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "alternative.workoutChanges" }),
      ]),
    });
  });

  it("rejects malformed, stale, unknown, and ambiguous proposals with field-specific corrections", async () => {
    const { coordinator } = await setup();
    const cases: Array<[string, (proposal: ReviewProposal) => void, string]> = [
      [
        "stale plan",
        (p) => void (p.expectedPlanVersion = 2),
        "expectedPlanVersion",
      ],
      [
        "source",
        (p) => void (p.sourceWorkoutId = "missing"),
        "sourceWorkoutId",
      ],
      [
        "evidence",
        (p) => void (p.evidenceRefs = ["missing"]),
        "evidenceRefs[0]",
      ],
      [
        "option IDs",
        (p) => void (p.alternative.optionId = p.recommended.optionId),
        "alternative.optionId",
      ],
      [
        "change target",
        (p) =>
          void (p.recommended.workoutChanges[0] = {
            kind: "delete",
            workoutId: "missing",
          }),
        "recommended.workoutChanges[0].workoutId",
      ],
      [
        "duplicate target",
        (p) =>
          void p.recommended.workoutChanges.push({
            kind: "delete",
            workoutId: "planned-2026-08-27-recovery",
          }),
        "recommended.workoutChanges[3].workoutId",
      ],
      [
        "distance",
        (p) => {
          const change = p.alternative.workoutChanges[0];
          if (change.kind === "update") change.changes.distanceKm = -1;
        },
        "alternative.workoutChanges[0].changes.distanceKm",
      ],
      [
        "calendar date",
        (p) => {
          const change = p.alternative.workoutChanges[0];
          if (change.kind === "update") change.changes.date = "2026-13-99";
        },
        "alternative.workoutChanges[0].changes.date",
      ],
      [
        "prescription",
        (p) => {
          const change = p.alternative.workoutChanges[0];
          if (change.kind === "update")
            change.changes.prescription = easyPrescription(0);
        },
        "alternative.workoutChanges[0].changes.prescription",
      ],
    ];

    for (const [, mutate, expectedPath] of cases) {
      const proposal = acceptedProposal();
      mutate(proposal);
      expect(coordinator.open(proposal)).toMatchObject({
        status: "error",
        code: expect.any(String),
        issues: [
          expect.objectContaining({
            path: expectedPath,
            expected: expect.any(String),
          }),
        ],
      });
      expect(coordinator.getState()).toEqual({ status: "idle" });
    }
  });

  it("returns busy and settles discussion, dismissal, and reset without authoritative mutation", async () => {
    const { application, coordinator, fixtureSource, saved } = await setup();
    const before = structuredClone(application.getState());
    coordinator.open(acceptedProposal());

    expect(coordinator.open(acceptedProposal())).toEqual({
      status: "error",
      code: "busy",
      message: "Another Workout Adaptation review is already active.",
      retryable: true,
    });
    await expect(coordinator.discussFurther()).resolves.toEqual({
      status: "discuss_further",
      reviewId: "review:rest-of-week:2026-08-26",
    });
    expect(application.getState()).toEqual(before);

    coordinator.open(acceptedProposal());
    await expect(coordinator.dismiss("athlete_dismissed")).resolves.toEqual({
      status: "cancelled",
      reviewId: "review:rest-of-week:2026-08-26",
      reason: "athlete_dismissed",
    });
    expect(application.getState()).toEqual(before);

    coordinator.open(acceptedProposal());
    const reset = coordinator.reset();
    await expect(reset).resolves.toMatchObject({
      status: "cancelled",
      reason: "reset",
    });
    await application.command({ type: "reset_demo" });
    expect(application.getState()).toEqual(await fixtureSource.loadContext());
    expect(saved).toHaveLength(0);
  });
});

export { acceptedProposal };
