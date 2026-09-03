import type {
  IsoDate,
  PlannedWorkout,
  WorkoutBlock,
  WorkoutResult,
  WorkspaceState,
} from "../domain/types";
import { deepFreeze } from "../domain/immutable";

const DEMO_READ_AT = "2026-08-26T20:15:00+01:00" as const;
const DEMO_SOURCE = {
  adapter: "synthetic-coros-shaped",
  readAt: DEMO_READ_AT,
  label: "seeded synthetic COROS-shaped observations",
} as const;

const easyBlock = (distanceKm: number): WorkoutBlock[] => [
  { kind: "easy", distanceKm },
];

const plannedWorkout = (
  id: string,
  date: PlannedWorkout["date"],
  type: PlannedWorkout["type"],
  title: string,
  purpose: string,
  distanceKm: number,
  blocks: WorkoutBlock[] = easyBlock(distanceKm),
): PlannedWorkout => ({
  id,
  date,
  type,
  title,
  purpose,
  distanceKm,
  prescription: { blocks },
});

const completedResult = (
  date: string,
  plannedWorkoutId: string,
  distanceKm: number,
  summary: {
    durationSeconds: number;
    trainingLoad: number;
    averagePaceSecondsPerKm: number;
    averageHeartRateBpm: number;
    activityKind?: "outdoor_run" | "indoor_run" | "trail_run" | "other";
  },
): WorkoutResult => ({
  id: `result-${date}`,
  plannedWorkoutId,
  startedAt: `${date}T07:00:00+01:00`,
  status: "completed",
  summary: { distanceKm, ...summary },
  source: DEMO_SOURCE,
  laps: [],
});

export const DEMO_BACKFILLED_WORKOUT_RESULTS = [
  completedResult("2026-08-02", "planned-2026-08-02-long", 14, {
    durationSeconds: 5_040,
    trainingLoad: 62,
    averagePaceSecondsPerKm: 360,
    averageHeartRateBpm: 144,
    activityKind: "outdoor_run",
  }),
  completedResult("2026-08-04", "planned-2026-08-04-easy", 8, {
    durationSeconds: 2_880,
    trainingLoad: 33,
    averagePaceSecondsPerKm: 360,
    averageHeartRateBpm: 137,
    activityKind: "outdoor_run",
  }),
  completedResult("2026-08-08", "planned-2026-08-08-recovery", 6, {
    durationSeconds: 2_220,
    trainingLoad: 24,
    averagePaceSecondsPerKm: 370,
    averageHeartRateBpm: 130,
    activityKind: "outdoor_run",
  }),
  completedResult("2026-08-09", "planned-2026-08-09-long", 16, {
    durationSeconds: 5_840,
    trainingLoad: 68,
    averagePaceSecondsPerKm: 365,
    averageHeartRateBpm: 145,
    activityKind: "outdoor_run",
  }),
  completedResult("2026-08-11", "planned-2026-08-11-easy", 8, {
    durationSeconds: 2_840,
    trainingLoad: 31,
    averagePaceSecondsPerKm: 355,
    averageHeartRateBpm: 136,
    activityKind: "outdoor_run",
  }),
] satisfies WorkoutResult[];

const readinessRecord = (
  date: IsoDate,
  values: {
    hrvMs?: number;
    restingHeartRateBpm?: number;
    sleepMinutes?: number;
    deepRatio?: number;
    lightRatio?: number;
    remRatio?: number;
    awakeRatio?: number;
  },
) => ({
  date,
  ...(values.hrvMs === undefined ? {} : { hrvMs: values.hrvMs }),
  ...(values.restingHeartRateBpm === undefined
    ? {}
    : { restingHeartRateBpm: values.restingHeartRateBpm }),
  ...(values.sleepMinutes === undefined
    ? {}
    : {
        sleep: {
          durationMinutes: values.sleepMinutes,
          ...(values.deepRatio === undefined &&
          values.lightRatio === undefined &&
          values.remRatio === undefined &&
          values.awakeRatio === undefined
            ? {}
            : {
                stages: {
                  ...(values.deepRatio === undefined
                    ? {}
                    : { deepRatio: values.deepRatio }),
                  ...(values.lightRatio === undefined
                    ? {}
                    : { lightRatio: values.lightRatio }),
                  ...(values.remRatio === undefined
                    ? {}
                    : { remRatio: values.remRatio }),
                  ...(values.awakeRatio === undefined
                    ? {}
                    : { awakeRatio: values.awakeRatio }),
                },
              }),
        },
      }),
  source: DEMO_SOURCE,
});

