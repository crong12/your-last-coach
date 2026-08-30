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
  | { status: "declined"; reviewId: string }
  | { status: "cancelled"; reviewId: string; reason: string }
  | PlanApprovalResult;

type ReviewActionError = {
  status: "error";
  code: "not_found" | "busy";
  message: string;
  retryable: boolean;
};

export type ReviewCoordinatorState =
  | { status: "idle" }
  | {
      status: "reviewing";
      proposal: ReviewProposal;
      selectedOptionId: string | null;
      preview: ReviewPreviewRow[];
      delivery: "primary" | "fallback";
      generation: number;
      applying?: true;
      settling?: true;
    };

export interface ReviewCoordinator {
  getState(): ReviewCoordinatorState;
  open(
    value: unknown,
    delivery?: "primary" | "fallback",
    signal?: AbortSignal,
  ): unknown;
  openAndPersist(
    value: unknown,
    delivery?: "primary" | "fallback",
    signal?: AbortSignal,
  ): Promise<unknown>;
  select(optionId: string, generation?: number): unknown;
  approve(generation?: number): Promise<unknown>;
  decline(
    generation?: number,
  ): ReviewTerminalResult | ReviewActionError | Promise<ReviewTerminalResult>;
  discussFurther(
    generation?: number,
  ): ReviewTerminalResult | ReviewActionError | Promise<ReviewTerminalResult>;
  dismiss(
    reason: string,
    generation?: number,
  ): ReviewTerminalResult | ReviewActionError | Promise<ReviewTerminalResult>;
  reset(): ReviewTerminalResult | Promise<ReviewTerminalResult> | null;
  waitForSettlement(
    reviewId: string,
    signal?: AbortSignal,
  ): Promise<ReviewTerminalResult>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function createReviewCoordinator({
  application,
  timeoutMs = 300_000,
}: {
  application: WorkspaceApplication;
  timeoutMs?: number;
}): ReviewCoordinator {
  let state: ReviewCoordinatorState = { status: "idle" };
  let nextGeneration = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let removeActiveAbort: (() => void) | null = null;
  let terminalInFlight: Promise<ReviewTerminalResult> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const settledResults = new Map<string, ReviewTerminalResult>();
  const waiters = new Map<
    string,
    Set<{
      resolve: (result: ReviewTerminalResult) => void;
      removeAbort?: () => void;
    }>
  >();

  const publish = () => listeners.forEach((listener) => listener());
  const settle = (result: ReviewTerminalResult) => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    removeActiveAbort?.();
    removeActiveAbort = null;
    application.deactivatePlanReview(result.reviewId);
    terminalInFlight = null;
    state = { status: "idle" };
    settledResults.set(result.reviewId, result);
    publish();
    waiters.get(result.reviewId)?.forEach((waiter) => {
      waiter.removeAbort?.();
      waiter.resolve(result);
    });
    waiters.delete(result.reviewId);
    return result;
  };
  const missing = () => ({
    status: "error" as const,
    code: "not_found" as const,
    message: "No Workout Adaptation review is active.",
    retryable: false as const,
  });
  const current = (generation?: number) =>
    state.status === "reviewing" &&
    (generation === undefined || state.generation === generation);
  const armTimeout = (
    reviewId: string,
    generation: number,
    expiresAt?: string,
  ) => {
    if (timeout) clearTimeout(timeout);
    const deadline =
      expiresAt === undefined ? Date.now() + timeoutMs : Date.parse(expiresAt);
    timeout = setTimeout(
      () => {
        void complete(
          { status: "cancelled", reviewId, reason: "timeout" },
          generation,
        );
      },
      Math.max(0, deadline - Date.now()),
    );
  };
  const complete = (
    result: ReviewTerminalResult,
    generation: number,
  ): ReviewTerminalResult | Promise<ReviewTerminalResult> => {
    if (terminalInFlight) return terminalInFlight;
    if (!current(generation)) return result;
    if (result.status === "approved") return settle(result);
    if (state.status !== "reviewing") return result;
    const settlementResult =
      result.status === "declined"
        ? result
        : state.delivery === "fallback"
          ? result
          : undefined;
    state = { ...state, settling: true };
    publish();
    terminalInFlight = application
      .cancelPlanReview(settlementResult)
      .then(() => {
        if (!current(generation)) return result;
        return settle(result);
      });
    return terminalInFlight;
  };

