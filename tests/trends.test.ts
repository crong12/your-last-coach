import { describe, expect, it } from "vitest";

import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import { validateWorkspaceState } from "../src/domain/validation";
import {
  deriveChartAnnotations,
  projectPaceHeartRate,
  projectReadinessSeries,
  projectRepeatedSessions,
  projectWeeklyVolumeLoad,
  resolveTrendsRange,
} from "../src/application/trends";
import type { WorkspaceState } from "../src/domain/types";

describe("issue 64 fixture evidence", () => {
  it("provides dated readiness history and complete Workout Result summaries", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const observations = state.observations as unknown as Record<string, any>;
    const history = observations.readinessHistory as Array<Record<string, any>>;
    const result = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-26-threshold",
    ) as unknown as { summary: Record<string, unknown> };

    expect(history.length).toBeGreaterThan(7);
    expect(history.at(-1)).toMatchObject({
      date: "2026-08-26",
      hrvMs: 55,
      restingHeartRateBpm: 52,
      sleep: { durationMinutes: 442 },
    });
    expect(history.at(-1)?.source).toMatchObject({
      adapter: "synthetic-coros-shaped",
      readAt: "2026-08-26T20:15:00+01:00",
    });
    expect(result.summary).toMatchObject({
      durationSeconds: 4_200,
      trainingLoad: 72,
      averagePaceSecondsPerKm: 282,
      averageHeartRateBpm: 170,
      activityKind: "outdoor_run",
    });
    expect(
      (state.trainingPlan as unknown as Record<string, unknown>).buildStartDate,
    ).toBe("2026-08-01");
    expect(
      (state as unknown as Record<string, unknown>).trainingPhaseHistory,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-08-01",
          name: "Base building",
        }),
      ]),
    );
  });

  it("keeps latest snapshot values in agreement with latest history", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const observations = state.observations as unknown as Record<string, any>;
    const latest = observations.readinessHistory.at(-1);

    expect(latest.hrvMs).toBe(observations.sleepHrvMs.value);
    expect(latest.restingHeartRateBpm).toBe(observations.restingHeartRateBpm);
    expect(latest.sleep.durationMinutes).toBe(
      observations.sleep.durationMinutes,
    );
  });

  it("validates the extended fixture as one authoritative workspace", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    expect(validateWorkspaceState(state)).toEqual({ valid: true, errors: [] });
  });

  it.each([
    [
      "missing readiness history",
      (state: any) => delete state.observations.readinessHistory,
    ],
    [
      "unsupported readiness provenance",
      (state: any) => {
        state.observations.readinessHistory[0].source.adapter = "unknown";
      },
    ],
    [
      "invalid readiness source timestamp",
      (state: any) => {
        state.observations.readinessHistory[0].source.readAt =
          "2026-02-30T20:15:00+01:00";
      },
    ],
    [
      "non-finite readiness measurement",
      (state: any) => {
        state.observations.readinessHistory[0].hrvMs = Number.NaN;
      },
    ],
    [
      "invalid readiness date",
      (state: any) => {
        state.observations.readinessHistory[0].date = "2026-02-30";
      },
    ],
    [
      "negative sleep duration",
      (state: any) => {
        state.observations.readinessHistory[0].sleep.durationMinutes = -1;
      },
    ],
    [
      "duplicate readiness record identity",
      (state: any) => {
        state.observations.readinessHistory.push(
          structuredClone(state.observations.readinessHistory[0]),
        );
      },
    ],
    [
      "invalid Workout Result Training Load",
      (state: any) => {
        state.workoutResults[0].summary.trainingLoad = -1;
      },
    ],
    [
      "unsupported Workout Result provenance",
      (state: any) => {
        state.workoutResults[0].source.adapter = "unknown";
      },
    ],
    [
      "build start after Target Race",
      (state: any) => {
        state.trainingPlan.buildStartDate = "2027-04-05";
      },
    ],
    [
      "unordered phase history",
      (state: any) => {
        state.trainingPhaseHistory.reverse();
      },
    ],
    [
      "duplicate phase boundary",
      (state: any) => {
        state.trainingPhaseHistory[1].date = state.trainingPhaseHistory[0].date;
      },
    ],
    [
      "latest snapshot disagreement",
      (state: any) => {
        state.observations.readinessHistory.at(-1).hrvMs = 56;
      },
    ],
    [
      "missing latest snapshot counterpart",
      (state: any) => {
        delete state.observations.readinessHistory.at(-1).hrvMs;
      },
    ],
  ])("rejects %s", async (_name, corrupt) => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    );
    corrupt(state);
    expect(validateWorkspaceState(state).valid).toBe(false);
  });

  it("requires provenance when a Workout Result includes duration", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    );
    const result = state.workoutResults[0];
    result.summary.trainingLoad = undefined;
    result.summary.averagePaceSecondsPerKm = undefined;
    result.summary.averageHeartRateBpm = undefined;
    result.summary.activityKind = undefined;
    delete result.source;

    expect(validateWorkspaceState(state).valid).toBe(false);
  });

  it("resolves inclusive 4w, 12w, and Build windows from authoritative dates", async () => {
    const state = await createDemoCoachingContextSource().loadContext();

    expect(resolveTrendsRange(state, "4w")).toMatchObject({
      from: "2026-07-30",
      to: "2026-08-26",
      expectedDays: 28,
      weekStarts: ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"],
    });
    expect(resolveTrendsRange(state, "12w")).toMatchObject({
      from: "2026-06-04",
      to: "2026-08-26",
      expectedDays: 84,
      weekStarts: [
        "2026-06-08",
        "2026-06-15",
        "2026-06-22",
        "2026-06-29",
        "2026-07-06",
        "2026-07-13",
        "2026-07-20",
        "2026-07-27",
        "2026-08-03",
        "2026-08-10",
        "2026-08-17",
        "2026-08-24",
      ],
    });
    expect(resolveTrendsRange(state, "build")).toMatchObject({
      from: "2026-08-01",
      to: "2027-04-04",
      expectedDays: 26,
      weekStarts: [
        "2026-07-27",
        "2026-08-03",
        "2026-08-10",
        "2026-08-17",
        "2026-08-24",
      ],
    });
    expect(resolveTrendsRange(state, "build").from).not.toBe(
      state.observations.readinessHistory[0]?.date,
    );
  });

  it("bounds Build evidence at the fixture clock while keeping the race display boundary", async () => {
    const state = await createDemoCoachingContextSource().loadContext();

    const range = resolveTrendsRange(state, "build");
    const readiness = projectReadinessSeries(state, "hrv", "build");
    const volume = projectWeeklyVolumeLoad(state, "build");
    const annotations = deriveChartAnnotations(state, "build");

    expect(range.from).toBe("2026-08-01");
    expect(range.to).toBe("2027-04-04");
    expect(readiness.points.every(({ date }) => date <= "2026-08-26")).toBe(
      true,
    );
    expect(
      volume.weeks.every(({ weekStart }) => weekStart <= "2026-08-24"),
    ).toBe(true);
    expect(annotations).toContainEqual({
      kind: "race",
      date: "2027-04-04",
      label: "Target race",
    });
  });

  it("uses only the trailing seven calendar dates for HRV, RHR, and sleep averages", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    for (const record of state.observations.readinessHistory) {
      if (record.date < "2026-08-20") {
        record.hrvMs = 1;
        record.restingHeartRateBpm = 1;
        if (record.sleep) record.sleep.durationMinutes = 1;
      }
    }

    expect(projectReadinessSeries(state, "hrv", "4w").average).toBe(55);
    expect(
      projectReadinessSeries(state, "restingHeartRate", "4w").average,
    ).toBe(52);
    expect(projectReadinessSeries(state, "sleep", "4w").average).toBe(442);
  });

  it("projects gap-honest readiness series and recorded-night averages", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const projection = projectReadinessSeries(state, "hrv", "4w");

    expect(projection.status).toBe("partial");
    expect(projection.points).toHaveLength(28);
    expect(projection.coverage).toEqual({ observed: 21, expected: 28 });
    expect(projection.latest).toEqual({ date: "2026-08-26", value: 55 });
    expect(projection.average).toBe(55);
    expect(projection.points.some((point) => point.value === null)).toBe(true);

    const sleep = projectReadinessSeries(state, "sleep", "4w");
    expect(sleep.points.find(({ date }) => date === "2026-08-24")).toEqual({
      date: "2026-08-24",
      value: null,
    });
  });

  it("derives annotations only from dated phase history, receipts, and the Target Race", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const annotations = deriveChartAnnotations(state, "build");

    expect(annotations).toEqual([
      { kind: "phase", date: "2026-08-01", label: "Base building" },
      { kind: "phase", date: "2026-08-08", label: "Aerobic development" },
      { kind: "race", date: "2027-04-04", label: "Target race" },
    ]);
  });

  it("uses the local applied date for approved adaptation annotations", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    const workout = state.trainingPlan.plannedWorkouts[0];
    state.trainingPlan.planVersion = 2;
    state.appliedReviewIds = ["review-trends"];
    state.adaptationReceipts = [
      {
        reviewId: "review-trends",
        selectedOption: { optionId: "reduce-load", label: "Reduce load" },
        affectedWorkouts: [
          {
            workoutId: workout.id,
            before: structuredClone(workout),
            after: structuredClone(workout),
          },
        ],
        appliedAt: "2026-08-20T10:00:00+01:00",
        planVersionBefore: 1,
        planVersionAfter: 2,
        evidenceRefs: ["workout-result:result-2026-08-23"],
      },
    ];

    expect(deriveChartAnnotations(state, "4w")).toContainEqual({
      kind: "adaptation",
      date: "2026-08-20",
      label: "Reduce load",
      adaptationId: "review-trends",
    });
  });

  it("aggregates weekly distance and load without turning unavailable load into zero", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const projection = projectWeeklyVolumeLoad(state, "4w");

    expect(projection.status).toBe("ready");
    expect(projection.weeks).toHaveLength(4);
    expect(projection.weeks.at(-1)).toMatchObject({
      weekStart: "2026-08-24",
      distanceKm: 13.5,
      trainingLoad: 94,
    });

    const degraded = structuredClone(state) as WorkspaceState;
    delete degraded.workoutResults.at(-1)!.summary.trainingLoad;
    expect(projectWeeklyVolumeLoad(degraded, "4w").status).toBe("partial");
    expect(
      projectWeeklyVolumeLoad(degraded, "4w").weeks.at(-1)?.trainingLoad,
    ).toBe(null);
  });

  it("groups Workout Results by the Training Plan local calendar date", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    const longRun = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-23",
    );
    expect(longRun).toBeDefined();
    longRun!.startedAt = "2026-08-23T23:30:00Z";

    const projection = projectWeeklyVolumeLoad(state, "4w");
    expect(projection.weeks.at(-1)).toMatchObject({
      weekStart: "2026-08-24",
      distanceKm: 33.5,
    });
  });

  it("filters pace and heart-rate comparisons to Outdoor Runs with both measures", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const projection = projectPaceHeartRate(state, "build");

    expect(projection.status).toBe("ready");
    expect(projection.points.length).toBeGreaterThanOrEqual(2);
    expect(
      projection.points.every(
        ({ paceSecondsPerKm, heartRateBpm }) =>
          Number.isFinite(paceSecondsPerKm) && Number.isFinite(heartRateBpm),
      ),
    ).toBe(true);
  });

  it("requires activity classification authority before pace comparison", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    for (const result of state.workoutResults) {
      delete result.summary.activityKind;
    }

    expect(projectPaceHeartRate(state, "4w").status).toBe("unavailable");
  });

  it("groups only complete matching repeat prescriptions and requires two attempts", async () => {
    const state = await createDemoCoachingContextSource().loadContext();
    const projection = projectRepeatedSessions(state, "build");

    expect(projection.status).toBe("ready");
    expect(projection.groups).toHaveLength(1);
    expect(projection.groups[0]).toMatchObject({
      attemptCount: 2,
      latestResult: { id: "result-2026-08-26-threshold" },
    });
  });

  it("keeps valid null readiness metrics as missing measurements", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    state.observations.readinessHistory[0].hrvMs = null;

    expect(validateWorkspaceState(state)).toEqual({ valid: true, errors: [] });
    const projection = projectReadinessSeries(state, "hrv", "4w");
    expect(projection.status).toBe("partial");
    expect(projection.points[1]).toEqual({ date: "2026-07-31", value: null });
  });

  it("rejects invalid readiness values before chart projection", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    state.observations.readinessHistory[0].hrvMs = Number.NaN;

    expect(projectReadinessSeries(state, "hrv", "4w").status).toBe(
      "unavailable",
    );

    state.observations.readinessHistory[0].hrvMs = 51;
    state.observations.readinessHistory[0].date = "2026-02-30";
    expect(projectReadinessSeries(state, "hrv", "4w").status).toBe(
      "unavailable",
    );

    state.observations.readinessHistory[0].date = "2026-07-30";
    state.observations.readinessHistory[0].source.readAt =
      "2026-02-30T20:15:00+01:00";
    expect(projectReadinessSeries(state, "hrv", "4w").status).toBe(
      "unavailable",
    );
  });

  it("rejects invalid Workout Result aggregates before weekly and pace projection", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    state.workoutResults[0].summary.trainingLoad = Number.NaN;
    expect(projectWeeklyVolumeLoad(state, "4w").status).toBe("unavailable");

    state.workoutResults[0].summary.trainingLoad = 74;
    state.workoutResults[0].summary.durationSeconds = -1;
    expect(projectWeeklyVolumeLoad(state, "4w").status).toBe("unavailable");

    state.workoutResults[0].summary.durationSeconds = 3_900;
    state.workoutResults[0].summary.activityKind = "cycling" as never;
    expect(projectPaceHeartRate(state, "build").status).toBe("unavailable");
  });

  it("keeps repeated-session grouping strict across prescription changes", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    const second = state.trainingPlan.plannedWorkouts.find(
      ({ id }) => id === "planned-2026-08-06-threshold",
    );
    expect(second).toBeDefined();
    second!.prescription.blocks = structuredClone(
      state.trainingPlan.plannedWorkouts.find(
        ({ id }) => id === "planned-2026-08-26-threshold",
      )!.prescription.blocks,
    );
    const repeatBlock = second!.prescription.blocks[1];
    expect(repeatBlock.kind).toBe("repeat");
    if (repeatBlock.kind === "repeat") repeatBlock.recoverySeconds = 120;

    expect(projectRepeatedSessions(state, "build").status).toBe("empty");
  });

  it("does not group repeated sessions without a resolvable training plan", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    state.trainingPlan.plannedWorkouts = [];

    expect(projectRepeatedSessions(state, "build").status).toBe("unavailable");
  });

  it("does not render phase annotations from invalid phase history", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    state.trainingPhaseHistory[0].name = "";

    expect(
      deriveChartAnnotations(state, "build").filter(
        ({ kind }) => kind === "phase",
      ),
    ).toEqual([]);
  });

  it("returns explicit empty states for valid ranges without results or pairs", async () => {
    const state = structuredClone(
      await createDemoCoachingContextSource().loadContext(),
    ) as WorkspaceState;
    state.workoutResults = [];
    expect(projectWeeklyVolumeLoad(state, "4w")).toMatchObject({
      status: "empty",
      weeks: [
        { weekStart: "2026-08-03", distanceKm: 0, trainingLoad: 0 },
        { weekStart: "2026-08-10", distanceKm: 0, trainingLoad: 0 },
        { weekStart: "2026-08-17", distanceKm: 0, trainingLoad: 0 },
        { weekStart: "2026-08-24", distanceKm: 0, trainingLoad: 0 },
      ],
    });
    expect(projectPaceHeartRate(state, "4w").status).toBe("empty");
    expect(projectRepeatedSessions(state, "build").status).toBe("empty");
  });
});