const READINESS_HISTORY = [
  readinessRecord("2026-07-30", {
    hrvMs: 51,
    restingHeartRateBpm: 55,
    sleepMinutes: 405,
  }),
  readinessRecord("2026-07-31", { restingHeartRateBpm: 56, sleepMinutes: 398 }),
  readinessRecord("2026-08-01", {
    hrvMs: 52,
    restingHeartRateBpm: 54,
    sleepMinutes: 421,
  }),
  readinessRecord("2026-08-02", {
    hrvMs: 53,
    restingHeartRateBpm: 53,
    sleepMinutes: 430,
  }),
  readinessRecord("2026-08-03", {
    hrvMs: 51,
    restingHeartRateBpm: 54,
    sleepMinutes: 401,
  }),
  readinessRecord("2026-08-04", { restingHeartRateBpm: 55, sleepMinutes: 389 }),
  readinessRecord("2026-08-05", {
    hrvMs: 54,
    restingHeartRateBpm: 53,
    sleepMinutes: 435,
  }),
  readinessRecord("2026-08-06", {
    hrvMs: 53,
    restingHeartRateBpm: 52,
    sleepMinutes: 447,
  }),
  readinessRecord("2026-08-07", {
    hrvMs: 55,
    restingHeartRateBpm: 51,
    sleepMinutes: 452,
  }),
  readinessRecord("2026-08-08", {
    hrvMs: 54,
    restingHeartRateBpm: 52,
    sleepMinutes: 438,
  }),
  readinessRecord("2026-08-09", { restingHeartRateBpm: 53, sleepMinutes: 410 }),
  readinessRecord("2026-08-10", {
    hrvMs: 56,
    restingHeartRateBpm: 51,
    sleepMinutes: 462,
  }),
  readinessRecord("2026-08-11", {
    hrvMs: 57,
    restingHeartRateBpm: 50,
    sleepMinutes: 455,
  }),
  readinessRecord("2026-08-12", {
    hrvMs: 55,
    restingHeartRateBpm: 51,
    sleepMinutes: 448,
  }),
  readinessRecord("2026-08-13", {
    hrvMs: 54,
    restingHeartRateBpm: 52,
    sleepMinutes: 440,
  }),
  readinessRecord("2026-08-14", { restingHeartRateBpm: 53, sleepMinutes: 400 }),
  readinessRecord("2026-08-15", {
    hrvMs: 53,
    restingHeartRateBpm: 52,
    sleepMinutes: 429,
  }),
  readinessRecord("2026-08-16", {
    hrvMs: 55,
    restingHeartRateBpm: 51,
    sleepMinutes: 460,
  }),
  readinessRecord("2026-08-17", {
    hrvMs: 56,
    restingHeartRateBpm: 50,
    sleepMinutes: 470,
  }),
  readinessRecord("2026-08-18", { restingHeartRateBpm: 51, sleepMinutes: 425 }),
  readinessRecord("2026-08-19", {
    hrvMs: 57,
    restingHeartRateBpm: 50,
    sleepMinutes: 462,
  }),
  readinessRecord("2026-08-20", {
    hrvMs: 56,
    restingHeartRateBpm: 51,
    sleepMinutes: 451,
  }),
  readinessRecord("2026-08-21", {
    hrvMs: 54,
    restingHeartRateBpm: 52,
    sleepMinutes: 438,
  }),
  readinessRecord("2026-08-22", {
    hrvMs: 55,
    restingHeartRateBpm: 51,
    sleepMinutes: 449,
  }),
  readinessRecord("2026-08-23", { restingHeartRateBpm: 52, sleepMinutes: 430 }),
  readinessRecord("2026-08-24", { hrvMs: 54, restingHeartRateBpm: 53 }),
  readinessRecord("2026-08-25", { restingHeartRateBpm: 53 }),
  readinessRecord("2026-08-26", {
    hrvMs: 55,
    restingHeartRateBpm: 52,
    sleepMinutes: 442,
    deepRatio: 0.16,
    lightRatio: 0.54,
    remRatio: 0.27,
    awakeRatio: 0.03,
  }),
] as const;

