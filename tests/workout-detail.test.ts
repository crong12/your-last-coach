import { describe, expect, it } from "vitest";

import { selectWorkoutContext } from "../src/application/readSelectors";
import { createDemoWorkspaceState } from "../src/demo/demoFixture";
import {
  createHeartRatePath,
  createHeartRateScale,
  createLapXScale,
  createPaceScale,
  getLapCoverage,
  paceBarHeight,
  summarizeLaps,
  type ResultDetailLap,
} from "../src/ui/charts/resultDetailMath";

describe("Workout Result detail context", () => {
  it("seeds a provenance-labelled completed result with recorded laps without replacing the partial threshold result", () => {
    const state = createDemoWorkspaceState();
    const completed = state.workoutResults.find(
      (result) => result.status === "completed" && result.laps.length > 0,
    );
    const partial = state.workoutResults.find(
      (result) => result.id === "result-2026-08-26-threshold",
    );

    expect(completed).toMatchObject({
      status: "completed",
      provenance: "seeded synthetic COROS-shaped Workout Result",
      laps: expect.arrayContaining([
        expect.objectContaining({ distanceKm: 2, paceSecondsPerKm: 360 }),
        expect.objectContaining({ distanceKm: 2, paceSecondsPerKm: 286 }),
      ]),
    });
    expect(partial).toMatchObject({
      status: "partial",
      summary: {
        distanceKm: 7,
        completedWorkRepetitions: 3,
        plannedWorkRepetitions: 5,
      },
    });
    expect(
      state.workoutResults.filter((result) => result.status === "completed"),
    ).toHaveLength(15);
  });

  it("returns result-backed context with same-type previous attempts newest first and excludes the current result", () => {
    const state = createDemoWorkspaceState();
    const current = state.workoutResults.find(
      (result) => result.id === "result-2026-08-26-threshold",
    );
    expect(current?.plannedWorkoutId).toBeDefined();

    const plannedId = current!.plannedWorkoutId!;
    const context = selectWorkoutContext(state, { workoutId: plannedId });

    expect(context.status).toBe("ok");
    if (context.status !== "ok") throw new Error("Expected workout context");
    expect(context.data.workoutResult?.id).toBe(current!.id);
    expect(context.data.previousAttempts).toEqual([
      expect.objectContaining({
        matchBasis: "planned_workout_type",
        plannedWorkout: expect.objectContaining({
          id: "planned-2026-08-13-threshold",
        }),
        workoutResult: expect.objectContaining({
          id: "result-2026-08-13-threshold",
          status: "completed",
        }),
      }),
      expect.objectContaining({
        matchBasis: "planned_workout_type",
        workoutResult: expect.objectContaining({
          id: "result-2026-08-06-threshold",
          status: "completed",
        }),
      }),
    ]);
    expect(
      context.data.previousAttempts.some(
        ({ workoutResult }) => workoutResult.id === current!.id,
      ),
    ).toBe(false);
    expect(context.evidenceRefs).toEqual(
      expect.arrayContaining([
        "planned-workout:planned-2026-08-26-threshold",
        "workout-result:result-2026-08-26-threshold",
        "planned-workout:planned-2026-08-13-threshold",
        "workout-result:result-2026-08-13-threshold",
        "planned-workout:planned-2026-08-06-threshold",
        "workout-result:result-2026-08-06-threshold",
      ]),
    );
  });

  it("does not present a future same-type result as a previous attempt", () => {
    const context = selectWorkoutContext(createDemoWorkspaceState(), {
      workoutId: "planned-2026-08-06-threshold",
    });

    expect(context.status).toBe("ok");
    if (context.status !== "ok") throw new Error("Expected workout context");
    expect(context.data.workoutResult?.id).toBe("result-2026-08-06-threshold");
    expect(context.data.previousAttempts).toEqual([]);
    expect(context.evidenceRefs).not.toContain(
      "workout-result:result-2026-08-26-threshold",
    );
  });

  it("presents same-type previous attempts for an upcoming planned workout without a result", () => {
    const context = selectWorkoutContext(createDemoWorkspaceState(), {
      workoutId: "planned-2026-08-30-long",
    });

    expect(context.status).toBe("ok");
    if (context.status !== "ok") throw new Error("Expected workout context");
    expect(context.data.workoutResult).toBeNull();
    expect(
      context.data.previousAttempts.map(
        ({ workoutResult }) => workoutResult.plannedWorkoutId,
      ),
    ).toEqual([
      "planned-2026-08-23-long",
      "planned-2026-08-16-long",
      "planned-2026-08-09-long",
      "planned-2026-08-02-long",
    ]);
  });

  it("derives planned repetitions from the prescription even when result summary metadata disagrees", () => {
    const state = structuredClone(createDemoWorkspaceState());
    const result = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-26-threshold",
    )!;
    result.summary.plannedWorkRepetitions = 2;

    const context = selectWorkoutContext(state, {
      workoutId: "planned-2026-08-26-threshold",
    });

    expect(context.status).toBe("ok");
    if (context.status !== "ok") throw new Error("Expected workout context");
    const repeat = context.data.plannedWorkout.prescription.blocks.find(
      (block) => block.kind === "repeat",
    );
    expect(repeat).toMatchObject({ repetitions: 5 });
    expect(context.data.workoutResult?.summary.plannedWorkRepetitions).toBe(2);
  });

  it("keeps a completed empty-lap result available as an honest degraded result", () => {
    const state = createDemoWorkspaceState();
    const result = selectWorkoutContext(state, {
      workoutId: "planned-2026-08-11-easy",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected workout context");
    expect(result.data.workoutResult).toMatchObject({
      id: "result-2026-08-11",
      status: "completed",
      laps: [],
    });
  });

  it("keeps a stopped result in the result-backed context with its authoritative status", () => {
    const state = structuredClone(createDemoWorkspaceState());
    const result = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-26-threshold",
    )!;
    result.status = "stopped";

    const context = selectWorkoutContext(state, {
      workoutId: "planned-2026-08-26-threshold",
    });

    expect(context.status).toBe("ok");
    if (context.status !== "ok") throw new Error("Expected workout context");
    expect(context.data.workoutResult).toMatchObject({
      id: "result-2026-08-26-threshold",
      status: "stopped",
    });
  });
});

