import type {
  Athlete,
  AthleteFeedback,
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
  return success(
    {
      asOf: state.observations.asOf,
      athlete: state.athlete,
      targetRace: state.targetRace,
      trainingPhase: state.trainingPhase,
      recentTraining: state.workoutResults,
      observations: state.observations,
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
