import type { PlannedWorkout, WorkspaceState } from "./types";

const WORKOUT_TYPES = new Set([
  "easy",
  "recovery",
  "long_run",
  "threshold",
  "steady",
]);
const SIMPLE_BLOCK_KINDS = new Set(["warmup", "cooldown", "easy"]);
const LAP_KINDS = new Set(["warmup", "work", "recovery", "cooldown"]);
const RESULT_STATUSES = new Set(["completed", "partial", "stopped"]);
const MUTATION_KINDS = new Set(["reset", "plan_adaptation"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;

const isTimestamp = (value: unknown): value is string =>
  isNonEmptyString(value) && Number.isFinite(Date.parse(value));

const isIsoTimestamp = (value: unknown): value is string =>
  isTimestamp(value) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  );

const isIsoDate = (value: unknown): value is string => {
  if (!isNonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

function validateUniqueStrings(
  value: unknown,
  field: string,
  errors: string[],
) {
  if (
    !Array.isArray(value) ||
    value.some((item) => !isNonEmptyString(item)) ||
    new Set(value).size !== value.length
  ) {
    errors.push(`${field} must contain unique non-empty strings`);
  }
}

function isValidWorkoutBlock(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) return false;
  if (SIMPLE_BLOCK_KINDS.has(value.kind)) {
    return isPositiveNumber(value.distanceKm);
  }
  if (value.kind !== "repeat") return false;
  if (
    !isPositiveInteger(value.repetitions) ||
    !isPositiveNumber(value.workDistanceKm) ||
    !isNonNegativeNumber(value.recoverySeconds) ||
    !isRecord(value.targetPaceSecondsPerKm) ||
    !isPositiveNumber(value.targetPaceSecondsPerKm.min) ||
    !isPositiveNumber(value.targetPaceSecondsPerKm.max)
  ) {
    return false;
  }
  return (
    Number(value.targetPaceSecondsPerKm.min) <=
    Number(value.targetPaceSecondsPerKm.max)
  );
}

function isValidPlannedWorkout(value: unknown): value is PlannedWorkout {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isIsoDate(value.date) &&
    value.date.startsWith("2026-08-") &&
    isNonEmptyString(value.type) &&
    WORKOUT_TYPES.has(value.type) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.purpose) &&
    isPositiveNumber(value.distanceKm) &&
    isRecord(value.prescription) &&
    Array.isArray(value.prescription.blocks) &&
    value.prescription.blocks.length > 0 &&
    value.prescription.blocks.every(isValidWorkoutBlock)
  );
}

function isValidProfileValue(
  value: unknown,
  valueValidator: (value: unknown) => boolean,
): boolean {
  return (
    isRecord(value) &&
    value.provenance === "seeded_athlete_profile" &&
    (value.effectiveAt === undefined || isIsoTimestamp(value.effectiveAt)) &&
    valueValidator(value.value)
  );
}

function isValidWeeklyVolume(value: unknown): boolean {
  return (
    isRecord(value) &&
    isPositiveNumber(value.min) &&
    isPositiveNumber(value.max) &&
    Number(value.min) < Number(value.max)
  );
}

function validateAthlete(value: unknown, errors: string[]) {
  const profile = isRecord(value) ? value.profile : undefined;
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.displayName) ||
    !isRecord(profile) ||
    !isValidProfileValue(profile.normalWeeklyVolumeKm, isValidWeeklyVolume) ||
    !isValidProfileValue(profile.recentHalfMarathonSeconds, isPositiveNumber) ||
    !isValidProfileValue(profile.thresholdPaceSecondsPerKm, isPositiveNumber) ||
    !isValidProfileValue(
      profile.preferredLongRunDay,
      (profileValue) => profileValue === "Sunday",
    ) ||
    !isValidProfileValue(
      profile.maximumWeekdayTrainingDurationMinutes,
      isPositiveInteger,
    )
  ) {
    errors.push("Athlete context is invalid");
  }
}

