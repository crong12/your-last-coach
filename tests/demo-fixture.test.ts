import { describe, expect, it } from "vitest";

import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import { validateWorkspaceState } from "../src/domain/validation";

describe("demo-athlete-v1", () => {
  it("loads the accepted fixed Athlete, race, phase, and mixed recovery context", async () => {
    const state = await createDemoCoachingContextSource().loadContext();

    expect(state.seedVersion).toBe("demo-athlete-v1");
    expect(state.clock).toEqual({
      now: "2026-08-26T20:15:00+01:00",
      timeZone: "Europe/London",
    });
    expect(state.athlete).toMatchObject({
      id: "athlete-sam",
      displayName: "Sam",
      profile: {
        normalWeeklyVolumeKm: {
          value: { min: 42, max: 48 },
          provenance: "seeded_athlete_profile",
        },
        recentHalfMarathonSeconds: {
          value: 6_120,
          provenance: "seeded_athlete_profile",
        },
        thresholdPaceSecondsPerKm: {
          value: 278,
          provenance: "seeded_athlete_profile",
        },
      },
    });
    expect(state.athlete.profile.preferredLongRunDay).toEqual({
      value: "Sunday",
      provenance: "seeded_athlete_profile",
    });
    expect(state.athlete.profile.maximumWeekdayTrainingDurationMinutes).toEqual(
      {
        value: 60,
        provenance: "seeded_athlete_profile",
      },
    );
    expect(state.athleteFeedback).toContainEqual(
      expect.objectContaining({
        id: "athlete-feedback:seed-shin-discomfort",
        relatedWorkoutId: "planned-2026-08-23-long",
        relatedWorkoutResultId: "result-2026-08-23",
        rawText:
          "My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.",
      }),
    );
    expect(state.coachingTopics).toEqual([
      expect.objectContaining({
        id: "coaching-topic:shin-discomfort",
        status: "monitoring",
        firstReportedAt: "2026-08-23T10:00:00+01:00",
        latestReportedAt: "2026-08-23T10:00:00+01:00",
      }),
    ]);
    expect(state.targetRace).toEqual({
      id: "race-brighton-marathon-2027",
      name: "Brighton Marathon",
      date: "2027-04-04",
      distanceKm: 42.195,
      objectiveSeconds: 13_200,
    });
    expect(state.trainingPhase.name).toBe("Aerobic development");
    expect(state.observations).toMatchObject({
      adapter: "synthetic-coros-shaped",
      asOf: "2026-08-26T20:15:00+01:00",
      trainingLoad: { shortTerm: 68, longTerm: 51, ratio: 1.33 },
      recovery: { percent: 46, classification: "partially_recovered" },
      sleep: { durationMinutes: 442, score: 81 },
      sleepHrvMs: { value: 55, syntheticNormalRange: [49, 63] },
      restingHeartRateBpm: 52,
      dailyStress: "unremarkable",
    });
    expect(validateWorkspaceState(state)).toEqual({ valid: true, errors: [] });
  });

  it("keeps the partial threshold Workout Result separate from its Planned Workout", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const planned = state.trainingPlan.plannedWorkouts.find(
      (workout) => workout.id === "planned-2026-08-26-threshold",
    );
    const result = state.workoutResults.find(
      (workoutResult) => workoutResult.plannedWorkoutId === planned?.id,
    );

    expect(planned).toMatchObject({
      date: "2026-08-26",
      title: "5 × 1 km threshold",
      distanceKm: 9.5,
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
    expect(result).toMatchObject({
      id: "result-2026-08-26-threshold",
      status: "partial",
      summary: { completedWorkRepetitions: 3, plannedWorkRepetitions: 5 },
    });
    expect(result?.laps.filter((lap) => lap.kind === "work")).toEqual([
      {
        id: "lap-threshold-rep-1",
        kind: "work",
        distanceKm: 1,
        paceSecondsPerKm: 276,
        averageHeartRateBpm: 165,
        maximumHeartRateBpm: 172,
      },
      {
        id: "lap-threshold-rep-2",
        kind: "work",
        distanceKm: 1,
        paceSecondsPerKm: 279,
        averageHeartRateBpm: 171,
        maximumHeartRateBpm: 178,
      },
      {
        id: "lap-threshold-rep-3",
        kind: "work",
        distanceKm: 1,
        paceSecondsPerKm: 288,
        averageHeartRateBpm: 176,
        maximumHeartRateBpm: 183,
      },
    ]);
    expect(result?.laps.filter((lap) => lap.kind === "recovery")).toEqual([
      {
        id: "lap-threshold-recovery-1",
        kind: "recovery",
        distanceKm: 0.25,
        paceSecondsPerKm: 360,
        averageHeartRateBpm: 152,
        maximumHeartRateBpm: 160,
      },
      {
        id: "lap-threshold-recovery-2",
        kind: "recovery",
        distanceKm: 0.25,
        paceSecondsPerKm: 360,
        averageHeartRateBpm: 158,
        maximumHeartRateBpm: 166,
      },
    ]);
    expect(result?.laps[0]).toMatchObject({
      id: "lap-threshold-warmup",
      paceSecondsPerKm: 375,
      averageHeartRateBpm: 130,
      maximumHeartRateBpm: 134,
    });
    expect(result?.laps.at(-1)).toMatchObject({
      id: "lap-threshold-cooldown",
      distanceKm: 1.5,
      paceSecondsPerKm: 390,
      averageHeartRateBpm: 142,
      maximumHeartRateBpm: 150,
    });
    expect(result?.summary).toMatchObject({
      distanceKm: 7,
      durationSeconds: 2_358,
      averagePaceSecondsPerKm: 2_358 / 7,
      averageHeartRateBpm: 152,
    });
    expect(
      result?.laps.reduce((distanceKm, lap) => distanceKm + lap.distanceKm, 0),
    ).toBe(result?.summary.distanceKm);
    expect(
      result?.laps.reduce(
        (durationSeconds, lap) =>
          durationSeconds + lap.distanceKm * (lap.paceSecondsPerKm ?? 0),
        0,
      ),
    ).toBe(result?.summary.durationSeconds);
  });

  it("seeds comparable completed threshold sessions before the partial attempt", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const august6Plan = state.trainingPlan.plannedWorkouts.find(
      ({ id }) => id === "planned-2026-08-06-threshold",
    );
    const august6Result = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-06-threshold",
    );
    const august13Plan = state.trainingPlan.plannedWorkouts.find(
      ({ id }) => id === "planned-2026-08-13-threshold",
    );
    const august13Result = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-13-threshold",
    );

    expect(august6Plan).toMatchObject({
      title: "3 × 2 km threshold",
      type: "threshold",
      distanceKm: 11,
      prescription: {
        blocks: [
          { kind: "warmup", distanceKm: 2 },
          {
            kind: "repeat",
            repetitions: 3,
            workDistanceKm: 2,
            targetPaceSecondsPerKm: { min: 278, max: 286 },
            recoverySeconds: 120,
          },
          { kind: "cooldown", distanceKm: 3 },
        ],
      },
    });
    expect(
      august6Result?.laps.filter(({ kind }) => kind === "work"),
    ).toHaveLength(3);

    expect(august13Plan).toMatchObject({
      title: "5 × 1 km threshold",
      type: "threshold",
      distanceKm: 9.5,
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
    expect(august13Result).toMatchObject({
      status: "completed",
      summary: {
        distanceKm: 9.5,
        durationSeconds: 3_033,
        averagePaceSecondsPerKm: 3_033 / 9.5,
        completedWorkRepetitions: 5,
        plannedWorkRepetitions: 5,
      },
    });
    expect(
      august13Result?.laps.reduce(
        (distanceKm, lap) => distanceKm + lap.distanceKm,
        0,
      ),
    ).toBe(august13Result?.summary.distanceKm);
    expect(
      august13Result?.laps.reduce(
        (durationSeconds, lap) =>
          durationSeconds + lap.distanceKm * (lap.paceSecondsPerKm ?? 0),
        0,
      ),
    ).toBe(august13Result?.summary.durationSeconds);
    expect(
      august13Result?.laps
        .filter(({ kind }) => kind === "work")
        .map(({ distanceKm, paceSecondsPerKm, averageHeartRateBpm }) => ({
          distanceKm,
          paceSecondsPerKm,
          averageHeartRateBpm,
        })),
    ).toEqual([
      { distanceKm: 1, paceSecondsPerKm: 276, averageHeartRateBpm: 158 },
      { distanceKm: 1, paceSecondsPerKm: 277, averageHeartRateBpm: 161 },
      { distanceKm: 1, paceSecondsPerKm: 278, averageHeartRateBpm: 163 },
      { distanceKm: 1, paceSecondsPerKm: 278, averageHeartRateBpm: 165 },
      { distanceKm: 1, paceSecondsPerKm: 279, averageHeartRateBpm: 166 },
    ]);
  });

  it("returns an immutable fresh fixture with initial plan history", async () => {
    const source = createDemoCoachingContextSource();
    const first = await source.loadContext();
    const second = await source.loadContext();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(first.trainingPlan.planVersion).toBe(1);
    expect(first.mutationHistory).toEqual([]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.trainingPlan.plannedWorkouts[0])).toBe(true);
  });

  it.each([
    [
      "Athlete identity",
      (state: any) => {
        state.athlete.id = "";
      },
    ],
    [
      "source provenance",
      (state: any) => {
        state.observations.adapter = "unknown";
      },
    ],
    [
      "Workout Result reference",
      (state: any) => {
        state.workoutResults[0].plannedWorkoutId = "missing-workout";
      },
    ],
    [
      "explicit distance units",
      (state: any) => {
        state.trainingPlan.plannedWorkouts[0].distanceKm = 0;
      },
    ],
    ["missing Athlete Profile", (state: any) => delete state.athlete.profile],
    [
      "invalid weekday limit",
      (state: any) => {
        state.athlete.profile.maximumWeekdayTrainingDurationMinutes.value = 0;
      },
    ],
    [
      "feedback linked to another result",
      (state: any) => {
        state.athleteFeedback[0].relatedWorkoutResultId =
          "result-2026-08-26-threshold";
      },
    ],
    [
      "topic with unknown evidence",
      (state: any) => {
        state.coachingTopics[0].evidenceRefs = ["workout-result:missing"];
      },
    ],
  ])(
    "rejects corrupted %s in saved workspace state",
    async (_case, corrupt) => {
      const state = structuredClone(
        await createDemoCoachingContextSource().loadContext(),
      );
      corrupt(state);

      expect(validateWorkspaceState(state).valid).toBe(false);
    },
  );
});
