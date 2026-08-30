import type { WorkspaceRepository } from "./ports";
import type { Durability } from "./ports";
import type { PersistedFallbackResult } from "./ports";
import type {
  CoachingContextSource,
  AppliedPlanAdaptation,
  AthleteFeedback,
  IsoDate,
  PlannedWorkout,
  WorkspaceState,
} from "../domain/types";
import {
  validateAdaptationOption,
  type AdaptationOption,
  type ReviewProposal,
} from "../domain/review";
import { validateWorkspaceState } from "../domain/validation";
import { deepFreeze } from "../domain/immutable";
import {
  selectAthleteContext,
  selectTrainingPlan,
  selectWorkoutContext,
  type AthleteContextData,
  type ReadResult,
  type ReadSuccess,
  type TrainingPlanData,
  type WorkoutContextData,
} from "./readSelectors";

interface CreateWorkspaceApplicationOptions {
  initialState: WorkspaceState;
  fixtureSource: CoachingContextSource;
  repository: WorkspaceRepository;
  initialUndeliveredFallbackResult?: PersistedFallbackResult;
}

type CalendarQuery =
  | { type: "get_week_training_plan"; weekStart: IsoDate }
  | { type: "get_month_training_plan"; month: `${number}-${number}` };

type TrainingPlanQueryResult = {
  planVersion: number;
  plannedWorkouts: PlannedWorkout[];
};

type WorkspaceCommand =
  | { type: "reset_demo" }
  | {
      type: "record_athlete_feedback";
      requestId: unknown;
      relatedWorkoutId: unknown;
      rawText: unknown;
      reported?: unknown;
    }
  | {
      type: "apply_plan_approval";
      reviewId: unknown;
      expectedPlanVersion: unknown;
      selectedOption: unknown;
    };

type CommandError = {
  status: "error";
  code: "invalid_input" | "not_found";
  message: string;
  retryable: false;
};

type PlanApprovalError = {
  status: "error";
  code: "invalid_input" | "stale_plan" | "busy" | "cancelled";
  message: string;
  retryable: boolean;
  issues?: unknown[];
};

export type PlanApprovalResult = AppliedPlanAdaptation & {
  status: "approved";
  durability: Durability;
};

type RecordFeedbackResult =
  | {
      status: "ok";
      feedback: AthleteFeedback;
      durability: Durability;
    }
  | CommandError;

export interface WorkspaceApplication {
  getState(): WorkspaceState;
  query(query: CalendarQuery): TrainingPlanQueryResult;
  query(query: {
    type: "get_athlete_context";
  }): ReadSuccess<AthleteContextData>;
  query(query: {
    type: "get_training_plan";
    from: unknown;
    to: unknown;
  }): ReadResult<TrainingPlanData>;
  query(query: {
    type: "get_workout_context";
    workoutId: unknown;
  }): ReadResult<WorkoutContextData>;
  command(command: { type: "reset_demo" }): Promise<{
    status: "reset";
    durability: Durability;
  }>;
  command(
    command: Extract<WorkspaceCommand, { type: "record_athlete_feedback" }>,
  ): Promise<RecordFeedbackResult>;
  command(
    command: Extract<WorkspaceCommand, { type: "apply_plan_approval" }>,
  ): Promise<PlanApprovalResult | PlanApprovalError>;
  activatePlanReview(
    proposal: ReviewProposal,
    delivery?: "primary" | "fallback",
  ): void;
  deactivatePlanReview(reviewId: string): void;
  getPlanApproval(reviewId: string): PlanApprovalResult | null;
  hasUndeliveredFallbackResult(): boolean;
  cancelPlanReview(
    result?: Exclude<PersistedFallbackResult, { status: "approved" }>,
  ): Promise<void>;
  readFallbackResult(
    reviewId: unknown,
  ): Promise<
    | ReviewFallbackDelivery
    | { status: "not_ready"; reviewId: string }
    | CommandError
  >;
  subscribe(listener: () => void): () => void;
}