describe("Workout Result lap chart math", () => {
  const laps: ResultDetailLap[] = [
    {
      id: "lap-1",
      label: "Lap 1",
      distanceKm: 1,
      paceSecondsPerKm: 300,
      averageHeartRateBpm: 150,
      maximumHeartRateBpm: null,
    },
    {
      id: "lap-2",
      label: "Lap 2",
      distanceKm: 1,
      paceSecondsPerKm: null,
      averageHeartRateBpm: null,
      maximumHeartRateBpm: null,
    },
    {
      id: "lap-3",
      label: "Lap 3",
      distanceKm: 1,
      paceSecondsPerKm: 270,
      averageHeartRateBpm: 165,
      maximumHeartRateBpm: null,
    },
    {
      id: "lap-4",
      label: "Lap 4",
      distanceKm: 1,
      paceSecondsPerKm: 330,
      averageHeartRateBpm: null,
      maximumHeartRateBpm: null,
    },
  ];

  it("makes faster recorded pace taller while ignoring missing pace in the scale domain", () => {
    const scale = createPaceScale(laps, [28, 190]);
    const xScale = createLapXScale(laps.length, [24, 336]);

    expect(scale.domain()[0]).toBeLessThan(270);
    expect(scale.domain()[1]).toBeGreaterThan(330);
    expect(paceBarHeight(270, scale, 190)).toBeGreaterThan(
      paceBarHeight(330, scale, 190),
    );
    expect(xScale(0)).toBe(24);
    expect(xScale(3)).toBe(336);
  });

  it("breaks the HR path across missing lap measurements and reports coverage", () => {
    const xScale = createLapXScale(laps.length, [24, 336]);
    const hrScale = createHeartRateScale(laps, [190, 28]);
    const path = createHeartRatePath(laps, xScale, hrScale);

    expect((path.match(/M/g) ?? []).length).toBe(2);
    expect(getLapCoverage(laps)).toEqual({
      pace: { observed: 3, expected: 4 },
      heartRate: { observed: 2, expected: 4 },
      maximumHeartRate: { observed: 0, expected: 4 },
    });
  });

  it("summarizes only recorded pace and heart-rate observations", () => {
    expect(summarizeLaps(laps)).toBe(
      "4 laps, 3 of 4 with pace, fastest 4:30/km, slowest 5:30/km, 2 of 4 with average heart rate from 150–165 bpm.",
    );
  });
});
