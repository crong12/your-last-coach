import type { WorkspaceRepository } from "./ports";
import type {
  AdaptationRecord,
  Durability,
  PersistedReviewResult,
  ReviewOpenResult,
} from "./ports";
import type {
  CoachingContextSource,
  AppliedPlanAdaptation,
  AthleteFeedback,
  DeclinedPlanAdaptation,
  IsoDate,
  PendingAdaptationProposal,
  PlannedWorkout,
  WorkspaceState,
} from "../domain/types";
import {
  validateAdaptationOption,
  collectWorkspaceEvidenceRefs,
  validateReviewProposal,
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
  initialUndeliveredReviewResult?: PersistedReviewResult;
  reviewTimeoutMs?: number;
  now?: () => number;
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
      evidenceRef: string;
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
  openPlanReview(proposal: ReviewProposal): Promise<ReviewOpenResult>;
  getDurability(): Durability;
  persistPendingPlanReview(reviewId: string): Promise<Durability>;
  getPendingAdaptationProposal(): PendingAdaptationProposal | null;
  getAdaptationRecord(reviewId: string): AdaptationRecord;
  selectPlanReviewOption(reviewId: string, optionId: string): void;
  declinePlanReview(reviewId: string): Promise<
    | { status: "declined"; reviewId: string }
    | {
        status: "error";
        code: "not_found" | "busy";
        message: string;
        retryable: boolean;
      }
  >;
  activatePlanReview(proposal: ReviewProposal): void;
  deactivatePlanReview(reviewId: string): void;
  getPlanApproval(reviewId: string): PlanApprovalResult | null;
  hasUndeliveredReviewResult(): boolean;
  cancelPlanReview(
    result?: Exclude<PersistedReviewResult, { status: "approved" }>,
  ): Promise<void>;
  readReviewResult(
    reviewId: unknown,
  ): Promise<
    | ReviewResultDelivery
    | { status: "not_ready"; reviewId: string }
    | CommandError
  >;
  subscribe(listener: () => void): () => void;
}

type ReviewResultDelivery =
  PlanApprovalResult | Exclude<PersistedReviewResult, { status: "approved" }>;

function addDays(date: IsoDate, days: number): IsoDate {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10) as IsoDate;
}

