import type {
  AppliedPlanAdaptation,
  Athlete,
  AthleteFeedback,
  CoachingTopic,
  IsoDate,
  PlannedWorkout,
  SyntheticCorosShapedSnapshot,
  TargetRace,
  TrainingPhase,
  WorkoutResult,
  WorkspaceState,
} from "../domain/types";

export type EvidenceSource =
  "app_owned" | "athlete_owned" | "synthetic_observation";

export interface ApplicationError {
  status: "error";
  code: "invalid_input" | "not_found";
  message: string;
  retryable: false;
}

export interface ReadSuccess<T> {
  status: "ok";
  contractVersion: "1.1";
  fixtureVersion: "demo-athlete-v1";
  data: T;
  evidenceRefs: string[];
}

export type ReadResult<T> = ReadSuccess<T> | ApplicationError;

export interface AthleteContextData {
  asOf: string;
  athlete: Athlete;
  targetRace: TargetRace;
  trainingPhase: TrainingPhase;
  recentTraining: WorkoutResult[];
  observations: SyntheticCorosShapedSnapshot;
  trainingPlan: {
    planVersion: number;
    currentWeek: { from: IsoDate; to: IsoDate };
    currentWeekPlannedWorkouts: Array<
      Pick<PlannedWorkout, "id" | "date" | "type" | "title" | "purpose">
    >;
  };
  recentAthleteFeedback: AthleteFeedback[];
  activeCoachingTopics: CoachingTopic[];
  recentAdaptationHistory: AppliedPlanAdaptation[];
  sources: {
    athlete: EvidenceSource;
    targetRace: EvidenceSource;
    trainingPhase: EvidenceSource;
    recentTraining: EvidenceSource;
    observations: EvidenceSource;
  };
}

export interface TrainingPlanData {
  planVersion: number;
  range: { from: IsoDate; to: IsoDate };
  plannedWorkouts: PlannedWorkout[];
  source: "app_owned";
}

export interface WorkoutContextData {
  plannedWorkout: PlannedWorkout;
  workoutResult: WorkoutResult | null;
  athleteFeedback: AthleteFeedback[];
  sources: {
    plannedWorkout: EvidenceSource;
    workoutResult: EvidenceSource | null;
    athleteFeedback: EvidenceSource;
  };
}

function success<T>(data: T, evidenceRefs: string[]): ReadSuccess<T> {
  return {
    status: "ok",
    contractVersion: "1.1",
    fixtureVersion: "demo-athlete-v1",
    data,
    evidenceRefs,
  };
}

function invalidInput(message: string): ApplicationError {
  return {
    status: "error",
    code: "invalid_input",
    message,
    retryable: false,
  };
}

