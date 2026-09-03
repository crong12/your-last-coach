import {
  createDemoWorkspaceState,
  DEMO_BACKFILLED_WORKOUT_RESULTS,
} from "./demoFixture";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const RELEASED_FIVE_BY_ONE_PRESCRIPTION = {
  blocks: [
    { kind: "warmup", distanceKm: 2 },
    {
      kind: "repeat",
      repetitions: 5,
      workDistanceKm: 1,
      targetPaceSecondsPerKm: { min: 275, max: 280 },
      recoverySeconds: 90,
    },
    { kind: "cooldown", distanceKm: 1.5 },
  ],
};

const LEGACY_AUGUST13_REFERENCES = new Map([
  ["planned-2026-08-13-easy", "planned-2026-08-13-threshold"],
  ["result-2026-08-13", "result-2026-08-13-threshold"],
  [
    "planned-workout:planned-2026-08-13-easy",
    "planned-workout:planned-2026-08-13-threshold",
  ],
  [
    "workout-result:result-2026-08-13",
    "workout-result:result-2026-08-13-threshold",
  ],
]);

function rewriteLegacyAugust13References(value: unknown): unknown {
  if (typeof value === "string") {
    return LEGACY_AUGUST13_REFERENCES.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map(rewriteLegacyAugust13References);
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      rewriteLegacyAugust13References(entry),
    ]),
  );
}

function hasReleasedFiveByOneShape(
  workout: Record<string, unknown>,
  id: string,
): boolean {
  const expectedDate =
    id === "planned-2026-08-13-threshold" ? "2026-08-13" : "2026-08-26";
  return (
    workout.id === id &&
    workout.date === expectedDate &&
    workout.type === "threshold" &&
    workout.title === "5 × 1 km threshold" &&
    workout.purpose === "Develop threshold pace under control" &&
    workout.distanceKm === 13 &&
    JSON.stringify(workout.prescription) ===
      JSON.stringify(RELEASED_FIVE_BY_ONE_PRESCRIPTION)
  );
}

function hasLegacyAugust6Shape(workout: Record<string, unknown>): boolean {
  return (
    workout.id === "planned-2026-08-06-threshold" &&
    workout.date === "2026-08-06" &&
    workout.type === "threshold" &&
    workout.title === "Threshold intervals" &&
    workout.purpose === "Develop sustainable speed" &&
    workout.distanceKm === 11 &&
    JSON.stringify(workout.prescription) ===
      JSON.stringify(RELEASED_FIVE_BY_ONE_PRESCRIPTION)
  );
}

function hasLegacyAugust13PlanShape(workout: Record<string, unknown>): boolean {
  return (
    workout.id === "planned-2026-08-13-easy" &&
    workout.date === "2026-08-13" &&
    workout.type === "easy" &&
    workout.title === "8 km easy" &&
    workout.purpose === "Comfortable aerobic running" &&
    workout.distanceKm === 8 &&
    JSON.stringify(workout.prescription) ===
      JSON.stringify({ blocks: [{ kind: "easy", distanceKm: 8 }] })
  );
}

function hasLegacyAugust13ResultShape(
  result: Record<string, unknown>,
): boolean {
  return (
    result.id === "result-2026-08-13" &&
    result.plannedWorkoutId === "planned-2026-08-13-easy" &&
    result.startedAt === "2026-08-13T07:00:00+01:00" &&
    result.status === "completed" &&
    isRecord(result.summary) &&
    result.summary.distanceKm === 8 &&
    result.summary.durationSeconds === 2_800 &&
    result.summary.trainingLoad === 34 &&
    result.summary.averagePaceSecondsPerKm === 350 &&
    result.summary.averageHeartRateBpm === 138 &&
    result.summary.activityKind === "outdoor_run" &&
    Array.isArray(result.laps) &&
    result.laps.length === 0
  );
}

function hasReleasedAugust13ResultShape(
  result: Record<string, unknown>,
): boolean {
  return (
    result.id === "result-2026-08-13-threshold" &&
    isRecord(result.summary) &&
    result.summary.distanceKm === 13 &&
    result.summary.durationSeconds === 3_900 &&
    result.summary.averagePaceSecondsPerKm === 300 &&
    Array.isArray(result.laps) &&
    !result.laps.some((lap) => isRecord(lap) && lap.kind === "recovery")
  );
}

export function migrateDemoWorkspace(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.state)) return value;
  const currentFixture = createDemoWorkspaceState();
  const canonicalAugust6Plan = currentFixture.trainingPlan.plannedWorkouts.find(
    ({ id }) => id === "planned-2026-08-06-threshold",
  );
  const canonicalAugust13Plan =
    currentFixture.trainingPlan.plannedWorkouts.find(
      ({ id }) => id === "planned-2026-08-13-threshold",
    );
  const canonicalAugust26Plan =
    currentFixture.trainingPlan.plannedWorkouts.find(
      ({ id }) => id === "planned-2026-08-26-threshold",
    );
  const canonicalAugust13Result = currentFixture.workoutResults.find(
    ({ id }) => id === "result-2026-08-13-threshold",
  );
  const existingTrainingPlan = value.state.trainingPlan;
  const existingPlannedWorkouts = isRecord(existingTrainingPlan)
    ? existingTrainingPlan.plannedWorkouts
    : undefined;
  const migrateLegacyAugust13 =
    Array.isArray(existingPlannedWorkouts) &&
    existingPlannedWorkouts.some(
      (workout) => isRecord(workout) && hasLegacyAugust13PlanShape(workout),
    );
  const plannedWorkouts = Array.isArray(existingPlannedWorkouts)
    ? existingPlannedWorkouts.map((workout: unknown) => {
        if (!isRecord(workout)) return workout;
        if (hasLegacyAugust6Shape(workout) && canonicalAugust6Plan) {
          return structuredClone(canonicalAugust6Plan);
        }
        if (
          (hasLegacyAugust13PlanShape(workout) ||
            hasReleasedFiveByOneShape(
              workout,
              "planned-2026-08-13-threshold",
            )) &&
          canonicalAugust13Plan
        ) {
          return structuredClone(canonicalAugust13Plan);
        }
        if (
          hasReleasedFiveByOneShape(workout, "planned-2026-08-26-threshold") &&
          canonicalAugust26Plan
        ) {
          return structuredClone(canonicalAugust26Plan);
        }
        return workout;
      })
    : existingPlannedWorkouts;
  const existingWorkoutResults = value.state.workoutResults;
  const workoutResults = Array.isArray(existingWorkoutResults)
    ? [
        ...existingWorkoutResults.map((result: unknown) => {
          if (
            isRecord(result) &&
            ((migrateLegacyAugust13 && hasLegacyAugust13ResultShape(result)) ||
              hasReleasedAugust13ResultShape(result)) &&
            canonicalAugust13Result
          ) {
            return structuredClone(canonicalAugust13Result);
          }
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
  const migrated = {
    ...value,
    state: {
      ...value.state,
      ...(isRecord(existingTrainingPlan)
        ? {
            trainingPlan: {
              ...existingTrainingPlan,
              plannedWorkouts,
            },
          }
        : {}),
      workoutResults,
    },
  };
  return migrateLegacyAugust13
    ? rewriteLegacyAugust13References(migrated)
    : migrated;
}
