import { describe, expect, it } from "vitest";

import { selectTodayPane, type TodayPlanDay } from "../src/application/today";
import { createDemoWorkspaceState } from "../src/demo/demoFixture";

function fixtureState() {
  return structuredClone(createDemoWorkspaceState());
}

function setClock(state: ReturnType<typeof fixtureState>, now: string) {
  state.clock.now = now;
  return state;
}

function planStatuses(projection: ReturnType<typeof selectTodayPane>) {
  return projection.plan.days.map(({ date, label, status }: TodayPlanDay) => ({
    date,
    label,
    status,
  }));
}

describe("Today pane selector", () => {
  it("projects the normal fixture into the race hero, current week, and partial result", () => {
    const projection = selectTodayPane(fixtureState());

    expect(projection.today).toBe("2026-08-26");
    expect(projection.race).toMatchObject({
      state: "normal",
      daysRemaining: 221,
      name: "Brighton Marathon",
      date: "2027-04-04",
      progressPercent: expect.any(Number),
      phaseCaption: "AEROBIC DEVELOPMENT · DAY 26 OF 247",
    });
    expect(projection.race.phaseSegments).toEqual([
      expect.objectContaining({
        phaseId: "phase-base-building",
        name: "Base building",
        startDate: "2026-08-01",
        endDate: "2026-08-08",
      }),
      expect.objectContaining({
        phaseId: "phase-aerobic-development",
        name: "Aerobic development",
        startDate: "2026-08-08",
        endDate: "2027-04-04",
        active: true,
      }),
    ]);
    expect(
      projection.race.phaseSegments.reduce(
        (total, segment) => total + segment.widthPercent,
        0,
      ),
    ).toBeCloseTo(100, 5);
    expect(projection.race.progressPercent).toBeGreaterThan(0);
    expect(projection.race.progressPercent).toBeLessThan(100);

    expect(projection.plan).toMatchObject({
      available: true,
      weekStart: "2026-08-24",
      weekEnd: "2026-08-30",
    });
    expect(planStatuses(projection)).toEqual([
      { date: "2026-08-24", label: "Monday 24 August", status: "completed" },
      { date: "2026-08-25", label: "Tuesday 25 August", status: "rest" },
      { date: "2026-08-26", label: "Wednesday 26 August", status: "partial" },
      { date: "2026-08-27", label: "Thursday 27 August", status: "upcoming" },
      { date: "2026-08-28", label: "Friday 28 August", status: "rest" },
      { date: "2026-08-29", label: "Saturday 29 August", status: "upcoming" },
      { date: "2026-08-30", label: "Sunday 30 August", status: "upcoming" },
    ]);
    expect(projection.todayWorkout).toMatchObject({
      state: "result",
      status: "partial",
      workout: { id: "planned-2026-08-26-threshold" },
      result: { id: "result-2026-08-26-threshold", status: "partial" },
      metrics: {
        distanceKm: 7,
        durationSeconds: 2_488,
        averagePaceSecondsPerKm: 2_488 / 7,
        averageHeartRateBpm: 152,
      },
    });
  });

  it.each([
    ["race week", "2027-03-28T12:00:00Z", "race_week", 7],
    ["race day", "2027-04-04T12:00:00Z", "race_day", 0],
    ["post-race", "2027-04-05T12:00:00Z", "post_race", -1],
  ] as const)(
    "classifies the %s boundary from the fixture-local date",
    (_name, now, state, daysRemaining) => {
      const projection = selectTodayPane(setClock(fixtureState(), now));

      expect(projection.race.state).toBe(state);
      expect(projection.race.daysRemaining).toBe(daysRemaining);
    },
  );

  it("uses the shared derived pace when a Workout Result has no recorded average", () => {
    const state = fixtureState();
    const result = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-26-threshold",
    );
    expect(result).toBeDefined();
    delete result!.summary.averagePaceSecondsPerKm;

    const projection = selectTodayPane(state);

    expect(projection.todayWorkout).toMatchObject({
      state: "result",
      metrics: {
        averagePaceSecondsPerKm: 2_488 / 7,
        averagePaceBasis: "derived",
      },
    });
  });

  it("uses the configured Europe/London date when an instant crosses UTC midnight", () => {
    const projection = selectTodayPane(
      setClock(fixtureState(), "2027-04-03T23:30:00Z"),
    );

    expect(projection.today).toBe("2027-04-04");
    expect(projection.race.state).toBe("race_day");
    expect(projection.race.daysRemaining).toBe(0);
  });

  it("marks a past planned workout without a result as missed and preserves stopped results", () => {
    const state = setClock(fixtureState(), "2026-08-28T12:00:00+01:00");
    const result = state.workoutResults.find(
      ({ id }) => id === "result-2026-08-26-threshold",
    );
    if (!result) throw new Error("Expected threshold result");
    result.status = "stopped";

    const projection = selectTodayPane(state);
    expect(planStatuses(projection)).toEqual([
      { date: "2026-08-24", label: "Monday 24 August", status: "completed" },
      { date: "2026-08-25", label: "Tuesday 25 August", status: "rest" },
      { date: "2026-08-26", label: "Wednesday 26 August", status: "stopped" },
      { date: "2026-08-27", label: "Thursday 27 August", status: "missed" },
      { date: "2026-08-28", label: "Friday 28 August", status: "rest" },
      { date: "2026-08-29", label: "Saturday 29 August", status: "upcoming" },
      { date: "2026-08-30", label: "Sunday 30 August", status: "upcoming" },
    ]);
  });

  it("projects a planned Today card and names the next session for a rest day", () => {
    const planned = selectTodayPane(
      setClock(fixtureState(), "2026-08-27T12:00:00+01:00"),
    );
    expect(planned.todayWorkout).toMatchObject({
      state: "planned",
      status: "today",
      workout: {
        id: "planned-2026-08-27-recovery",
        title: "6 km recovery",
      },
      prescription: { distanceKm: 6 },
    });

    const threshold = selectTodayPane(
      setClock(fixtureState(), "2026-08-06T12:00:00+01:00"),
    );
    expect(threshold.todayWorkout).toMatchObject({
      state: "result",
      workout: { id: "planned-2026-08-06-threshold" },
    });

    const plannedThreshold = fixtureState();
    plannedThreshold.trainingPlan.plannedWorkouts =
      plannedThreshold.trainingPlan.plannedWorkouts.filter(
        ({ id }) => id === "planned-2026-08-26-threshold",
      );
    plannedThreshold.workoutResults = plannedThreshold.workoutResults.filter(
      ({ plannedWorkoutId }) =>
        plannedWorkoutId !== "planned-2026-08-26-threshold",
    );
    expect(selectTodayPane(plannedThreshold).todayWorkout).toMatchObject({
      state: "planned",
      prescription: {
        targetPaceSecondsPerKm: { min: 275, max: 280 },
        recoverySeconds: 90,
        distanceKm: 9.5,
      },
    });

    const rest = selectTodayPane(
      setClock(fixtureState(), "2026-08-25T12:00:00+01:00"),
    );
    expect(rest.todayWorkout).toMatchObject({
      state: "rest",
      nextWorkout: {
        id: "planned-2026-08-26-threshold",
        date: "2026-08-26",
      },
    });
  });

  it("keeps the hero and returns honest rest and unavailable-plan facts when the plan is empty", () => {
    const state = fixtureState();
    state.trainingPlan.plannedWorkouts = [];

    const projection = selectTodayPane(state);

    expect(projection.race.name).toBe("Brighton Marathon");
    expect(projection.plan).toMatchObject({
      available: false,
      days: expect.any(Array),
    });
    expect(projection.plan.days).toHaveLength(7);
    expect(projection.plan.days.every(({ status }) => status === "rest")).toBe(
      true,
    );
    expect(projection.todayWorkout).toEqual({
      state: "rest",
      status: "rest",
      nextWorkout: null,
    });
  });

  it("falls back to the current Training Phase label when phase history cannot identify an active phase", () => {
    const state = fixtureState();
    state.trainingPhaseHistory = [];

    const projection = selectTodayPane(state);

    expect(projection.race.phaseSegments).toEqual([]);
    expect(projection.race.phaseCaption).toBe(
      "AEROBIC DEVELOPMENT · DAY 26 OF 247",
    );
  });

  it("only signals an existing pending proposal", () => {
    const state = fixtureState();
    expect(selectTodayPane(state).hasPendingProposal).toBe(false);

    state.pendingAdaptationProposal = {
      proposal: {
        reviewId: "review:today",
        sourceWorkoutId: "planned-2026-08-26-threshold",
        expectedPlanVersion: state.trainingPlan.planVersion,
        evidenceRefs: [],
        rationale: {
          summary: "Reduce load.",
          counterEvidence: "The rest of the evidence is stable.",
          confidence: "moderate",
          limitations: ["One session cannot establish the cause."],
        },
        recommended: {
          optionId: "recovery-first",
          label: "Recovery first",
          summary: "Reduce the next session.",
          tradeoff: "Loses a little volume.",
          workoutChanges: [],
        },
        alternative: {
          optionId: "keep-the-rhythm",
          label: "Keep the rhythm",
          summary: "Keep the current plan.",
          tradeoff: "Provides less recovery.",
          workoutChanges: [],
        },
      },
      openedAt: state.clock.now,
      expiresAt: "2026-08-27T20:15:00+01:00",
      delivery: "fallback",
      selectedOptionId: null,
    };
    expect(selectTodayPane(state).hasPendingProposal).toBe(true);
  });
});
