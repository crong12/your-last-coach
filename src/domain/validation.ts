import type { WorkspaceState } from "./types";

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

const isIsoDate = (value: unknown): value is string =>
  isNonEmptyString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);

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

function validateAthlete(value: unknown, errors: string[]) {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.displayName) ||
    !isPositiveNumber(value.recentHalfMarathonSeconds) ||
    !isPositiveNumber(value.thresholdPaceSecondsPerKm) ||
    !isRecord(value.normalWeeklyVolumeKm) ||
    !isPositiveNumber(value.normalWeeklyVolumeKm.min) ||
    !isPositiveNumber(value.normalWeeklyVolumeKm.max) ||
    Number(value.normalWeeklyVolumeKm.min) >=
      Number(value.normalWeeklyVolumeKm.max)
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

    if (
      !isIsoDate(workout.date) ||
      !workout.date.startsWith("2026-08-") ||
      !isNonEmptyString(workout.type) ||
      !WORKOUT_TYPES.has(workout.type) ||
      !isNonEmptyString(workout.title) ||
      !isNonEmptyString(workout.purpose) ||
      !isPositiveNumber(workout.distanceKm) ||
      !isRecord(workout.prescription) ||
      !Array.isArray(workout.prescription.blocks) ||
      workout.prescription.blocks.length === 0 ||
      workout.prescription.blocks.some((block) => !isValidWorkoutBlock(block))
    ) {
      errors.push(`Invalid Planned Workout: ${workout.id}`);
    }
  }
  return workoutIds;
}

function validateWorkoutResults(
  value: unknown,
  workoutIds: Set<string>,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push("Workout Results must be an array");
    return;
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
}

function validateAthleteFeedback(
  value: unknown,
  workoutIds: Set<string>,
  errors: string[],
) {
  if (!Array.isArray(value)) {
    errors.push("Athlete Feedback must be an array");
    return;
  }
  const feedbackIds = new Set<string>();
  for (const feedback of value) {
    if (
      !isRecord(feedback) ||
      !isNonEmptyString(feedback.id) ||
      feedbackIds.has(feedback.id) ||
      !isNonEmptyString(feedback.requestId) ||
      !isNonEmptyString(feedback.relatedWorkoutId) ||
      !workoutIds.has(feedback.relatedWorkoutId) ||
      !isNonEmptyString(feedback.rawText) ||
      !isTimestamp(feedback.recordedAt)
    ) {
      errors.push("Athlete Feedback entry is invalid");
      continue;
    }
    feedbackIds.add(feedback.id);
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
  validateWorkoutResults(value.workoutResults, workoutIds, errors);
  validateAthleteFeedback(value.athleteFeedback, workoutIds, errors);
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
  if (!Array.isArray(value.adaptationReceipts)) {
    errors.push("Adaptation receipts must be an array");
  }
  validateMutationHistory(value.mutationHistory, errors);

  return { valid: errors.length === 0, errors };
}

export function isWorkspaceState(value: unknown): value is WorkspaceState {
  return validateWorkspaceState(value).valid;
}