function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function selectAthleteContext(
  state: WorkspaceState,
): ReadSuccess<AthleteContextData> {
  const plan = [...state.trainingPlan.plannedWorkouts].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const today = state.clock.now.slice(0, 10) as IsoDate;
  const currentDate = new Date(`${today}T00:00:00Z`);
  const daysSinceMonday = (currentDate.getUTCDay() + 6) % 7;
  const weekStart = new Date(currentDate);
  weekStart.setUTCDate(currentDate.getUTCDate() - daysSinceMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const from = weekStart.toISOString().slice(0, 10) as IsoDate;
  const to = weekEnd.toISOString().slice(0, 10) as IsoDate;
  const currentWeekPlannedWorkouts = plan
    .filter(({ date }) => date >= from && date <= to)
    .map(({ id, date, type, title, purpose }) => ({
      id,
      date,
      type,
      title,
      purpose,
    }));
  const recentAthleteFeedback = [...state.athleteFeedback]
    .sort(
      (a, b) =>
        Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
        b.id.localeCompare(a.id),
    )
    .slice(0, 5)
    .map((feedback) => structuredClone(feedback));
  const activeCoachingTopics = state.coachingTopics
    .filter(({ status }) => status === "monitoring")
    .map((topic) => structuredClone(topic));
  const recentAdaptationHistory = [...state.adaptationReceipts]
    .sort(
      (a, b) =>
        Date.parse(b.appliedAt) - Date.parse(a.appliedAt) ||
        b.reviewId.localeCompare(a.reviewId),
    )
    .slice(0, 3)
    .map((receipt) => structuredClone(receipt));

  return success(
    {
      asOf: state.observations.asOf,
      athlete: structuredClone(state.athlete),
      targetRace: structuredClone(state.targetRace),
      trainingPhase: structuredClone(state.trainingPhase),
      recentTraining: structuredClone(state.workoutResults),
      observations: structuredClone(state.observations),
      trainingPlan: {
        planVersion: state.trainingPlan.planVersion,
        currentWeek: { from, to },
        currentWeekPlannedWorkouts,
      },
      recentAthleteFeedback,
      activeCoachingTopics,
      recentAdaptationHistory,
      sources: {
        athlete: "athlete_owned",
        targetRace: "app_owned",
        trainingPhase: "app_owned",
        recentTraining: "synthetic_observation",
        observations: "synthetic_observation",
      },
    },
    [
      `athlete:${state.athlete.id}`,
      `target-race:${state.targetRace.id}`,
      `training-phase:${state.trainingPhase.id}`,
      "observation:training-load",
      "observation:recovery",
      "observation:sleep",
      "observation:sleep-hrv",
      "observation:resting-heart-rate",
      "observation:daily-stress",
      ...state.workoutResults.map(({ id }) => `workout-result:${id}`),
      `training-plan:version:${state.trainingPlan.planVersion}`,
      ...currentWeekPlannedWorkouts.map(({ id }) => `planned-workout:${id}`),
      ...recentAthleteFeedback.map(({ id }) => `athlete-feedback:${id}`),
      ...activeCoachingTopics.map(({ id }) => `coaching-topic:${id}`),
      ...recentAdaptationHistory.map(
        ({ reviewId }) => `plan-adaptation:${reviewId}`,
      ),
    ],
  );
}

export function selectTrainingPlan(
  state: WorkspaceState,
  input: { from: unknown; to: unknown },
): ReadResult<TrainingPlanData> {
  const { from, to } = input;
  if (!isIsoDate(from)) {
    return invalidInput("from must be a valid date in YYYY-MM-DD format.");
  }
  if (!isIsoDate(to)) {
    return invalidInput("to must be a valid date in YYYY-MM-DD format.");
  }
  if (from > to) {
    return invalidInput("from must be on or before to.");
  }

  const plannedWorkouts = state.trainingPlan.plannedWorkouts.filter(
    ({ date }) => date >= from && date <= to,
  );
  return success(
    {
      planVersion: state.trainingPlan.planVersion,
      range: { from, to },
      plannedWorkouts,
      source: "app_owned",
    },
    [
      `training-plan:version:${state.trainingPlan.planVersion}`,
      ...plannedWorkouts.map(({ id }) => `planned-workout:${id}`),
    ],
  );
}

export function selectWorkoutContext(
  state: WorkspaceState,
  input: { workoutId: unknown },
): ReadResult<WorkoutContextData> {
  if (typeof input.workoutId !== "string" || input.workoutId.trim() === "") {
    return invalidInput("workoutId must be a non-empty Planned Workout ID.");
  }

  const plannedWorkout = state.trainingPlan.plannedWorkouts.find(
    ({ id }) => id === input.workoutId,
  );
  if (!plannedWorkout) {
    return {
      status: "error",
      code: "not_found",
      message: `No Planned Workout was found for workoutId ${input.workoutId}.`,
      retryable: false,
    };
  }

  const workoutResult =
    state.workoutResults.find(
      ({ plannedWorkoutId }) => plannedWorkoutId === plannedWorkout.id,
    ) ?? null;
  const athleteFeedback = state.athleteFeedback.filter(
    ({ relatedWorkoutId }) =>
      relatedWorkoutId === plannedWorkout.id ||
      relatedWorkoutId === workoutResult?.id,
  );

  return success(
    {
      plannedWorkout,
      workoutResult,
      athleteFeedback,
      sources: {
        plannedWorkout: "app_owned",
        workoutResult: workoutResult ? "synthetic_observation" : null,
        athleteFeedback: "athlete_owned",
      },
    },
    [
      `planned-workout:${plannedWorkout.id}`,
      ...(workoutResult ? [`workout-result:${workoutResult.id}`] : []),
      ...athleteFeedback.map(({ id }) => `athlete-feedback:${id}`),
    ],
  );
}