function validateTargetRace(value: unknown, errors: string[]) {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isIsoDate(value.date) ||
    !isPositiveNumber(value.distanceKm) ||
    !isPositiveNumber(value.objectiveSeconds)
  ) {
    errors.push("Target Race is invalid");
  }
}

function validateObservations(value: unknown, errors: string[]) {
  if (!isRecord(value)) {
    errors.push("Synthetic observation context is invalid");
    return;
  }

  const trainingLoad = value.trainingLoad;
  const recovery = value.recovery;
  const sleep = value.sleep;
  const hrv = value.sleepHrvMs;
  const valid =
    value.adapter === "synthetic-coros-shaped" &&
    isTimestamp(value.asOf) &&
    isNonEmptyString(value.provenance) &&
    isRecord(trainingLoad) &&
    isPositiveNumber(trainingLoad.shortTerm) &&
    isPositiveNumber(trainingLoad.longTerm) &&
    isPositiveNumber(trainingLoad.ratio) &&
    isRecord(recovery) &&
    isNonNegativeNumber(recovery.percent) &&
    Number(recovery.percent) <= 100 &&
    recovery.classification === "partially_recovered" &&
    isRecord(sleep) &&
    isPositiveNumber(sleep.durationMinutes) &&
    isNonNegativeNumber(sleep.score) &&
    Number(sleep.score) <= 100 &&
    isRecord(hrv) &&
    isPositiveNumber(hrv.value) &&
    Array.isArray(hrv.syntheticNormalRange) &&
    hrv.syntheticNormalRange.length === 2 &&
    isPositiveNumber(hrv.syntheticNormalRange[0]) &&
    isPositiveNumber(hrv.syntheticNormalRange[1]) &&
    hrv.syntheticNormalRange[0] <= hrv.syntheticNormalRange[1] &&
    isPositiveNumber(value.restingHeartRateBpm) &&
    value.dailyStress === "unremarkable";

  if (!valid) errors.push("Synthetic observation context is invalid");
}

function validateTrainingPlan(value: unknown, errors: string[]): Set<string> {
  const workoutIds = new Set<string>();
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.planVersion) ||
    !Array.isArray(value.plannedWorkouts) ||
    value.plannedWorkouts.length === 0
  ) {
    errors.push("Training Plan is invalid");
    return workoutIds;
  }

  for (const workout of value.plannedWorkouts) {
    if (!isRecord(workout) || !isNonEmptyString(workout.id)) {
      errors.push("Every Planned Workout requires an identifier");
      continue;
    }
    if (workoutIds.has(workout.id)) {
      errors.push(`Duplicate Planned Workout: ${workout.id}`);
    }
    workoutIds.add(workout.id);

    if (!isValidPlannedWorkout(workout)) {
      errors.push(`Invalid Planned Workout: ${workout.id}`);
    }
  }
  return workoutIds;
}