export function createWorkspaceApplication(
  options: CreateWorkspaceApplicationOptions,
): WorkspaceApplication {
  let state = deepFreeze(structuredClone(options.initialState));
  const reviewTimeoutMs = options.reviewTimeoutMs ?? 300_000;
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  const approvalDurability = new Map<string, Durability>();
  let approvalInFlight: {
    reviewId: string;
    promise: Promise<PlanApprovalResult | PlanApprovalError>;
  } | null = null;
  let activePlanReview: {
    proposal: ReviewProposal;
    generation: number;
  } | null = null;
  let reviewGeneration = 0;
  let undeliveredReviewResult = options.initialUndeliveredReviewResult;
  let currentDurability: Durability =
    options.repository.durability ?? "persistent";
  let persistenceTail: Promise<void> = Promise.resolve();
  let pendingExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  const staleReviewIds = new Set<string>();

  const reviewOpenTimestamps = () => {
    const openedAtMs = now();
    const openedAt = new Date(openedAtMs).toISOString();
    const expiresAt = new Date(openedAtMs + reviewTimeoutMs).toISOString();
    return { openedAt, expiresAt };
  };

  const currentEvidenceRefs = (): Set<string> =>
    collectWorkspaceEvidenceRefs(state);

  const publishState = (nextState: WorkspaceState) => {
    state = deepFreeze(structuredClone(nextState));
    listeners.forEach((listener) => listener());
  };

  const markDurability = (durability: Durability) => {
    if (currentDurability === durability) return;
    currentDurability = durability;
    listeners.forEach((listener) => listener());
  };

  const clearPendingExpiryTimer = () => {
    if (pendingExpiryTimer) clearTimeout(pendingExpiryTimer);
    pendingExpiryTimer = null;
  };

  const persist = (
    persistedState: WorkspaceState,
    reviewResult = undeliveredReviewResult,
  ): Promise<Durability> => {
    let durability = currentDurability;
    const operation = persistenceTail.then(async () => {
      durability = await options.repository.save({
        schemaVersion: 2,
        seedVersion: "demo-athlete-v1",
        savedAt: persistedState.clock.now,
        state: persistedState,
        ...(reviewResult === undefined
          ? {}
          : { undeliveredReviewResult: reviewResult }),
      });
      markDurability(durability);
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
      const changes = structuredClone(change.changes);
      const after = { ...before, ...changes };
      // Coach targets describe one specific prescription. When an adaptation
      // rewrites the distance or prescription without supplying fresh
      // targets, drop the stale ones instead of letting them mislead.
      if (
        ("distanceKm" in changes || "prescription" in changes) &&
        !("targets" in changes)
      ) {
        delete after.targets;
      }
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

  const pendingFor = (reviewId: string) => {
    const pending = state.pendingAdaptationProposal;
    return pending?.proposal.reviewId === reviewId ? pending : null;
  };

  const schedulePendingExpiry = (pending: PendingAdaptationProposal) => {
    clearPendingExpiryTimer();
    const delay = Math.max(0, Date.parse(pending.expiresAt) - now());
    pendingExpiryTimer = setTimeout(() => {
      pendingExpiryTimer = null;
      if (
        state.pendingAdaptationProposal?.proposal.reviewId !==
        pending.proposal.reviewId
      )
        return;
      void cancelPlanReview({
        status: "cancelled",
        reviewId: pending.proposal.reviewId,
        reason: "timeout",
      });
    }, delay);
  };

  const reconcilePendingPlan = () => {
    const pending = state.pendingAdaptationProposal;
    if (
      pending === undefined ||
      pending.proposal.expectedPlanVersion === state.trainingPlan.planVersion
    )
      return pending ?? null;

    clearPendingExpiryTimer();
    const nextState = withoutPending(state);
    const staleResult: PersistedReviewResult = {
      status: "cancelled",
      reviewId: pending.proposal.reviewId,
      reason: "stale_plan_changed",
    };
    const persistedReviewResult = staleResult;
    staleReviewIds.add(pending.proposal.reviewId);
    undeliveredReviewResult = staleResult;
    publishState(nextState);
    void persist(nextState, persistedReviewResult).catch(() => undefined);
    return null;
  };

  const withoutPending = (value: WorkspaceState): WorkspaceState => {
    const { pendingAdaptationProposal: _pending, ...rest } = value;
    return rest;
  };

  const reviewProposalFor = (reviewId: string) => {
    const pending = pendingFor(reviewId);
    if (pending) return pending.proposal;
    if (activePlanReview?.proposal.reviewId === reviewId)
      return activePlanReview.proposal;
    return null;
  };

  const openPlanReview = async (
    proposal: ReviewProposal,
  ): Promise<ReviewOpenResult> => {
    if (undeliveredReviewResult !== undefined) {
      return {
        status: "error",
        code: "busy",
        message:
          "A completed Workout Adaptation decision is awaiting delivery.",
        retryable: true,
      };
    }
    const existingPending = reconcilePendingPlan();
    if (existingPending) {
      if (existingPending.proposal.reviewId === proposal.reviewId) {
        return { status: "review_opened", reviewId: proposal.reviewId };
      }
      return {
        status: "error",
        code: "busy",
        message: "Another Workout Adaptation review is already active.",
        retryable: true,
      };
    }
    if (
      state.adaptationReceipts.some(
        ({ reviewId }) => reviewId === proposal.reviewId,
      ) ||
      state.declinedAdaptations.some(
        ({ reviewId }) => reviewId === proposal.reviewId,
      ) ||
      staleReviewIds.has(proposal.reviewId)
    ) {
      return {
        status: "error",
        code: "busy",
        message:
          "This Workout Adaptation review already has a terminal decision.",
        retryable: false,
      };
    }
    const validated = validateReviewProposal(proposal, {
      planVersion: state.trainingPlan.planVersion,
      plannedWorkouts: state.trainingPlan.plannedWorkouts,
      evidenceRefs: currentEvidenceRefs(),
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
    const timestamps = reviewOpenTimestamps();
    const pending: PendingAdaptationProposal = {
      proposal: validated.proposal,
      ...timestamps,
      selectedOptionId: null,
    };
    publishState({ ...state, pendingAdaptationProposal: pending });
    schedulePendingExpiry(pending);
    let durability = currentDurability;
    try {
      durability = await persist(state);
    } catch {
      markDurability("memory_only");
      durability = "memory_only";
    }
    return {
      status: "review_opened",
      reviewId: validated.proposal.reviewId,
      ...(durability === "memory_only" ? { durability } : {}),
    };
  };

  const persistPendingPlanReview = async (reviewId: string) => {
    reconcilePendingPlan();
    const pending = pendingFor(reviewId);
    if (!pending) return options.repository.durability ?? "persistent";
    try {
      return await persist(state);
    } catch {
      markDurability("memory_only");
      return "memory_only";
    }
  };

  const getAdaptationRecord = (reviewId: string): AdaptationRecord => {
    if (typeof reviewId !== "string" || reviewId.trim() === "") {
      return { status: "unknown" };
    }
    reconcilePendingPlan();
    const pending = pendingFor(reviewId);
    if (pending) return { status: "pending", pending };
    const receipt = state.adaptationReceipts.find(
      (candidate) => candidate.reviewId === reviewId,
    );
    if (receipt) return { status: "approved", receipt };
    const decision = state.declinedAdaptations.find(
      (candidate) => candidate.reviewId === reviewId,
    );
    if (decision) return { status: "declined", decision };
    if (staleReviewIds.has(reviewId)) return { status: "stale", reviewId };
    return { status: "unknown" };
  };

  const selectPlanReviewOption = (reviewId: string, optionId: string) => {
    reconcilePendingPlan();
    const pending = pendingFor(reviewId);
    if (!pending) return;
    if (
      optionId !== pending.proposal.recommended.optionId &&
      optionId !== pending.proposal.alternative.optionId
    )
      return;
    publishState({
      ...state,
      pendingAdaptationProposal: {
        ...pending,
        selectedOptionId: optionId,
      },
    });
    void persistPendingPlanReview(reviewId);
  };

  const cancelPlanReview = async (
    result?: Exclude<PersistedReviewResult, { status: "approved" }>,
  ) => {
    const reviewId = result?.reviewId ?? activePlanReview?.proposal.reviewId;
    const proposal = reviewId ? reviewProposalFor(reviewId) : null;
    reviewGeneration += 1;
    activePlanReview = null;
    let nextState = state;
    if (
      reviewId &&
      state.pendingAdaptationProposal?.proposal.reviewId === reviewId
    ) {
      nextState = withoutPending(nextState);
    }
    if (result?.status === "declined" && proposal) {
      const decision: DeclinedPlanAdaptation = {
        status: "declined",
        reviewId: proposal.reviewId,
        selectedOption: state.pendingAdaptationProposal?.selectedOptionId
          ? (() => {
              const option = [proposal.recommended, proposal.alternative].find(
                ({ optionId }) =>
                  optionId ===
                  state.pendingAdaptationProposal?.selectedOptionId,
              );
              return option
                ? { optionId: option.optionId, label: option.label }
                : null;
            })()
          : null,
        recommendation: {
          label: proposal.recommended.label,
          summary: proposal.recommended.summary,
        },
        declinedAt: state.clock.now,
        planVersion: state.trainingPlan.planVersion,
        evidenceRefs: [...proposal.evidenceRefs],
      };
      nextState = {
        ...nextState,
        declinedAdaptations: [
          ...nextState.declinedAdaptations.filter(
            ({ reviewId: candidate }) => candidate !== reviewId,
          ),
          decision,
        ],
      };
    }
    const stateChanged = nextState !== state;
    if (result || stateChanged) {
      try {
        await persist(
          nextState,
          result === undefined ? undeliveredReviewResult : result,
        );
      } catch {
        // Keep the completed decision available in memory for this page.
        markDurability("memory_only");
      }
      if (result !== undefined) undeliveredReviewResult = result;
    }
    if (stateChanged) publishState(nextState);
    if (stateChanged) clearPendingExpiryTimer();
  };

  const declinePlanReview = async (reviewId: string) => {
    const proposal = reviewProposalFor(reviewId);
    if (!proposal) {
      return {
        status: "error" as const,
        code: "not_found" as const,
        message: "No matching Workout Adaptation review exists.",
        retryable: false,
      };
    }
    if (approvalInFlight) {
      return {
        status: "error" as const,
        code: "busy" as const,
        message: "Plan Approval is being applied.",
        retryable: true,
      };
    }
    await cancelPlanReview({ status: "declined", reviewId });
    return { status: "declined" as const, reviewId };
  };

  if (state.pendingAdaptationProposal) {
    schedulePendingExpiry(state.pendingAdaptationProposal);
  }

  return {
    getState() {
      return state;
    },
    query,
    openPlanReview,
    getDurability() {
      return currentDurability;
    },
    persistPendingPlanReview,
    getPendingAdaptationProposal() {
      return reconcilePendingPlan();
    },
    getAdaptationRecord,
    selectPlanReviewOption,
    declinePlanReview,
    activatePlanReview(proposal) {
      activePlanReview = {
        proposal,
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
    hasUndeliveredReviewResult() {
      return undeliveredReviewResult !== undefined;
    },
    cancelPlanReview,
    async readReviewResult(reviewId) {
      if (typeof reviewId !== "string" || reviewId.trim() === "") {
        return invalidFeedback("reviewId must be a non-empty string.");
      }
      const claimed = undeliveredReviewResult;
      if (!claimed || claimed.reviewId !== reviewId) {
        return { status: "not_ready", reviewId };
      }
      undeliveredReviewResult = undefined;
      try {
        const durability = await persist(state, undefined);
        return claimed.status === "approved"
          ? { ...claimed, durability }
          : claimed;
      } catch {
        markDurability("memory_only");
        undeliveredReviewResult = claimed;
        return {
          status: "error",
          code: "not_found",
          message: "The completed review decision could not be delivered.",
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
        if (
          state.declinedAdaptations.some(
            (decision) => decision.reviewId === reviewId,
          )
        ) {
          return {
            status: "error",
            code: "invalid_input",
            message: "This Workout Adaptation review was declined.",
            retryable: false,
          };
        }
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
        const pendingReview = pendingFor(reviewId);
        const reviewProposal =
          pendingReview?.proposal ?? activePlanReview?.proposal;
        if (
          !reviewProposal ||
          reviewProposal.expectedPlanVersion !== command.expectedPlanVersion ||
          (activePlanReview !== null &&
            activePlanReview.proposal.reviewId !== reviewId)
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
          reviewProposal.recommended,
          reviewProposal.alternative,
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
        const approvalGeneration =
          activePlanReview?.generation ?? reviewGeneration;
        const proposalEvidenceRefs = [...reviewProposal.evidenceRefs];
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
            ...withoutPending(state),
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
          clearPendingExpiryTimer();
          const persistedReviewResult: PersistedReviewResult = {
            status: "approved",
            ...receipt,
          };
          let durability: Durability = "persistent";
          try {
            durability = await persist(nextState, persistedReviewResult);
          } catch {
            markDurability("memory_only");
            durability = "memory_only";
          }
          if (
            reviewGeneration !== approvalGeneration ||
            (activePlanReview !== null &&
              activePlanReview.generation !== approvalGeneration)
          ) {
            return {
              status: "error" as const,
              code: "cancelled" as const,
              message: "Plan Approval was cancelled before publication.",
              retryable: false,
            };
          }
          state = nextState;
          undeliveredReviewResult = persistedReviewResult;
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
            evidenceRef: `athlete-feedback:${existing.id}`,
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
          markDurability("memory_only");
          durability = "memory_only";
        }
        return {
          status: "ok",
          feedback,
          evidenceRef: `athlete-feedback:${feedback.id}`,
          durability,
        };
      }
      reviewGeneration += 1;
      activePlanReview = null;
      clearPendingExpiryTimer();
      undeliveredReviewResult = undefined;
      let durability: Durability = "persistent";
      try {
        await clearPersisted();
      } catch {
        markDurability("memory_only");
        durability = "memory_only";
      }
      state = await options.fixtureSource.loadContext();
      durability =
        options.repository.durability ?? currentDurability ?? durability;
      listeners.forEach((listener) => listener());
      return { status: "reset", durability };
    }) as WorkspaceApplication["command"],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
