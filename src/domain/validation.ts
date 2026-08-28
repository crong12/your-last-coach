import type { WorkspaceState } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function validateWorkspaceState(value: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: ["Workspace state must be an object"] };
  }
  if (value.seedVersion !== "demo-athlete-v1")
    errors.push("Unsupported seed version");
  if (
    !isRecord(value.clock) ||
    value.clock.now !== "2026-08-26T20:15:00+01:00"
  ) {
    errors.push("Demo clock does not match demo-athlete-v1");
  }
  if (
    !isRecord(value.athlete) ||
    typeof value.athlete.id !== "string" ||
    value.athlete.id.length === 0 ||
    typeof value.athlete.displayName !== "string" ||
    !isPositiveNumber(value.athlete.recentHalfMarathonSeconds) ||
    !isPositiveNumber(value.athlete.thresholdPaceSecondsPerKm) ||
    !isRecord(value.athlete.normalWeeklyVolumeKm) ||
    !isPositiveNumber(value.athlete.normalWeeklyVolumeKm.min) ||
    !isPositiveNumber(value.athlete.normalWeeklyVolumeKm.max) ||
    Number(value.athlete.normalWeeklyVolumeKm.min) >=
      Number(value.athlete.normalWeeklyVolumeKm.max)
  ) {
    errors.push("Athlete context is invalid");
  }
  if (
    !isRecord(value.targetRace) ||
    typeof value.targetRace.id !== "string" ||
    typeof value.targetRace.name !== "string" ||
    typeof value.targetRace.date !== "string" ||
    !isPositiveNumber(value.targetRace.distanceKm) ||
    !isPositiveNumber(value.targetRace.objectiveSeconds)
  ) {
    errors.push("Target Race is invalid");
  }
  if (
    !isRecord(value.trainingPhase) ||
    typeof value.trainingPhase.id !== "string" ||
    typeof value.trainingPhase.name !== "string"
  ) {
    errors.push("Training Phase is invalid");
  }
  if (
    !isRecord(value.observations) ||
    value.observations.adapter !== "synthetic-coros-shaped" ||
    value.observations.asOf !== "2026-08-26T20:15:00+01:00" ||
    typeof value.observations.provenance !== "string" ||
    !isRecord(value.observations.trainingLoad) ||
    !isPositiveNumber(value.observations.trainingLoad.shortTerm) ||
    !isPositiveNumber(value.observations.trainingLoad.longTerm) ||
    !isPositiveNumber(value.observations.trainingLoad.ratio) ||
    !isRecord(value.observations.recovery) ||
    !isPositiveNumber(value.observations.recovery.percent) ||
    !isRecord(value.observations.sleep) ||
    !isPositiveNumber(value.observations.sleep.durationMinutes) ||
    !isPositiveNumber(value.observations.sleep.score)
  ) {
    errors.push("Synthetic observation context is invalid");
  }
  if (
    !isRecord(value.trainingPlan) ||
    !Number.isInteger(value.trainingPlan.planVersion) ||
    Number(value.trainingPlan.planVersion) < 1
  ) {
    errors.push("Training Plan has an invalid planVersion");
  }
  const workouts = isRecord(value.trainingPlan)
    ? value.trainingPlan.plannedWorkouts
    : undefined;
  const workoutIds = new Set<string>();
  if (!Array.isArray(workouts) || workouts.length === 0) {
    errors.push("Training Plan must contain Planned Workouts");
  } else {
    for (const workout of workouts) {
      if (!isRecord(workout) || typeof workout.id !== "string") {
        errors.push("Every Planned Workout requires an identifier");
        continue;
      }
      if (workoutIds.has(workout.id))
        errors.push(`Duplicate Planned Workout: ${workout.id}`);
      workoutIds.add(workout.id);
      if (
        typeof workout.date !== "string" ||
        !workout.date.startsWith("2026-08-")
      ) {
        errors.push(`Planned Workout outside August: ${workout.id}`);
      }
      if (typeof workout.distanceKm !== "number" || workout.distanceKm <= 0) {
        errors.push(`Invalid distance for Planned Workout: ${workout.id}`);
      }
      if (
        typeof workout.title !== "string" ||
        typeof workout.purpose !== "string" ||
        !isRecord(workout.prescription) ||
        !Array.isArray(workout.prescription.blocks) ||
        workout.prescription.blocks.length === 0
      ) {
        errors.push(`Invalid prescription for Planned Workout: ${workout.id}`);
      }
    }
  }
  if (!Array.isArray(value.workoutResults)) {
    errors.push("Workout Results must be an array");
  } else {
    const resultIds = new Set<string>();
    for (const result of value.workoutResults) {
      if (!isRecord(result) || typeof result.id !== "string") {
        errors.push("Every Workout Result requires an identifier");
        continue;
      }
      if (resultIds.has(result.id))
        errors.push(`Duplicate Workout Result: ${result.id}`);
      resultIds.add(result.id);
      if (
        typeof result.plannedWorkoutId === "string" &&
        !workoutIds.has(result.plannedWorkoutId)
      ) {
        errors.push(
          `Workout Result references a missing Planned Workout: ${result.id}`,
        );
      }
      if (
        !isRecord(result.summary) ||
        !isPositiveNumber(result.summary.distanceKm)
      ) {
        errors.push(`Workout Result summary is invalid: ${result.id}`);
      }
      if (!Array.isArray(result.laps))
        errors.push(`Workout Result laps are invalid: ${result.id}`);
    }
  }
  if (!Array.isArray(value.athleteFeedback))
    errors.push("Athlete Feedback must be an array");
  if (!Array.isArray(value.mutationHistory))
    errors.push("Mutation history must be an array");

  return { valid: errors.length === 0, errors };
}

export function isWorkspaceState(value: unknown): value is WorkspaceState {
  return validateWorkspaceState(value).valid;
}
