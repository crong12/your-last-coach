import type { WorkoutResult } from "../domain/types";

export interface WorkoutResultMetrics {
  distanceKm: number;
  durationSeconds: number | null;
  averagePaceSecondsPerKm: number | null;
  averagePaceBasis: "recorded" | "derived" | null;
  averageHeartRateBpm: number | null;
  trainingLoad: number | null;
}

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

export function projectWorkoutResultMetrics(
  result: WorkoutResult,
): WorkoutResultMetrics {
  const { summary } = result;
  const durationSeconds = finite(summary.durationSeconds)
    ? summary.durationSeconds
    : null;
  const recordedPace = finite(summary.averagePaceSecondsPerKm)
    ? summary.averagePaceSecondsPerKm
    : null;
  const derivedPace =
    durationSeconds !== null && summary.distanceKm > 0
      ? durationSeconds / summary.distanceKm
      : null;
  const averagePaceSecondsPerKm = recordedPace ?? derivedPace;

  return {
    distanceKm: summary.distanceKm,
    durationSeconds,
    averagePaceSecondsPerKm,
    averagePaceBasis:
      recordedPace !== null
        ? "recorded"
        : derivedPace !== null
          ? "derived"
          : null,
    averageHeartRateBpm: finite(summary.averageHeartRateBpm)
      ? summary.averageHeartRateBpm
      : null,
    trainingLoad: finite(summary.trainingLoad) ? summary.trainingLoad : null,
  };
}
