import { describe, expect, it } from "vitest";

import { projectWorkoutResultMetrics } from "../src/application/workoutResultMetrics";
import type { WorkoutResult } from "../src/domain/types";

function result(summary: WorkoutResult["summary"]): WorkoutResult {
  return {
    id: "result:test",
    startedAt: "2026-08-26T17:30:00+01:00",
    status: "completed",
    summary,
    laps: [],
  };
}

describe("Workout Result metrics", () => {
  it("keeps recorded summary metrics as the shared source of truth", () => {
    expect(
      projectWorkoutResultMetrics(
        result({
          distanceKm: 7.5,
          durationSeconds: 2_747,
          averagePaceSecondsPerKm: 366,
          averageHeartRateBpm: 169,
          trainingLoad: 54,
        }),
      ),
    ).toEqual({
      distanceKm: 7.5,
      durationSeconds: 2_747,
      averagePaceSecondsPerKm: 366,
      averagePaceBasis: "recorded",
      averageHeartRateBpm: 169,
      trainingLoad: 54,
    });
  });

  it("derives pace only when recorded pace is unavailable", () => {
    expect(
      projectWorkoutResultMetrics(
        result({ distanceKm: 7.5, durationSeconds: 2_747 }),
      ),
    ).toMatchObject({
      averagePaceSecondsPerKm: 2_747 / 7.5,
      averagePaceBasis: "derived",
      averageHeartRateBpm: null,
      trainingLoad: null,
    });
  });

  it("keeps optional metrics unavailable when they cannot be derived", () => {
    expect(projectWorkoutResultMetrics(result({ distanceKm: 0 }))).toEqual({
      distanceKm: 0,
      durationSeconds: null,
      averagePaceSecondsPerKm: null,
      averagePaceBasis: null,
      averageHeartRateBpm: null,
      trainingLoad: null,
    });
  });
});