export const DEMO_WORKSPACE_STATE = {
  seedVersion: "demo-athlete-v1",
  clock: {
    now: "2026-08-26T20:15:00+01:00",
    timeZone: "Europe/London",
  },
  athlete: {
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
      preferredLongRunDay: {
        value: "Sunday",
        provenance: "seeded_athlete_profile",
      },
      maximumWeekdayTrainingDurationMinutes: {
        value: 60,
        provenance: "seeded_athlete_profile",
      },
    },
  },
  targetRace: {
    id: "race-brighton-marathon-2027",
    name: "Brighton Marathon",
    date: "2027-04-04",
    distanceKm: 42.195,
    objectiveSeconds: 13_200,
  },
  trainingPhase: {
    id: "phase-aerobic-development",
    name: "Aerobic development",
  },
  observations: {
    adapter: "synthetic-coros-shaped",
    asOf: "2026-08-26T20:15:00+01:00",
    provenance:
      "Seeded internal adapter grounded in documented read-only COROS capability classes; not an authenticated COROS wire format.",
    trainingLoad: { shortTerm: 68, longTerm: 51, ratio: 1.33 },
    recovery: { percent: 46, classification: "partially_recovered" },
    sleep: { durationMinutes: 442, score: 81 },
    sleepHrvMs: { value: 55, syntheticNormalRange: [49, 63] },
    restingHeartRateBpm: 52,
    dailyStress: "unremarkable",
    source: DEMO_SOURCE,
    readinessHistory: [...READINESS_HISTORY],
  },
  trainingPlan: {
    planVersion: 1,
    buildStartDate: "2026-08-01",
    plannedWorkouts: [
      plannedWorkout(
        "planned-2026-08-02-long",
        "2026-08-02",
        "long_run",
        "14 km long run",
        "Build durable aerobic time",
        14,
      ),
      plannedWorkout(
        "planned-2026-08-04-easy",
        "2026-08-04",
        "easy",
        "8 km easy",
        "Comfortable aerobic running",
        8,
      ),
      plannedWorkout(
        "planned-2026-08-06-threshold",
        "2026-08-06",
        "threshold",
        "3 × 2 km threshold",
        "Develop sustainable speed",
        11,
        [
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
      ),
      plannedWorkout(
        "planned-2026-08-08-recovery",
        "2026-08-08",
        "recovery",
        "6 km recovery",
        "Absorb the week's training",
        6,
      ),
      plannedWorkout(
        "planned-2026-08-09-long",
        "2026-08-09",
        "long_run",
        "16 km long run",
        "Extend aerobic endurance",
        16,
      ),
      plannedWorkout(
        "planned-2026-08-11-easy",
        "2026-08-11",
        "easy",
        "8 km easy",
        "Maintain aerobic frequency",
        8,
      ),
      plannedWorkout(
        "planned-2026-08-13-threshold",
        "2026-08-13",
        "threshold",
        "5 × 1 km threshold",
        "Develop threshold pace under control",
        9.5,
        [
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
      ),
      plannedWorkout(
        "planned-2026-08-15-strides",
        "2026-08-15",
        "easy",
        "8 km easy with strides",
        "Keep relaxed leg speed",
        8,
      ),
      plannedWorkout(
        "planned-2026-08-16-long",
        "2026-08-16",
        "long_run",
        "18 km long run",
        "Build aerobic durability",
        18,
      ),
      plannedWorkout(
        "planned-2026-08-18-easy",
        "2026-08-18",
        "easy",
        "10 km easy",
        "Maintain aerobic volume",
        10,
      ),
      plannedWorkout(
        "planned-2026-08-19-steady",
        "2026-08-19",
        "steady",
        "12 km steady with 5 km tempo",
        "Build controlled aerobic strength",
        12,
      ),
      plannedWorkout(
        "planned-2026-08-21-easy",
        "2026-08-21",
        "easy",
        "8 km easy",
        "Recover between longer sessions",
        8,
      ),
      plannedWorkout(
        "planned-2026-08-22-recovery",
        "2026-08-22",
        "recovery",
        "6 km recovery",
        "Prepare for the long run",
        6,
      ),
      plannedWorkout(
        "planned-2026-08-23-long",
        "2026-08-23",
        "long_run",
        "20 km long run",
        "Extend aerobic endurance",
        20,
      ),
      plannedWorkout(
        "planned-2026-08-24-recovery",
        "2026-08-24",
        "recovery",
        "6 km recovery",
        "Recover from the long run",
        6,
      ),
      plannedWorkout(
        "planned-2026-08-26-threshold",
        "2026-08-26",
        "threshold",
        "5 × 1 km threshold",
        "Develop threshold pace under control",
        9.5,
        [
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
      ),
      plannedWorkout(
        "planned-2026-08-27-recovery",
        "2026-08-27",
        "recovery",
        "6 km recovery",
        "Restore easy movement after threshold work",
        6,
      ),
      plannedWorkout(
        "planned-2026-08-29-strides",
        "2026-08-29",
        "easy",
        "8 km easy with strides",
        "Keep relaxed leg speed",
        8,
      ),
      plannedWorkout(
        "planned-2026-08-30-long",
        "2026-08-30",
        "long_run",
        "18 km long run",
        "Build aerobic durability",
        18,
      ),
    ],
  },
  trainingPhaseHistory: [
    {
      id: "phase-history-base-building",
      date: "2026-08-01",
      phaseId: "phase-base-building",
      name: "Base building",
    },
    {
      id: "phase-history-aerobic-development",
      date: "2026-08-08",
      phaseId: "phase-aerobic-development",
      name: "Aerobic development",
    },
  ],
  workoutResults: [
    ...DEMO_BACKFILLED_WORKOUT_RESULTS,
    {
      id: "result-2026-08-06-threshold",
      plannedWorkoutId: "planned-2026-08-06-threshold",
      startedAt: "2026-08-06T17:30:00+01:00",
      status: "completed",
      provenance: "seeded synthetic COROS-shaped Workout Result",
      source: DEMO_SOURCE,
      summary: {
        distanceKm: 11,
        durationSeconds: 3_600,
        activityKind: "outdoor_run",
      },
      laps: [
        {
          id: "lap-threshold-completed-warmup",
          kind: "warmup",
          distanceKm: 2,
          paceSecondsPerKm: 360,
          averageHeartRateBpm: 130,
        },
        {
          id: "lap-threshold-completed-work-1",
          kind: "work",
          distanceKm: 2,
          paceSecondsPerKm: 286,
          averageHeartRateBpm: 152,
        },
        {
          id: "lap-threshold-completed-work-2",
          kind: "work",
          distanceKm: 2,
          paceSecondsPerKm: 282,
          averageHeartRateBpm: 158,
        },
        {
          id: "lap-threshold-completed-work-3",
          kind: "work",
          distanceKm: 2,
          paceSecondsPerKm: 278,
          averageHeartRateBpm: 164,
        },
        {
          id: "lap-threshold-completed-cooldown",
          kind: "cooldown",
          distanceKm: 3,
          paceSecondsPerKm: 330,
          averageHeartRateBpm: 145,
        },
      ],
    },
    {
      id: "result-2026-08-13-threshold",
      plannedWorkoutId: "planned-2026-08-13-threshold",
      startedAt: "2026-08-13T17:30:00+01:00",
      status: "completed",
      provenance: "seeded synthetic COROS-shaped Workout Result",
      source: DEMO_SOURCE,
      summary: {
        distanceKm: 9.5,
        durationSeconds: 3_033,
        completedWorkRepetitions: 5,
        plannedWorkRepetitions: 5,
        trainingLoad: 58,
        averagePaceSecondsPerKm: 3_033 / 9.5,
        averageHeartRateBpm: 150,
        activityKind: "outdoor_run",
      },
      laps: [
        {
          id: "lap-threshold-aug13-warmup",
          kind: "warmup",
          distanceKm: 2,
          paceSecondsPerKm: 365,
          averageHeartRateBpm: 128,
          maximumHeartRateBpm: 134,
        },
        ...[
          [276, 158, 165],
          [277, 161, 168],
          [278, 163, 170],
          [278, 165, 172],
          [279, 166, 173],
        ].flatMap(
          (
            [paceSecondsPerKm, averageHeartRateBpm, maximumHeartRateBpm],
            index,
          ) => [
            {
              id: `lap-threshold-aug13-work-${index + 1}`,
              kind: "work" as const,
              distanceKm: 1,
              paceSecondsPerKm,
              averageHeartRateBpm,
              maximumHeartRateBpm,
            },
            ...(index < 4
              ? [
                  {
                    id: `lap-threshold-aug13-recovery-${index + 1}`,
                    kind: "recovery" as const,
                    distanceKm: 0.25,
                    paceSecondsPerKm: 360,
                    averageHeartRateBpm: 142 + index * 2,
                    maximumHeartRateBpm: 148 + index * 2,
                  },
                ]
              : []),
          ],
        ),
        {
          id: "lap-threshold-aug13-cooldown",
          kind: "cooldown",
          distanceKm: 1.5,
          paceSecondsPerKm: 370,
          averageHeartRateBpm: 140,
          maximumHeartRateBpm: 148,
        },
      ],
    },
    completedResult("2026-08-15", "planned-2026-08-15-strides", 8, {
      durationSeconds: 2_760,
      trainingLoad: 36,
      averagePaceSecondsPerKm: 345,
      averageHeartRateBpm: 140,
      activityKind: "outdoor_run",
    }),
    completedResult("2026-08-16", "planned-2026-08-16-long", 18, {
      durationSeconds: 6_480,
      trainingLoad: 75,
      averagePaceSecondsPerKm: 360,
      averageHeartRateBpm: 145,
      activityKind: "outdoor_run",
    }),
    completedResult("2026-08-18", "planned-2026-08-18-easy", 10, {
      durationSeconds: 3_480,
      trainingLoad: 43,
      averagePaceSecondsPerKm: 348,
      averageHeartRateBpm: 139,
      activityKind: "outdoor_run",
    }),
    completedResult("2026-08-19", "planned-2026-08-19-steady", 12, {
      durationSeconds: 3_960,
      trainingLoad: 58,
      averagePaceSecondsPerKm: 330,
      averageHeartRateBpm: 151,
      activityKind: "outdoor_run",
    }),
    completedResult("2026-08-21", "planned-2026-08-21-easy", 8, {
      durationSeconds: 2_760,
      trainingLoad: 32,
      averagePaceSecondsPerKm: 345,
      averageHeartRateBpm: 136,
      activityKind: "outdoor_run",
    }),
    completedResult("2026-08-22", "planned-2026-08-22-recovery", 6, {
      durationSeconds: 2_160,
      trainingLoad: 27,
      averagePaceSecondsPerKm: 360,
      averageHeartRateBpm: 132,
      activityKind: "outdoor_run",
    }),
    completedResult("2026-08-23", "planned-2026-08-23-long", 20, {
      durationSeconds: 7_100,
      trainingLoad: 88,
      averagePaceSecondsPerKm: 355,
      averageHeartRateBpm: 147,
      activityKind: "outdoor_run",
    }),
    completedResult("2026-08-24", "planned-2026-08-24-recovery", 6, {
      durationSeconds: 2_190,
      trainingLoad: 22,
      averagePaceSecondsPerKm: 365,
      averageHeartRateBpm: 130,
      activityKind: "outdoor_run",
    }),
    {
      id: "result-2026-08-26-threshold",
      plannedWorkoutId: "planned-2026-08-26-threshold",
      startedAt: "2026-08-26T17:30:00+01:00",
      status: "partial",
      summary: {
        distanceKm: 7.5,
        durationSeconds: 2_747,
        averagePaceSecondsPerKm: 366,
        averageHeartRateBpm: 169,
        activityKind: "outdoor_run",
        completedWorkRepetitions: 3,
        plannedWorkRepetitions: 5,
      },
      source: DEMO_SOURCE,
      laps: [
        {
          id: "lap-threshold-warmup",
          kind: "warmup",
          distanceKm: 2,
          paceSecondsPerKm: 375,
          averageHeartRateBpm: 130,
          maximumHeartRateBpm: 134,
        },
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
        {
          id: "lap-threshold-cooldown",
          kind: "cooldown",
          distanceKm: 1,
          paceSecondsPerKm: 390,
          averageHeartRateBpm: 142,
          maximumHeartRateBpm: 150,
        },
      ],
    },
  ],
  athleteFeedback: [
    {
      id: "athlete-feedback:seed-shin-discomfort",
      requestId: "seed-shin-discomfort",
      relatedWorkoutId: "planned-2026-08-23-long",
      relatedWorkoutResultId: "result-2026-08-23",
      rawText:
        "My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.",
      reported: {
        legFeel: "Right shin felt a little sore near the end.",
      },
      recordedAt: "2026-08-23T10:00:00+01:00",
    },
  ],
  coachingTopics: [
    {
      id: "coaching-topic:shin-discomfort",
      title: "Shin discomfort",
      status: "monitoring",
      athleteReport:
        "My right shin felt a little sore near the end of Sunday's long run. It was mild, but let's keep an eye on it.",
      firstReportedAt: "2026-08-23T10:00:00+01:00",
      latestReportedAt: "2026-08-23T10:00:00+01:00",
      evidenceRefs: [
        "athlete-feedback:athlete-feedback:seed-shin-discomfort",
        "workout-result:result-2026-08-23",
      ],
      followUpCondition: "The next Athlete report about a run.",
    },
  ],
  processedRequestIds: [],
  appliedReviewIds: [],
  adaptationReceipts: [],
  declinedAdaptations: [],
  mutationHistory: [],
} satisfies WorkspaceState;

export function createDemoWorkspaceState(): WorkspaceState {
  return deepFreeze(structuredClone(DEMO_WORKSPACE_STATE));
}
