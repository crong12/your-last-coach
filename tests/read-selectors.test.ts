import { describe, expect, it } from "vitest";

import {
  selectAthleteContext,
  selectTrainingPlan,
  selectWorkoutContext,
} from "../src/application/readSelectors";
import { createDemoWorkspaceState } from "../src/demo/demoFixture";

describe("shared coaching read selectors", () => {
  it("returns the Athlete, goal, phase, recent training, and mixed health evidence", () => {
    const result = selectAthleteContext(createDemoWorkspaceState());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected Athlete context");
    expect(result.contractVersion).toBe("1.1");
    expect(result.fixtureVersion).toBe("demo-athlete-v1");
    expect(result.data.asOf).toBe("2026-08-26T20:15:00+01:00");
    expect(result.data.athlete).toMatchObject({
      id: "athlete-sam",
      displayName: "Sam",
      profile: {
        normalWeeklyVolumeKm: { value: { min: 42, max: 48 } },
        recentHalfMarathonSeconds: { value: 6_120 },
        thresholdPaceSecondsPerKm: { value: 278 },
        preferredLongRunDay: { value: "Sunday" },
        maximumWeekdayTrainingDurationMinutes: { value: 60 },
      },
    });
    expect(result.data.targetRace).toMatchObject({
      id: "race-brighton-marathon-2027",
      name: "Brighton Marathon",
      date: "2027-04-04",
      objectiveSeconds: 13_200,
    });
    expect(result.data.trainingPhase).toEqual({
      id: "phase-aerobic-development",
      name: "Aerobic development",
    });
    expect(result.data.recentTraining).toHaveLength(10);
    expect(result.data.recentTraining.at(-1)).toMatchObject({
      id: "result-2026-08-26-threshold",
      plannedWorkoutId: "planned-2026-08-26-threshold",
      status: "partial",
      summary: { completedWorkRepetitions: 3, plannedWorkRepetitions: 5 },
    });
    expect(result.data.observations).toMatchObject({
      adapter: "synthetic-coros-shaped",
      trainingLoad: { shortTerm: 68, longTerm: 51, ratio: 1.33 },
      recovery: { percent: 46, classification: "partially_recovered" },
      sleep: { durationMinutes: 442, score: 81 },
      sleepHrvMs: { value: 55, syntheticNormalRange: [49, 63] },
      restingHeartRateBpm: 52,
      dailyStress: "unremarkable",
    });
    expect(result.data.sources).toEqual({
      athlete: "athlete_owned",
      targetRace: "app_owned",
      trainingPhase: "app_owned",
      recentTraining: "synthetic_observation",
      observations: "synthetic_observation",
    });
    expect(result.evidenceRefs).toEqual(
      expect.arrayContaining([
        "athlete:athlete-sam",
        "target-race:race-brighton-marathon-2027",
        "training-phase:phase-aerobic-development",
        "observation:training-load",
        "observation:recovery",
        "observation:sleep",
        "observation:sleep-hrv",
        "observation:resting-heart-rate",
        "observation:daily-stress",
        "workout-result:result-2026-08-26-threshold",
      ]),
    );
  });

  it("returns an inclusive date range with the current plan version and stable IDs", () => {
    const result = selectTrainingPlan(createDemoWorkspaceState(), {
      from: "2026-08-24",
      to: "2026-08-30",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected Training Plan");
    expect(result.data).toMatchObject({
      planVersion: 1,
      range: { from: "2026-08-24", to: "2026-08-30" },
    });
    expect(result.data.plannedWorkouts.map(({ id }) => id)).toEqual([
      "planned-2026-08-24-recovery",
      "planned-2026-08-26-threshold",
      "planned-2026-08-27-recovery",
      "planned-2026-08-29-strides",
      "planned-2026-08-30-long",
    ]);
    expect(result.evidenceRefs).toEqual([
      "training-plan:version:1",
      "planned-workout:planned-2026-08-24-recovery",
      "planned-workout:planned-2026-08-26-threshold",
      "planned-workout:planned-2026-08-27-recovery",
      "planned-workout:planned-2026-08-29-strides",
      "planned-workout:planned-2026-08-30-long",
    ]);
  });

  it.each([
    [{ from: "2026-08", to: "2026-08-30" }, "from"],
    [{ from: "2026-02-30", to: "2026-08-30" }, "from"],
    [{ from: "2026-08-24", to: null }, "to"],
    [{ from: "2026-08-30", to: "2026-08-24" }, "on or before"],
  ])("rejects an invalid Training Plan range %#", (input, message) => {
    const result = selectTrainingPlan(createDemoWorkspaceState(), input);

    expect(result).toMatchObject({
      status: "error",
      code: "invalid_input",
      retryable: false,
    });
    if (result.status !== "error") throw new Error("Expected invalid input");
    expect(result.message).toContain(message);
  });

  it("returns planned intent, the partial result, laps, and related feedback separately", () => {
    const state = structuredClone(createDemoWorkspaceState());
    state.athleteFeedback.push({
      id: "feedback-threshold",
      requestId: "request-threshold",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "My legs felt heavy and I stopped after three reps.",
      recordedAt: "2026-08-26T20:16:00+01:00",
    });

    const result = selectWorkoutContext(state, {
      workoutId: "planned-2026-08-26-threshold",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected workout context");
    expect(result.data.plannedWorkout).toMatchObject({
      id: "planned-2026-08-26-threshold",
      title: "5 × 1 km threshold",
      prescription: {
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
      },
    });
    expect(result.data.workoutResult).toMatchObject({
      id: "result-2026-08-26-threshold",
      status: "partial",
      summary: {
        distanceKm: 7.5,
        completedWorkRepetitions: 3,
        plannedWorkRepetitions: 5,
      },
    });
    expect(
      result.data.workoutResult?.laps.filter(({ kind }) => kind === "work"),
    ).toEqual([
      {
        id: "lap-threshold-rep-1",
        kind: "work",
        distanceKm: 1,
        paceSecondsPerKm: 276,
        averageHeartRateBpm: 165,
      },
      {
        id: "lap-threshold-rep-2",
        kind: "work",
        distanceKm: 1,
        paceSecondsPerKm: 279,
        averageHeartRateBpm: 171,
      },
      {
        id: "lap-threshold-rep-3",
        kind: "work",
        distanceKm: 1,
        paceSecondsPerKm: 288,
        averageHeartRateBpm: 176,
      },
    ]);
    expect(result.data.athleteFeedback).toHaveLength(1);
    expect(result.data.sources).toEqual({
      plannedWorkout: "app_owned",
      workoutResult: "synthetic_observation",
      athleteFeedback: "athlete_owned",
    });
    expect(result.evidenceRefs).toEqual([
      "planned-workout:planned-2026-08-26-threshold",
      "workout-result:result-2026-08-26-threshold",
      "athlete-feedback:feedback-threshold",
    ]);
  });

  it.each([null, "", "missing-workout"])(
    "returns a safe workout error for %j",
    (workoutId) => {
      const result = selectWorkoutContext(createDemoWorkspaceState(), {
        workoutId,
      });

      expect(result).toMatchObject({
        status: "error",
        code: workoutId === "missing-workout" ? "not_found" : "invalid_input",
        retryable: false,
      });
    },
  );

  it("keeps an absent Workout Result distinct from synthetic evidence", () => {
    const result = selectWorkoutContext(createDemoWorkspaceState(), {
      workoutId: "planned-2026-08-30-long",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected workout context");
    expect(result.data.workoutResult).toBeNull();
    expect(result.data.sources.workoutResult).toBeNull();
    expect(result.evidenceRefs).toEqual([
      "planned-workout:planned-2026-08-30-long",
    ]);
  });
});