function validateWorkoutResults(
  value: unknown,
  workoutIds: Set<string>,
  errors: string[],
): Map<string, string | undefined> {
  const resultToPlannedWorkoutId = new Map<string, string | undefined>();
  if (!Array.isArray(value)) {
    errors.push("Workout Results must be an array");
    return resultToPlannedWorkoutId;
  }

  const resultIds = new Set<string>();
  for (const result of value) {
    if (!isRecord(result) || !isNonEmptyString(result.id)) {
      errors.push("Every Workout Result requires an identifier");
      continue;
    }
    if (resultIds.has(result.id)) {
      errors.push(`Duplicate Workout Result: ${result.id}`);
    }
    resultIds.add(result.id);
    resultToPlannedWorkoutId.set(
      result.id,
      isNonEmptyString(result.plannedWorkoutId)
        ? result.plannedWorkoutId
        : undefined,
    );

    const summary = result.summary;
    const validSummary =
      isRecord(summary) &&
      isPositiveNumber(summary.distanceKm) &&
      (summary.durationSeconds === undefined ||
        isPositiveNumber(summary.durationSeconds)) &&
      (summary.completedWorkRepetitions === undefined ||
        isNonNegativeNumber(summary.completedWorkRepetitions)) &&
      (summary.plannedWorkRepetitions === undefined ||
        isPositiveInteger(summary.plannedWorkRepetitions)) &&
      (summary.completedWorkRepetitions === undefined ||
        summary.plannedWorkRepetitions === undefined ||
        summary.completedWorkRepetitions <= summary.plannedWorkRepetitions);

    if (
      (result.plannedWorkoutId !== undefined &&
        (!isNonEmptyString(result.plannedWorkoutId) ||
          !workoutIds.has(result.plannedWorkoutId))) ||
      !isTimestamp(result.startedAt) ||
      !isNonEmptyString(result.status) ||
      !RESULT_STATUSES.has(result.status) ||
      !validSummary ||
      !Array.isArray(result.laps)
    ) {
      errors.push(`Invalid Workout Result: ${result.id}`);
      continue;
    }

    const lapIds = new Set<string>();
    for (const lap of result.laps) {
      if (
        !isRecord(lap) ||
        !isNonEmptyString(lap.id) ||
        lapIds.has(lap.id) ||
        !isNonEmptyString(lap.kind) ||
        !LAP_KINDS.has(lap.kind) ||
        !isPositiveNumber(lap.distanceKm) ||
        (lap.paceSecondsPerKm !== undefined &&
          !isPositiveNumber(lap.paceSecondsPerKm)) ||
        (lap.averageHeartRateBpm !== undefined &&
          !isPositiveNumber(lap.averageHeartRateBpm))
      ) {
        errors.push(`Invalid lap in Workout Result: ${result.id}`);
        break;
      }
      lapIds.add(lap.id);
    }
  }
  return resultToPlannedWorkoutId;
}

function validateAthleteFeedback(
  value: unknown,
  workoutIds: Set<string>,
  resultToPlannedWorkoutId: Map<string, string | undefined>,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push("Athlete Feedback must be an array");
    return;
  }
  const feedbackIds = new Set<string>();
  const requestIds = new Set<string>();
  for (const [index, feedback] of value.entries()) {
    const path = `athleteFeedback[${index}]`;
    const reported = isRecord(feedback) ? feedback.reported : undefined;
    const validReported =
      reported === undefined ||
      (isRecord(reported) &&
        Object.keys(reported).every((key) =>
          ["sessionRpe", "legFeel", "painReported", "stoppedReason"].includes(
            key,
          ),
        ) &&
        (reported.sessionRpe === undefined ||
          (typeof reported.sessionRpe === "number" &&
            Number.isFinite(reported.sessionRpe) &&
            reported.sessionRpe >= 0 &&
            reported.sessionRpe <= 10)) &&
        (reported.legFeel === undefined ||
          isNonEmptyString(reported.legFeel)) &&
        (reported.painReported === undefined ||
          typeof reported.painReported === "boolean") &&
        (reported.stoppedReason === undefined ||
          isNonEmptyString(reported.stoppedReason)));
    const hasWorkoutResultReference =
      isRecord(feedback) && feedback.relatedWorkoutResultId !== undefined;
    const validWorkoutResultReference =
      !hasWorkoutResultReference ||
      (isNonEmptyString(feedback.relatedWorkoutResultId) &&
        resultToPlannedWorkoutId.get(feedback.relatedWorkoutResultId) ===
          feedback.relatedWorkoutId);
    if (hasWorkoutResultReference && !validWorkoutResultReference) {
      errors.push(
        `${path}.relatedWorkoutResultId must reference a Workout Result for relatedWorkoutId.`,
      );
    }
    if (
      !isRecord(feedback) ||
      !isNonEmptyString(feedback.id) ||
      feedbackIds.has(feedback.id) ||
      !isNonEmptyString(feedback.requestId) ||
      requestIds.has(feedback.requestId) ||
      !isNonEmptyString(feedback.relatedWorkoutId) ||
      !workoutIds.has(feedback.relatedWorkoutId) ||
      (feedback.relatedWorkoutResultId !== undefined &&
        !isNonEmptyString(feedback.relatedWorkoutResultId)) ||
      !isNonEmptyString(feedback.rawText) ||
      !validReported ||
      !isTimestamp(feedback.recordedAt) ||
      !validWorkoutResultReference
    ) {
      errors.push("Athlete Feedback entry is invalid");
      continue;
    }
    feedbackIds.add(feedback.id);
    requestIds.add(feedback.requestId);
  }
}

