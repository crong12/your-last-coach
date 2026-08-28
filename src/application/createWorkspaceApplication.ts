import type { WorkspaceRepository } from "./ports";
import type { Durability } from "./ports";
import type {
  CoachingContextSource,
  IsoDate,
  PlannedWorkout,
  WorkspaceState,
} from "../domain/types";
import { deepFreeze } from "../domain/immutable";
import {
  selectAthleteContext,
  selectTrainingPlan,
  selectWorkoutContext,
  type AthleteContextData,
  type ReadResult,
  type ReadSuccess,
  type TrainingPlanData,
  type WorkoutContextData,
} from "./readSelectors";

interface CreateWorkspaceApplicationOptions {
  initialState: WorkspaceState;
  fixtureSource: CoachingContextSource;
  repository: WorkspaceRepository;
}

type CalendarQuery =
  | { type: "get_week_training_plan"; weekStart: IsoDate }
  | { type: "get_month_training_plan"; month: `${number}-${number}` };

type TrainingPlanQueryResult = {
  planVersion: number;
  plannedWorkouts: PlannedWorkout[];
};

type WorkspaceCommand = { type: "reset_demo" };

export interface WorkspaceApplication {
  getState(): WorkspaceState;
  query(query: CalendarQuery): TrainingPlanQueryResult;
  query(query: {
    type: "get_athlete_context";
  }): ReadSuccess<AthleteContextData>;
  query(query: {
    type: "get_training_plan";
    from: unknown;
    to: unknown;
  }): ReadResult<TrainingPlanData>;
  query(query: {
    type: "get_workout_context";
    workoutId: unknown;
  }): ReadResult<WorkoutContextData>;
  command(command: WorkspaceCommand): Promise<{
    status: "reset";
    durability: Durability;
  }>;
  subscribe(listener: () => void): () => void;
}

function addDays(date: IsoDate, days: number): IsoDate {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10) as IsoDate;
}

export function createWorkspaceApplication(
  options: CreateWorkspaceApplicationOptions,
): WorkspaceApplication {
  let state = deepFreeze(structuredClone(options.initialState));
  const listeners = new Set<() => void>();

  const query = ((
    query:
      | CalendarQuery
      | {
          type: "get_athlete_context";
        }
      | {
          type: "get_training_plan";
          from: unknown;
          to: unknown;
        }
      | {
          type: "get_workout_context";
          workoutId: unknown;
        },
  ) => {
    if (query.type === "get_athlete_context") {
      return selectAthleteContext(state);
    }
    if (query.type === "get_training_plan") {
      return selectTrainingPlan(state, query);
    }
    if (query.type === "get_workout_context") {
      return selectWorkoutContext(state, query);
    }

    const plannedWorkouts = state.trainingPlan.plannedWorkouts;
    if (query.type === "get_week_training_plan") {
      const weekEnd = addDays(query.weekStart, 6);
      return {
        planVersion: state.trainingPlan.planVersion,
        plannedWorkouts: plannedWorkouts.filter(
          ({ date }) => date >= query.weekStart && date <= weekEnd,
        ),
      };
    }
    return {
      planVersion: state.trainingPlan.planVersion,
      plannedWorkouts: plannedWorkouts.filter(({ date }) =>
        date.startsWith(`${query.month}-`),
      ),
    };
  }) as WorkspaceApplication["query"];

  return {
    getState() {
      return state;
    },
    query,
    async command(_command) {
      let durability: Durability = "persistent";
      try {
        await options.repository.clear();
      } catch {
        durability = "memory_only";
      }
      durability = options.repository.durability ?? durability;
      state = await options.fixtureSource.loadContext();
      listeners.forEach((listener) => listener());
      return { status: "reset", durability };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