  return {
    getState: () => state,
    open(value, delivery = "primary", signal) {
      if (disposed) return missing();
      if (
        delivery === "fallback" &&
        application.hasUndeliveredFallbackResult()
      ) {
        return {
          status: "error",
          code: "busy",
          message:
            "A completed Workout Adaptation decision is awaiting delivery.",
          retryable: true,
        };
      }
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
      const inputReviewId =
        typeof value === "object" &&
        value !== null &&
        "reviewId" in value &&
        typeof value.reviewId === "string"
          ? value.reviewId
          : null;
      const pending = application.getPendingAdaptationProposal();
      if (pending && pending.proposal.reviewId !== inputReviewId) {
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
      const validated = pending
        ? { valid: true as const, proposal: pending.proposal }
        : validateReviewProposal(value, {
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
      const generation = ++nextGeneration;
      state = {
        status: "reviewing",
        proposal: validated.proposal,
        selectedOptionId: pending?.selectedOptionId ?? null,
        preview: [],
        delivery: pending?.delivery ?? delivery,
        generation,
      };
      application.activatePlanReview(
        validated.proposal,
        pending?.delivery ?? delivery,
      );
      publish();
      if (signal) {
        const abort = () => {
          void complete(
            {
              status: "cancelled",
              reviewId: validated.proposal.reviewId,
              reason: "host_aborted",
            },
            generation,
          );
        };
        signal.addEventListener("abort", abort, { once: true });
        removeActiveAbort = () => signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
      }
      armTimeout(validated.proposal.reviewId, generation, pending?.expiresAt);
      return { status: "review_opened", reviewId: validated.proposal.reviewId };
    },
    async openAndPersist(value, delivery = "primary", signal) {
      const opened = this.open(value, delivery, signal) as {
        status: string;
        reviewId?: string;
      };
      if (opened.status !== "review_opened" || !opened.reviewId) return opened;
      const persisted = await application.openPlanReview(
        value as ReviewProposal,
        delivery,
      );
      if (persisted.status !== "review_opened") return persisted;
      return opened;
    },
    select(optionId, generation) {
      if (!current(generation) || state.status !== "reviewing")
        return missing();
      if (state.applying || state.settling) {
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
      application.selectPlanReviewOption(state.proposal.reviewId, optionId);
      publish();
      return { status: "preview_ready", optionId, preview };
    },
    async approve(generation) {
      if (!current(generation) || state.status !== "reviewing")
        return missing();
      if (state.applying || state.settling) {
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
      const approvalGeneration = state.generation;
      state = { ...state, applying: true };
      publish();
      const result = await application.command({
        type: "apply_plan_approval",
        reviewId: proposal.reviewId,
        expectedPlanVersion: proposal.expectedPlanVersion,
        selectedOption,
      });
      if (result.status === "approved") {
        if (!current(approvalGeneration)) return result;
        return complete(result, approvalGeneration);
      }
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
    decline(generation) {
      if (!current(generation) || state.status !== "reviewing")
        return missing();
      if (state.applying || state.settling) {
        return {
          status: "error",
          code: "busy",
          message: "Plan Approval is being applied.",
          retryable: true,
        };
      }
      return complete(
        { status: "declined", reviewId: state.proposal.reviewId },
        state.generation,
      );
    },
    discussFurther(generation) {
      if (!current(generation) || state.status !== "reviewing")
        return missing();
      if (state.applying || state.settling)
        return {
          status: "error",
          code: "busy",
          message: "Plan Approval is being applied.",
          retryable: true,
        };
      return complete(
        {
          status: "discuss_further",
          reviewId: state.proposal.reviewId,
        },
        state.generation,
      );
    },
    dismiss(reason, generation) {
      if (!current(generation) || state.status !== "reviewing")
        return missing();
      if (state.applying || state.settling)
        return {
          status: "error",
          code: "busy",
          message: "Plan Approval is being applied.",
          retryable: true,
        };
      return complete(
        {
          status: "cancelled",
          reviewId: state.proposal.reviewId,
          reason,
        },
        state.generation,
      );
    },
    reset() {
      if (state.status !== "reviewing") return null;
      return complete(
        {
          status: "cancelled",
          reviewId: state.proposal.reviewId,
          reason: "reset",
        },
        state.generation,
      );
    },
    waitForSettlement(reviewId, signal) {
      return new Promise((resolve) => {
        const settled = settledResults.get(reviewId);
        if (settled) {
          resolve(settled);
          return;
        }
        const registrations = waiters.get(reviewId) ?? new Set();
        const waiter: {
          resolve: (result: ReviewTerminalResult) => void;
          removeAbort?: () => void;
        } = { resolve };
        registrations.add(waiter);
        waiters.set(reviewId, registrations);
        if (signal) {
          const abort = () => {
            if (
              state.status === "reviewing" &&
              state.proposal.reviewId === reviewId
            ) {
              void complete(
                {
                  status: "cancelled",
                  reviewId,
                  reason: "host_aborted",
                },
                state.generation,
              );
            }
          };
          signal.addEventListener("abort", abort, { once: true });
          waiter.removeAbort = () => signal.removeEventListener("abort", abort);
          if (signal.aborted) abort();
        }
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      if (state.status === "reviewing") {
        const generation = state.generation;
        if (state.delivery === "primary") {
          void complete(
            {
              status: "cancelled",
              reviewId: state.proposal.reviewId,
              reason: "teardown",
            },
            generation,
          );
        } else {
          application.deactivatePlanReview(state.proposal.reviewId);
          if (timeout) clearTimeout(timeout);
          timeout = null;
          removeActiveAbort?.();
          removeActiveAbort = null;
          state = { status: "idle" };
        }
      }
      disposed = true;
      if (timeout) clearTimeout(timeout);
      timeout = null;
      removeActiveAbort?.();
      removeActiveAbort = null;
      waiters.forEach((registrations) =>
        registrations.forEach((waiter) => waiter.removeAbort?.()),
      );
      listeners.clear();
    },
  };
}
