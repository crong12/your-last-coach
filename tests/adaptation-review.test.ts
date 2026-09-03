import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import { createReviewCoordinator } from "../src/application/createReviewCoordinator";
import { initializeWorkspace } from "../src/application/initializeWorkspace";
import type {
  PersistedWorkspace,
  WorkspaceRepository,
} from "../src/application/ports";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import { validateWorkspaceState } from "../src/domain/validation";
import { acceptedProposal } from "./review-coordinator.test";

function recordingRepository() {
  const saves: PersistedWorkspace[] = [];
  const repository: WorkspaceRepository = {
    async load() {
      return null;
    },
    async save(workspace) {
      saves.push(structuredClone(workspace));
      return "persistent";
    },
    async clear() {},
  };
  return { repository, saves };
}

describe("durable adaptation review", () => {
  it("accepts every evidence family emitted by context reads and reloads it", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository: firstRepository } = recordingRepository();
    const firstApplication = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository: firstRepository,
    });
    const firstProposal = acceptedProposal();
    await firstApplication.openPlanReview(firstProposal, "primary");
    const approved = await firstApplication.command({
      type: "apply_plan_approval",
      reviewId: firstProposal.reviewId,
      expectedPlanVersion: firstProposal.expectedPlanVersion,
      selectedOption: firstProposal.alternative,
    });
    expect(approved.status).toBe("approved");

    const saved: PersistedWorkspace[] = [];
    const repository: WorkspaceRepository = {
      async load() {
        return null;
      },
      async save(workspace) {
        saved.push(structuredClone(workspace));
        return "persistent";
      },
      async clear() {},
    };
    const application = createWorkspaceApplication({
      initialState: firstApplication.getState(),
      fixtureSource,
      repository,
    });
    const state = application.getState();
    const proposal = acceptedProposal();
    proposal.reviewId = "review:all-evidence-families";
    proposal.expectedPlanVersion = state.trainingPlan.planVersion;
    proposal.evidenceRefs = [
      `athlete:${state.athlete.id}`,
      `target-race:${state.targetRace.id}`,
      `training-phase:${state.trainingPhase.id}`,
      `training-plan:version:${state.trainingPlan.planVersion}`,
      "observation:training-load",
      "observation:recovery",
      `planned-workout:${state.trainingPlan.plannedWorkouts[0].id}`,
      `workout-result:${state.workoutResults[0].id}`,
      `athlete-feedback:${state.athleteFeedback[0].id}`,
      `coaching-topic:${state.coachingTopics[0].id}`,
      `plan-adaptation:${firstProposal.reviewId}`,
    ];

    await expect(
      application.openPlanReview(proposal, "fallback"),
    ).resolves.toMatchObject({
      status: "review_opened",
      reviewId: proposal.reviewId,
    });
    const persisted = saved.at(-1);
    if (!persisted) throw new Error("Expected a persisted pending proposal");
    const rehydrated = await initializeWorkspace({
      fixtureSource,
      repository: {
        async load() {
          return persisted;
        },
        async save() {
          return "persistent";
        },
        async clear() {},
      },
    });
    expect(rehydrated.state.pendingAdaptationProposal).toMatchObject({
      proposal: {
        reviewId: proposal.reviewId,
        evidenceRefs: proposal.evidenceRefs,
      },
    });
  });

  it("rolls back coordinator state when durable publication rejects the proposal", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    const coordinator = createReviewCoordinator({ application });
    application.openPlanReview = async () => ({
      status: "error",
      code: "invalid_input",
      message: "publication rejected",
      retryable: false,
    });

    await expect(
      coordinator.openAndPersist(acceptedProposal(), "fallback"),
    ).resolves.toMatchObject({ status: "error", code: "invalid_input" });
    expect(coordinator.getState()).toEqual({ status: "idle" });
    expect(application.getPendingAdaptationProposal()).toBeNull();
  });

  it("treats a delivered declined review ID as terminal", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    const proposal = acceptedProposal();
    await application.openPlanReview(proposal, "fallback");
    await expect(
      application.declinePlanReview(proposal.reviewId),
    ).resolves.toEqual({
      status: "declined",
      reviewId: proposal.reviewId,
    });
    await expect(
      application.readFallbackResult(proposal.reviewId),
    ).resolves.toEqual({
      status: "declined",
      reviewId: proposal.reviewId,
    });

    await expect(
      application.openPlanReview(proposal, "fallback"),
    ).resolves.toMatchObject({ status: "error", code: "busy" });
    const attemptedApproval = await application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: proposal.expectedPlanVersion,
      selectedOption: proposal.recommended,
    });
    expect(attemptedApproval).toMatchObject({
      status: "error",
      code: "invalid_input",
    });
    expect(application.getState().trainingPlan.planVersion).toBe(1);
    expect(application.getAdaptationRecord(proposal.reviewId).status).toBe(
      "declined",
    );
  });

  it("rejects overlapping approved and declined review IDs", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    const proposal = acceptedProposal();
    await application.openPlanReview(proposal, "primary");
    const approved = await application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: proposal.expectedPlanVersion,
      selectedOption: proposal.recommended,
    });
    expect(approved.status).toBe("approved");
    const invalid = structuredClone(application.getState());
    invalid.declinedAdaptations.push({
      status: "declined",
      reviewId: proposal.reviewId,
      selectedOption: null,
      recommendation: {
        label: proposal.recommended.label,
        summary: proposal.recommended.summary,
      },
      declinedAt: invalid.clock.now,
      planVersion: invalid.trainingPlan.planVersion,
      evidenceRefs: proposal.evidenceRefs,
    });

    expect(validateWorkspaceState(invalid)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.stringContaining("terminal adaptation review IDs"),
      ]),
    });
  });

  it("returns memory_only from durable open and approval", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
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
    await expect(
      application.openPlanReview(proposal, "fallback"),
    ).resolves.toEqual({
      status: "review_opened",
      reviewId: proposal.reviewId,
      durability: "memory_only",
    });
    const selected = await application.command({
      type: "apply_plan_approval",
      reviewId: proposal.reviewId,
      expectedPlanVersion: proposal.expectedPlanVersion,
      selectedOption: proposal.recommended,
    });
    expect(selected).toMatchObject({
      status: "approved",
      durability: "memory_only",
    });
  });

  it("clears fallback cancellation delivery during an explicit demo reset", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    const coordinator = createReviewCoordinator({ application });
    const proposal = acceptedProposal();
    await coordinator.openAndPersist(proposal, "fallback");
    await expect(coordinator.reset()).resolves.toMatchObject({
      status: "cancelled",
      reviewId: proposal.reviewId,
      reason: "reset",
    });
    await application.command({ type: "reset_demo" });

    await expect(
      application.readFallbackResult(proposal.reviewId),
    ).resolves.toEqual({
      status: "not_ready",
      reviewId: proposal.reviewId,
    });
  });

  it("publishes a validated pending proposal and persists it before reporting open", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository, saves } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });

    const result = await application.openPlanReview(
      acceptedProposal(),
      "fallback",
    );

    expect(result).toEqual({
      status: "review_opened",
      reviewId: "review:rest-of-week:2026-08-26",
    });
    expect(application.getState().pendingAdaptationProposal).toMatchObject({
      proposal: { reviewId: "review:rest-of-week:2026-08-26" },
      delivery: "fallback",
      selectedOptionId: null,
    });
    expect(saves).toHaveLength(1);
    expect(saves[0].state.pendingAdaptationProposal).toMatchObject({
      proposal: { reviewId: "review:rest-of-week:2026-08-26" },
    });
  });

  it("records Keep current plan as a declined terminal decision and delivers it once", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository, saves } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    const coordinator = createReviewCoordinator({ application });

    expect(coordinator.open(acceptedProposal(), "fallback")).toMatchObject({
      status: "review_opened",
    });
    const declined = await coordinator.decline();

    expect(declined).toEqual({
      status: "declined",
      reviewId: acceptedProposal().reviewId,
    });
    expect(application.getState().pendingAdaptationProposal).toBeUndefined();
    expect(application.getState().declinedAdaptations).toEqual([
      expect.objectContaining({
        status: "declined",
        reviewId: acceptedProposal().reviewId,
        selectedOption: null,
        recommendation: {
          label: "Recovery first",
          summary: expect.any(String),
        },
      }),
    ]);
    expect(application.getState().trainingPlan.planVersion).toBe(1);
    expect(saves.at(-1)?.undeliveredFallbackResult).toEqual({
      status: "declined",
      reviewId: acceptedProposal().reviewId,
    });
    await expect(
      application.readFallbackResult(acceptedProposal().reviewId),
    ).resolves.toEqual({
      status: "declined",
      reviewId: acceptedProposal().reviewId,
    });
    await expect(
      application.readFallbackResult(acceptedProposal().reviewId),
    ).resolves.toEqual({
      status: "not_ready",
      reviewId: acceptedProposal().reviewId,
    });
  });

  it("rehydrates an open pending review and converts an expired fallback to timeout", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository: sourceRepository, saves } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository: sourceRepository,
      now: () => Date.parse("2026-08-26T20:15:00+01:00"),
      reviewTimeoutMs: 5 * 60 * 1000,
    });
    await application.openPlanReview(acceptedProposal(), "fallback");
    const persisted = saves.at(-1);
    if (!persisted) throw new Error("Expected a persisted review");

    const rehydrated = await initializeWorkspace({
      fixtureSource,
      now: () => Date.parse("2026-08-26T20:16:00+01:00"),
      repository: {
        async load() {
          return persisted;
        },
        async save() {
          return "persistent";
        },
        async clear() {},
      },
    });
    expect(rehydrated.state.pendingAdaptationProposal).toMatchObject({
      proposal: { reviewId: acceptedProposal().reviewId },
      delivery: "fallback",
    });

    const expiredSaves: PersistedWorkspace[] = [];
    const expired = await initializeWorkspace({
      fixtureSource,
      now: () => Date.parse("2026-08-26T20:20:01+01:00"),
      repository: {
        async load() {
          return persisted;
        },
        async save(workspace) {
          expiredSaves.push(structuredClone(workspace));
          return "persistent";
        },
        async clear() {},
      },
    });
    expect(expired.state.pendingAdaptationProposal).toBeUndefined();
    expect(expired.undeliveredFallbackResult).toEqual({
      status: "cancelled",
      reviewId: acceptedProposal().reviewId,
      reason: "timeout",
    });
    expect(expiredSaves.at(-1)?.undeliveredFallbackResult).toEqual(
      expired.undeliveredFallbackResult,
    );
  });

  it("rehydrates a declined fallback result for exact-once delivery", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository, saves } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    await application.openPlanReview(acceptedProposal(), "fallback");
    await application.declinePlanReview(acceptedProposal().reviewId);
    const persisted = saves.at(-1);
    if (!persisted) throw new Error("Expected a persisted declined result");

    const initialized = await initializeWorkspace({
      fixtureSource,
      repository: {
        async load() {
          return persisted;
        },
        async save() {
          return "persistent";
        },
        async clear() {},
      },
    });
    expect(initialized.state.declinedAdaptations).toHaveLength(1);
    expect(initialized.undeliveredFallbackResult).toEqual({
      status: "declined",
      reviewId: acceptedProposal().reviewId,
    });

    const restored = createWorkspaceApplication({
      initialState: initialized.state,
      fixtureSource,
      repository: {
        async load() {
          return null;
        },
        async save() {
          return "persistent";
        },
        async clear() {},
      },
      initialUndeliveredFallbackResult: initialized.undeliveredFallbackResult,
    });
    await expect(
      restored.readFallbackResult(acceptedProposal().reviewId),
    ).resolves.toEqual({
      status: "declined",
      reviewId: acceptedProposal().reviewId,
    });
    await expect(
      restored.readFallbackResult(acceptedProposal().reviewId),
    ).resolves.toEqual({
      status: "not_ready",
      reviewId: acceptedProposal().reviewId,
    });
  });

  it("keeps a published fallback proposal pending across coordinator teardown", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const { repository } = recordingRepository();
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    await application.openPlanReview(acceptedProposal(), "fallback");
    const coordinator = createReviewCoordinator({ application });

    expect(coordinator.open(acceptedProposal(), "fallback")).toMatchObject({
      status: "review_opened",
    });
    coordinator.dispose();

    expect(application.getPendingAdaptationProposal()).toMatchObject({
      proposal: { reviewId: acceptedProposal().reviewId },
      delivery: "fallback",
    });
  });

  it("does not report a fallback open before its pending proposal is saved", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    let releaseSave!: () => void;
    let saveStarted!: () => void;
    const saveStartedPromise = new Promise<void>((resolve) => {
      saveStarted = resolve;
    });
    const saveReleasePromise = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository: {
        async load() {
          return null;
        },
        async save() {
          saveStarted();
          await saveReleasePromise;
          return "persistent";
        },
        async clear() {},
      },
    });
    const coordinator = createReviewCoordinator({ application });

    let resolved = false;
    const opening = coordinator
      .openAndPersist(acceptedProposal(), "fallback")
      .then((result) => {
        resolved = true;
        return result;
      });
    await saveStartedPromise;
    await Promise.resolve();
    expect(resolved).toBe(false);

    releaseSave();
    await expect(opening).resolves.toMatchObject({
      status: "review_opened",
      reviewId: acceptedProposal().reviewId,
    });
  });
});
