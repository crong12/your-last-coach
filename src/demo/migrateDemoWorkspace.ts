function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function migrateDemoWorkspace(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.state)) return value;
  const workoutResults = Array.isArray(value.state.workoutResults)
    ? value.state.workoutResults.map((result) => {
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
      })
    : value.state.workoutResults;
  return { ...value, state: { ...value.state, workoutResults } };
}