function validateCoachingTopics(
  value: unknown,
  evidenceRefs: Set<string>,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push("Coaching Topics must be an array");
    return;
  }

  const topicIds = new Set<string>();
  for (const [index, topic] of value.entries()) {
    const path = `coachingTopics[${index}]`;
    const firstReportedAt = isRecord(topic) ? topic.firstReportedAt : undefined;
    const latestReportedAt = isRecord(topic)
      ? topic.latestReportedAt
      : undefined;
    const topicEvidenceRefs = isRecord(topic) ? topic.evidenceRefs : undefined;
    const validTimestamps =
      isIsoTimestamp(firstReportedAt) &&
      isIsoTimestamp(latestReportedAt) &&
      Date.parse(firstReportedAt) <= Date.parse(latestReportedAt);
    const validEvidenceRefs =
      Array.isArray(topicEvidenceRefs) &&
      topicEvidenceRefs.every(
        (ref) => isNonEmptyString(ref) && evidenceRefs.has(ref),
      ) &&
      new Set(topicEvidenceRefs).size === topicEvidenceRefs.length;
    if (
      !isRecord(topic) ||
      !isNonEmptyString(topic.id) ||
      topicIds.has(topic.id) ||
      !isNonEmptyString(topic.title) ||
      topic.status !== "monitoring" ||
      !isNonEmptyString(topic.athleteReport) ||
      !validTimestamps ||
      !validEvidenceRefs ||
      !isNonEmptyString(topic.followUpCondition)
    ) {
      errors.push(`${path} is invalid`);
      continue;
    }
    topicIds.add(topic.id);
  }
}

function validateMutationHistory(value: unknown, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push("Mutation history must be an array");
    return;
  }
  const mutationIds = new Set<string>();
  for (const mutation of value) {
    if (
      !isRecord(mutation) ||
      !isNonEmptyString(mutation.id) ||
      mutationIds.has(mutation.id) ||
      !isNonEmptyString(mutation.kind) ||
      !MUTATION_KINDS.has(mutation.kind) ||
      !isTimestamp(mutation.occurredAt)
    ) {
      errors.push("Mutation history entry is invalid");
      continue;
    }
    mutationIds.add(mutation.id);
  }
}