type ReviewFallbackDelivery =
  PlanApprovalResult | Exclude<PersistedFallbackResult, { status: "approved" }>;

function addDays(date: IsoDate, days: number): IsoDate {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10) as IsoDate;
}

export function createWorkspaceApplication(
  options: CreateWorkspaceApplicationOptions,
): WorkspaceApplication {
  let state = deepFreeze(structuredClone(options.initialState));
  const listeners = new Set<() => void>();
  const approvalDurability = new Map<string, Durability>();
  let approvalInFlight: {
    reviewId: string;
    promise: Promise<PlanApprovalResult | PlanApprovalError>;
  } | null = null;
  let activePlanReview: {
    proposal: ReviewProposal;
    delivery: "primary" | "fallback";
    generation: number;
  } | null = null;
  let reviewGeneration = 0;
  let undeliveredFallbackResult = options.initialUndeliveredFallbackResult;
  let persistenceTail: Promise<void> = Promise.resolve();

  const persist = (
    persistedState: WorkspaceState,
    fallbackResult = undeliveredFallbackResult,
  ): Promise<Durability> => {
    let durability: Durability = "persistent";
    const operation = persistenceTail.then(async () => {
      durability = await options.repository.save({
        schemaVersion: 1,
        seedVersion: "demo-athlete-v1",
        savedAt: persistedState.clock.now,
        state: persistedState,
        ...(fallbackResult === undefined
          ? {}
          : { undeliveredFallbackResult: fallbackResult }),
      });
    });
    persistenceTail = operation.catch(() => undefined);
    return operation.then(() => durability);
  };

  const clearPersisted = (): Promise<void> => {
    const operation = persistenceTail.then(() => options.repository.clear());
    persistenceTail = operation.catch(() => undefined);
    return operation;
  };

  const replay = (receipt: AppliedPlanAdaptation): PlanApprovalResult => ({
    status: "approved",
    ...receipt,
    durability:
      approvalDurability.get(receipt.reviewId) ??
      options.repository.durability ??
      "persistent",
  });

  const applyOption = (
    plannedWorkouts: PlannedWorkout[],
    option: AdaptationOption,
  ): {
    plannedWorkouts: PlannedWorkout[];
    affectedWorkouts: AppliedPlanAdaptation["affectedWorkouts"];
  } => {
    const next = new Map(
      plannedWorkouts.map((workout) => [workout.id, structuredClone(workout)]),
    );
    const affectedWorkouts: AppliedPlanAdaptation["affectedWorkouts"] = [];
    for (const change of option.workoutChanges) {
      if (change.kind === "create") {
        const after = structuredClone(change.workout);
        next.set(after.id, after);
        affectedWorkouts.push({ workoutId: after.id, before: null, after });
        continue;
      }
      const before = structuredClone(next.get(change.workoutId)!);
      if (change.kind === "delete") {
        next.delete(change.workoutId);
        affectedWorkouts.push({
          workoutId: change.workoutId,
          before,
          after: null,
        });
        continue;
      }
      const after = { ...before, ...structuredClone(change.changes) };
      next.set(change.workoutId, after);
      affectedWorkouts.push({ workoutId: change.workoutId, before, after });
    }
    return { plannedWorkouts: [...next.values()], affectedWorkouts };
  };

  const invalidFeedback = (message: string): CommandError => ({
    status: "error",
    code: "invalid_input",
    message,
    retryable: false,
  });

  const normalizeReported = (
    value: unknown,
  ): {
    value?: NonNullable<AthleteFeedback["reported"]>;
    error?: CommandError;
  } => {
    if (value === undefined) return {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        error: invalidFeedback("reported must be an object when provided."),
      };
    }
    const reported = value as Record<string, unknown>;
    const accepted = ["sessionRpe", "legFeel", "painReported", "stoppedReason"];
    if (Object.keys(reported).some((key) => !accepted.includes(key))) {
      return {
        error: invalidFeedback("reported contains an unsupported field."),
      };
    }
    const normalized: NonNullable<AthleteFeedback["reported"]> = {};
    if (reported.sessionRpe !== undefined) {
      if (
        typeof reported.sessionRpe !== "number" ||
        !Number.isFinite(reported.sessionRpe) ||
        reported.sessionRpe < 0 ||
        reported.sessionRpe > 10
      ) {
        return {
          error: invalidFeedback(
            "reported.sessionRpe must be a finite number from 0 through 10.",
          ),
        };
      }
      normalized.sessionRpe = reported.sessionRpe;
    }
    for (const field of ["legFeel", "stoppedReason"] as const) {
      if (reported[field] !== undefined) {
        if (
          typeof reported[field] !== "string" ||
          reported[field].trim() === ""
        ) {
          return {
            error: invalidFeedback(
              `reported.${field} must be a non-empty string when provided.`,
            ),
          };
        }
        normalized[field] = reported[field].trim();
      }
    }
    if (reported.painReported !== undefined) {
      if (typeof reported.painReported !== "boolean") {
        return {
          error: invalidFeedback(
            "reported.painReported must be a boolean when provided.",
          ),
        };
      }
      normalized.painReported = reported.painReported;
    }
    return { value: normalized };
  };

  const query = ((
    query:
      | CalendarQuery
      | {
          type: "get_athlete_context";
        }
      | {
          type: "get_training_plan";
          from: unknown;
          to: unknown;
        }
      | {
          type: "get_workout_context";
          workoutId: unknown;
        },
  ) => {
    if (query.type === "get_athlete_context") {
      return selectAthleteContext(state);
    }
    if (query.type === "get_training_plan") {
      return selectTrainingPlan(state, query);
    }
    if (query.type === "get_workout_context") {
      return selectWorkoutContext(state, query);
    }

    const plannedWorkouts = state.trainingPlan.plannedWorkouts;
    if (query.type === "get_week_training_plan") {
      const weekEnd = addDays(query.weekStart, 6);
      return {
        planVersion: state.trainingPlan.planVersion,
        plannedWorkouts: plannedWorkouts.filter(
          ({ date }) => date >= query.weekStart && date <= weekEnd,
        ),
      };
    }
    return {
      planVersion: state.trainingPlan.planVersion,
      plannedWorkouts: plannedWorkouts.filter(({ date }) =>
        date.startsWith(`${query.month}-`),
      ),
    };
  }) as WorkspaceApplication["query"];

  return {
    getState() {
      return state;
    },
    query,
    activatePlanReview(proposal, delivery = "primary") {
      activePlanReview = {
        proposal,
        delivery,
        generation: ++reviewGeneration,
      };
    },
    deactivatePlanReview(reviewId) {
      if (activePlanReview?.proposal.reviewId === reviewId)
        activePlanReview = null;
    },
    getPlanApproval(reviewId) {
      const receipt = state.adaptationReceipts.find(
        (candidate) => candidate.reviewId === reviewId,
      );
      return receipt ? replay(receipt) : null;
    },
    hasUndeliveredFallbackResult() {
      return undeliveredFallbackResult !== undefined;
    },
    async cancelPlanReview(result) {
      const restoreAfterApproval = approvalInFlight !== null;
      reviewGeneration += 1;
      activePlanReview = null;
      if (result) {
        try {
          await persist(state, result);
        } catch {
          // Keep the completed decision available in memory for this page.
        }
        undeliveredFallbackResult = result;
      } else if (restoreAfterApproval) {
        try {
          await persist(state);
        } catch {
          // BrowserWorkspaceRepository already retains the authoritative page
          // state in memory when durable storage is unavailable.
        }
      }
    },
    async readFallbackResult(reviewId) {
      if (typeof reviewId !== "string" || reviewId.trim() === "") {
        return invalidFeedback("reviewId must be a non-empty string.");
      }
      const claimed = undeliveredFallbackResult;
      if (!claimed || claimed.reviewId !== reviewId) {
        return { status: "not_ready", reviewId };
      }
      undeliveredFallbackResult = undefined;
      try {
        const durability = await persist(state, undefined);
        return claimed.status === "approved"
          ? { ...claimed, durability }
          : claimed;
      } catch {
        undeliveredFallbackResult = claimed;
        return {
          status: "error",
          code: "not_found",
          message: "The completed fallback decision could not be delivered.",
          retryable: false,
        };
      }
    },
    command: (async (command: WorkspaceCommand) => {
      if (command.type === "apply_plan_approval") {
        const reviewId =
          typeof command.reviewId === "string" ? command.reviewId : "";
        const existing = state.adaptationReceipts.find(
          (receipt) => receipt.reviewId === reviewId,
        );
        if (existing) return replay(existing);
        if (approvalInFlight) {
          if (approvalInFlight.reviewId === reviewId)
            return approvalInFlight.promise;
          return {
            status: "error",
            code: "busy",
            message: "Another Plan Approval is being applied.",
            retryable: true,
          };
        }
        if (reviewId.trim() === "") {
          return {
            status: "error",
            code: "invalid_input",
            message: "reviewId must be a non-empty string.",
            retryable: false,
          };
        }
        if (
          !Number.isInteger(command.expectedPlanVersion) ||
          command.expectedPlanVersion !== state.trainingPlan.planVersion
        ) {
          return {
            status: "error",
            code: "stale_plan",
            message: `Expected current planVersion ${state.trainingPlan.planVersion}.`,
            retryable: true,
          };
        }
        if (
          !activePlanReview ||
          activePlanReview.proposal.reviewId !== reviewId ||
          activePlanReview.proposal.expectedPlanVersion !==
            command.expectedPlanVersion
        ) {
          return {
            status: "error",
            code: "invalid_input",
            message: "No matching active Workout Adaptation review exists.",
            retryable: false,
          };
        }
        const validated = validateAdaptationOption(
          command.selectedOption,
          state.trainingPlan.plannedWorkouts,
        );
        if (!validated.valid) {
          return {
            status: "error",
            code: "invalid_input",
            message: "The selected Workout Adaptation is invalid.",
            retryable: false,
            issues: validated.issues,
          };
        }
        const activeOption = [
          activePlanReview.proposal.recommended,
          activePlanReview.proposal.alternative,
        ].find(({ optionId }) => optionId === validated.option.optionId);
        if (
          !activeOption ||
          JSON.stringify(activeOption) !== JSON.stringify(validated.option)
        ) {
          return {
            status: "error",
            code: "invalid_input",
            message: "The selected option does not match the active review.",
            retryable: false,
          };
        }
        const approvalGeneration = activePlanReview.generation;
        const proposalEvidenceRefs = [
          ...activePlanReview.proposal.evidenceRefs,
        ];
        const promise = (async () => {
          const { plannedWorkouts, affectedWorkouts } = applyOption(
            state.trainingPlan.plannedWorkouts,
            validated.option,
          );
          const receipt: AppliedPlanAdaptation = {
            reviewId,
            selectedOption: {
              optionId: validated.option.optionId,
              label: validated.option.label,
            },
            affectedWorkouts,
            appliedAt: state.clock.now,
            planVersionBefore: state.trainingPlan.planVersion,
            planVersionAfter: state.trainingPlan.planVersion + 1,
            evidenceRefs: proposalEvidenceRefs,
          };
          const nextState = deepFreeze({
            ...state,
            trainingPlan: {
              planVersion: receipt.planVersionAfter,
              buildStartDate: state.trainingPlan.buildStartDate,
              plannedWorkouts,
            },
            appliedReviewIds: [...state.appliedReviewIds, reviewId],
            adaptationReceipts: [...state.adaptationReceipts, receipt],
            mutationHistory: [
              ...state.mutationHistory,
              {
                id: `plan-adaptation:${reviewId}`,
                kind: "plan_adaptation" as const,
                occurredAt: state.clock.now,
              },
            ],
          });
          const nextValidation = validateWorkspaceState(nextState);
          if (!nextValidation.valid) {
            return {
              status: "error" as const,
              code: "invalid_input" as const,
              message:
                "The selected Workout Adaptation would create an invalid Training Plan.",
              retryable: false,
              issues: nextValidation.errors,
            };
          }
          const persistedFallbackResult: PersistedFallbackResult | undefined =
            activePlanReview?.delivery === "fallback"
              ? { status: "approved", ...receipt }
              : undeliveredFallbackResult;
          let durability: Durability = "persistent";
          try {
            durability = await persist(nextState, persistedFallbackResult);
          } catch {
            durability = "memory_only";
          }
          if (
            reviewGeneration !== approvalGeneration ||
            activePlanReview?.generation !== approvalGeneration
          ) {
            return {
              status: "error" as const,
              code: "cancelled" as const,
              message: "Plan Approval was cancelled before publication.",
              retryable: false,
            };
          }
          state = nextState;
          undeliveredFallbackResult = persistedFallbackResult;
          activePlanReview = null;
          approvalDurability.set(reviewId, durability);
          listeners.forEach((listener) => listener());
          return { status: "approved" as const, ...receipt, durability };
        })();
        approvalInFlight = { reviewId, promise };
        try {
          return await promise;
        } finally {
          if (approvalInFlight?.promise === promise) approvalInFlight = null;
        }
      }
      if (command.type === "record_athlete_feedback") {
        if (approvalInFlight) await approvalInFlight.promise;
        if (
          typeof command.requestId !== "string" ||
          command.requestId.trim() === ""
        ) {
          return invalidFeedback("requestId must be a non-empty string.");
        }
        const existing = state.athleteFeedback.find(
          ({ requestId }) => requestId === command.requestId,
        );
        if (existing) {
          return {
            status: "ok",
            feedback: existing,
            durability: options.repository.durability ?? "persistent",
          };
        }
        if (
          typeof command.relatedWorkoutId !== "string" ||
          command.relatedWorkoutId.trim() === ""
        ) {
          return invalidFeedback(
            "relatedWorkoutId must be a non-empty Planned Workout ID.",
          );
        }
        if (
          !state.trainingPlan.plannedWorkouts.some(
            ({ id }) => id === command.relatedWorkoutId,
          )
        ) {
          return {
            status: "error",
            code: "not_found",
            message: `No Planned Workout was found for relatedWorkoutId ${command.relatedWorkoutId}.`,
            retryable: false,
          };
        }
        if (
          typeof command.rawText !== "string" ||
          command.rawText.trim() === ""
        ) {
          return invalidFeedback("rawText must be a non-empty string.");
        }
        const normalized = normalizeReported(command.reported);
        if (normalized.error) return normalized.error;

        const relatedWorkoutResultId = state.workoutResults.find(
          ({ plannedWorkoutId }) =>
            plannedWorkoutId === command.relatedWorkoutId,
        )?.id;
        const feedback: AthleteFeedback = {
          id: `athlete-feedback:${command.requestId}`,
          requestId: command.requestId,
          relatedWorkoutId: command.relatedWorkoutId,
          ...(relatedWorkoutResultId ? { relatedWorkoutResultId } : {}),
          rawText: command.rawText,
          ...(command.reported === undefined
            ? {}
            : { reported: normalized.value ?? {} }),
          recordedAt: state.clock.now,
        };
        state = deepFreeze({
          ...state,
          athleteFeedback: [...state.athleteFeedback, feedback],
          processedRequestIds: [
            ...state.processedRequestIds,
            command.requestId,
          ],
        });
        listeners.forEach((listener) => listener());
        let durability: Durability = "persistent";
        try {
          durability = await persist(state);
        } catch {
          durability = "memory_only";
        }
        return { status: "ok", feedback, durability };
      }
      reviewGeneration += 1;
      activePlanReview = null;
      undeliveredFallbackResult = undefined;
      let durability: Durability = "persistent";
      try {
        await clearPersisted();
      } catch {
        durability = "memory_only";
      }
      durability = options.repository.durability ?? durability;
      state = await options.fixtureSource.loadContext();
      listeners.forEach((listener) => listener());
      return { status: "reset", durability };
    }) as WorkspaceApplication["command"],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
