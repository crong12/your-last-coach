import type {
  PlanApprovalResult,
  WorkspaceApplication,
} from "./createWorkspaceApplication";
import {
  buildReviewPreview,
  validateReviewProposal,
  type ReviewPreviewRow,
  type ReviewProposal,
} from "../domain/review";

export type ReviewTerminalResult =
  | { status: "discuss_further"; reviewId: string }
  | { status: "cancelled"; reviewId: string; reason: string }
  | PlanApprovalResult;

export type ReviewCoordinatorState =
  | { status: "idle" }
  | {
      status: "reviewing";
      proposal: ReviewProposal;
      selectedOptionId: string | null;
      preview: ReviewPreviewRow[];
      applying?: true;
    };

export interface ReviewCoordinator {
  getState(): ReviewCoordinatorState;
  open(value: unknown): unknown;
  select(optionId: string): unknown;
  approve(): Promise<unknown>;
  discussFurther():
    | ReviewTerminalResult
    | { status: "error"; code: "not_found"; message: string; retryable: false };
  dismiss(
    reason: string,
  ):
    | ReviewTerminalResult
    | { status: "error"; code: "not_found"; message: string; retryable: false };
  reset(): ReviewTerminalResult | null;
  waitForSettlement(
    reviewId: string,
    signal?: AbortSignal,
  ): Promise<ReviewTerminalResult>;
  subscribe(listener: () => void): () => void;
}

export function createReviewCoordinator({
  application,
}: {
  application: WorkspaceApplication;
}): ReviewCoordinator {
  let state: ReviewCoordinatorState = { status: "idle" };
  const listeners = new Set<() => void>();
  const waiters = new Map<
    string,
    Set<(result: ReviewTerminalResult) => void>
  >();

  const publish = () => listeners.forEach((listener) => listener());
  const settle = (result: ReviewTerminalResult) => {
    application.deactivatePlanReview(result.reviewId);
    state = { status: "idle" };
    publish();
    waiters.get(result.reviewId)?.forEach((resolve) => resolve(result));
    waiters.delete(result.reviewId);
    return result;
  };
  const missing = () => ({
    status: "error" as const,
    code: "not_found" as const,
    message: "No Workout Adaptation review is active.",
    retryable: false as const,
  });

  return {
    getState: () => state,
    open(value) {
      if (
        typeof value === "object" &&
        value !== null &&
        "reviewId" in value &&
        typeof value.reviewId === "string"
      ) {
        const replayed = application.getPlanApproval(value.reviewId);
        if (replayed) return replayed;
      }
      if (state.status === "reviewing") {
        return {
          status: "error",
          code: "busy",
          message: "Another Workout Adaptation review is already active.",
          retryable: true,
        };
      }
      const workspace = application.getState();
      const athlete = application.query({ type: "get_athlete_context" });
      const plan = application.query({
        type: "get_training_plan",
        from: "2026-08-01",
        to: "2026-08-31",
      });
      const evidenceRefs = new Set(athlete.evidenceRefs);
      if (plan.status === "ok") {
        plan.evidenceRefs.forEach((ref) => evidenceRefs.add(ref));
        for (const workout of plan.data.plannedWorkouts) {
          const context = application.query({
            type: "get_workout_context",
            workoutId: workout.id,
          });
          if (context.status === "ok")
            context.evidenceRefs.forEach((ref) => evidenceRefs.add(ref));
        }
      }
      const validated = validateReviewProposal(value, {
        planVersion: workspace.trainingPlan.planVersion,
        plannedWorkouts: workspace.trainingPlan.plannedWorkouts,
        evidenceRefs,
      });
      if (!validated.valid) {
        return {
          status: "error",
          code: validated.stale ? "stale_plan" : "invalid_input",
          message: validated.stale
            ? "The proposal is based on a stale Training Plan version."
            : "The Workout Adaptation proposal is invalid.",
          retryable: true,
          issues: validated.issues,
        };
      }
      state = {
        status: "reviewing",
        proposal: validated.proposal,
        selectedOptionId: null,
        preview: [],
      };
      application.activatePlanReview(validated.proposal);
      publish();
      return { status: "review_opened", reviewId: validated.proposal.reviewId };
    },
    select(optionId) {
      if (state.status !== "reviewing") return missing();
      if (state.applying) {
        return {
          status: "error",
          code: "busy",
          message: "Plan Approval is being applied.",
          retryable: true,
        };
      }
      const option = [
        state.proposal.recommended,
        state.proposal.alternative,
      ].find((candidate) => candidate.optionId === optionId);
      if (!option) {
        return {
          status: "error",
          code: "invalid_input",
          message:
            "optionId must identify the active recommendation or alternative.",
          retryable: false,
        };
      }
      const preview = buildReviewPreview(
        application.getState().trainingPlan.plannedWorkouts,
        option,
      );
      state = { ...state, selectedOptionId: optionId, preview };
      publish();
      return { status: "preview_ready", optionId, preview };
    },
    async approve() {
      if (state.status !== "reviewing") return missing();
      if (state.applying) {
        return {
          status: "error",
          code: "busy",
          message: "Plan Approval is being applied.",
          retryable: true,
        };
      }
      if (!state.selectedOptionId) {
        return {
          status: "error",
          code: "invalid_input",
          message: "Select a Workout Adaptation before approving it.",
          retryable: false,
        };
      }
      const selectedOptionId = state.selectedOptionId;
      const selectedOption = [
        state.proposal.recommended,
        state.proposal.alternative,
      ].find(({ optionId }) => optionId === selectedOptionId)!;
      const proposal = state.proposal;
      state = { ...state, applying: true };
      publish();
      const result = await application.command({
        type: "apply_plan_approval",
        reviewId: proposal.reviewId,
        expectedPlanVersion: proposal.expectedPlanVersion,
        selectedOption,
      });
      if (result.status === "approved") return settle(result);
      if (
        state.status === "reviewing" &&
        state.proposal.reviewId === proposal.reviewId
      ) {
        const { applying: _applying, ...reviewing } = state;
        state = reviewing;
        publish();
      }
      return result;
    },
    discussFurther() {
      if (state.status !== "reviewing") return missing();
      if (state.applying)
        return {
          status: "error",
          code: "busy",
          message: "Plan Approval is being applied.",
          retryable: true,
        } as never;
      return settle({
        status: "discuss_further",
        reviewId: state.proposal.reviewId,
      });
    },
    dismiss(reason) {
      if (state.status !== "reviewing") return missing();
      if (state.applying)
        return {
          status: "error",
          code: "busy",
          message: "Plan Approval is being applied.",
          retryable: true,
        } as never;
      return settle({
        status: "cancelled",
        reviewId: state.proposal.reviewId,
        reason,
      });
    },
    reset() {
      if (state.status !== "reviewing") return null;
      return settle({
        status: "cancelled",
        reviewId: state.proposal.reviewId,
        reason: "reset",
      });
    },
    waitForSettlement(reviewId, signal) {
      return new Promise((resolve) => {
        const registrations = waiters.get(reviewId) ?? new Set();
        registrations.add(resolve);
        waiters.set(reviewId, registrations);
        signal?.addEventListener(
          "abort",
          () => {
            if (
              state.status === "reviewing" &&
              state.proposal.reviewId === reviewId
            ) {
              resolve(
                settle({
                  status: "cancelled",
                  reviewId,
                  reason: "host_aborted",
                }),
              );
            }
          },
          { once: true },
        );
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
