import { DEMO_BACKFILLED_WORKOUT_RESULTS } from "./demoFixture";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function migrateDemoWorkspace(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.state)) return value;
  const existingWorkoutResults = value.state.workoutResults;
  const workoutResults = Array.isArray(existingWorkoutResults)
    ? [
        ...existingWorkoutResults.map((result: unknown) => {
          if (
            !isRecord(result) ||
            result.id !== "result-2026-08-26-threshold" ||
            !isRecord(result.summary)
          ) {
            return result;
          }
          const { trainingLoad: _trainingLoad, ...summaryWithoutTrainingLoad } =
            result.summary;
          return {
            ...result,
            laps: Array.isArray(result.laps)
              ? result.laps.map((lap) => {
                  if (!isRecord(lap) || typeof lap.id !== "string") return lap;
                  const metrics = {
                    "lap-threshold-warmup": {
                      paceSecondsPerKm: 375,
                      averageHeartRateBpm: 130,
                      maximumHeartRateBpm: 134,
                    },
                    "lap-threshold-rep-1": { maximumHeartRateBpm: 172 },
                    "lap-threshold-rep-2": { maximumHeartRateBpm: 178 },
                    "lap-threshold-rep-3": { maximumHeartRateBpm: 183 },
                    "lap-threshold-cooldown": {
                      paceSecondsPerKm: 390,
                      averageHeartRateBpm: 142,
                      maximumHeartRateBpm: 150,
                    },
                  }[lap.id];
                  if (!metrics) return lap;
                  return {
                    ...lap,
                    ...(lap.paceSecondsPerKm === undefined &&
                    "paceSecondsPerKm" in metrics
                      ? { paceSecondsPerKm: metrics.paceSecondsPerKm }
                      : {}),
                    ...(lap.averageHeartRateBpm === undefined &&
                    "averageHeartRateBpm" in metrics
                      ? { averageHeartRateBpm: metrics.averageHeartRateBpm }
                      : {}),
                    ...(lap.maximumHeartRateBpm === undefined
                      ? { maximumHeartRateBpm: metrics.maximumHeartRateBpm }
                      : {}),
                  };
                })
              : result.laps,
            summary: {
              ...summaryWithoutTrainingLoad,
              durationSeconds:
                result.summary.durationSeconds === undefined ||
                result.summary.durationSeconds === 2_700
                  ? 2_747
                  : result.summary.durationSeconds,
              averagePaceSecondsPerKm:
                result.summary.averagePaceSecondsPerKm === undefined ||
                result.summary.averagePaceSecondsPerKm === 360
                  ? 366
                  : result.summary.averagePaceSecondsPerKm,
              averageHeartRateBpm:
                result.summary.averageHeartRateBpm === undefined ||
                result.summary.averageHeartRateBpm === 158
                  ? 169
                  : result.summary.averageHeartRateBpm,
            },
          };
        }),
        ...DEMO_BACKFILLED_WORKOUT_RESULTS.filter(
          ({ id }) =>
            !existingWorkoutResults.some(
              (result: unknown) => isRecord(result) && result.id === id,
            ),
        ).map((result) => ({
          ...result,
          summary: { ...result.summary },
          source: { ...result.source },
          laps: [...result.laps],
        })),
      ]
    : existingWorkoutResults;
  return { ...value, state: { ...value.state, workoutResults } };
}