function validateAdaptationReceipts(
  value: unknown,
  currentPlanVersion: unknown,
  errors: string[],
): Set<string> {
  const reviewIds = new Set<string>();
  if (!Array.isArray(value)) {
    errors.push("Adaptation receipts must be an array");
    return reviewIds;
  }
  for (const receipt of value) {
    if (!isRecord(receipt)) {
      errors.push("Applied Plan Adaptation is invalid");
      continue;
    }
    const selected = receipt.selectedOption;
    const affected = receipt.affectedWorkouts;
    const validAffected =
      Array.isArray(affected) &&
      affected.length > 0 &&
      affected.every((item) => {
        if (!isRecord(item) || !isNonEmptyString(item.workoutId)) return false;
        const before = item.before;
        const after = item.after;
        const validBefore =
          before === null ||
          (isValidPlannedWorkout(before) && before.id === item.workoutId);
        const validAfter =
          after === null ||
          (isValidPlannedWorkout(after) && after.id === item.workoutId);
        return (
          validBefore && validAfter && !(before === null && after === null)
        );
      });
    if (
      !isNonEmptyString(receipt.reviewId) ||
      reviewIds.has(receipt.reviewId) ||
      !isRecord(selected) ||
      !isNonEmptyString(selected.optionId) ||
      !isNonEmptyString(selected.label) ||
      !validAffected ||
      !isTimestamp(receipt.appliedAt) ||
      !isPositiveInteger(receipt.planVersionBefore) ||
      !isPositiveInteger(receipt.planVersionAfter) ||
      receipt.planVersionAfter !== receipt.planVersionBefore + 1 ||
      !isPositiveInteger(currentPlanVersion) ||
      receipt.planVersionAfter > currentPlanVersion
    ) {
      errors.push("Applied Plan Adaptation is invalid");
      continue;
    }
    reviewIds.add(receipt.reviewId);
  }
  return reviewIds;
}

export function validateWorkspaceState(value: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ["Workspace state must be an object"] };
  }

  if (value.seedVersion !== "demo-athlete-v1") {
    errors.push("Unsupported seed version");
  }
  if (
    !isRecord(value.clock) ||
    value.clock.now !== "2026-08-26T20:15:00+01:00" ||
    value.clock.timeZone !== "Europe/London"
  ) {
    errors.push("Demo clock does not match demo-athlete-v1");
  }

  validateAthlete(value.athlete, errors);
  validateTargetRace(value.targetRace, errors);
  if (
    !isRecord(value.trainingPhase) ||
    !isNonEmptyString(value.trainingPhase.id) ||
    !isNonEmptyString(value.trainingPhase.name)
  ) {
    errors.push("Training Phase is invalid");
  }
  validateObservations(value.observations, errors);
  const workoutIds = validateTrainingPlan(value.trainingPlan, errors);
  const resultToPlannedWorkoutId = validateWorkoutResults(
    value.workoutResults,
    workoutIds,
    errors,
  );
  validateAthleteFeedback(
    value.athleteFeedback,
    workoutIds,
    resultToPlannedWorkoutId,
    errors,
  );
  const topicEvidenceRefs = new Set<string>(
    [...resultToPlannedWorkoutId.keys()].map(
      (resultId) => `workout-result:${resultId}`,
    ),
  );
  if (Array.isArray(value.athleteFeedback)) {
    for (const feedback of value.athleteFeedback) {
      if (isRecord(feedback) && isNonEmptyString(feedback.id)) {
        topicEvidenceRefs.add(`athlete-feedback:${feedback.id}`);
      }
    }
  }
  validateCoachingTopics(value.coachingTopics, topicEvidenceRefs, errors);
  validateUniqueStrings(
    value.processedRequestIds,
    "Processed request identifiers",
    errors,
  );
  validateUniqueStrings(
    value.appliedReviewIds,
    "Applied review identifiers",
    errors,
  );
  const receiptReviewIds = validateAdaptationReceipts(
    value.adaptationReceipts,
    isRecord(value.trainingPlan) ? value.trainingPlan.planVersion : undefined,
    errors,
  );
  const appliedReviewIds = Array.isArray(value.appliedReviewIds)
    ? new Set(value.appliedReviewIds.filter(isNonEmptyString))
    : new Set<string>();
  if (
    appliedReviewIds.size !== receiptReviewIds.size ||
    [...appliedReviewIds].some((reviewId) => !receiptReviewIds.has(reviewId))
  ) {
    errors.push("Applied review identifiers must match adaptation receipts");
  }
  validateMutationHistory(value.mutationHistory, errors);

  return { valid: errors.length === 0, errors };
}

export function isWorkspaceState(value: unknown): value is WorkspaceState {
  return validateWorkspaceState(value).valid;
}
