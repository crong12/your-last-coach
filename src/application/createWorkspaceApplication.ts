import type { WorkspaceRepository } from "./ports";
import type { Durability } from "./ports";
import type {
  CoachingContextSource,
  AthleteFeedback,
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

type WorkspaceCommand =
  | { type: "reset_demo" }
  | {
      type: "record_athlete_feedback";
      requestId: unknown;
      relatedWorkoutId: unknown;
      rawText: unknown;
      reported?: unknown;
    };

type CommandError = {
  status: "error";
  code: "invalid_input" | "not_found";
  message: string;
  retryable: false;
};

type RecordFeedbackResult =
  | {
      status: "ok";
      feedback: AthleteFeedback;
      durability: Durability;
    }
  | CommandError;

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
  command(command: { type: "reset_demo" }): Promise<{
    status: "reset";
    durability: Durability;
  }>;
  command(
    command: Extract<WorkspaceCommand, { type: "record_athlete_feedback" }>,
  ): Promise<RecordFeedbackResult>;
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

  const invalidFeedback = (message: string): CommandError => ({
    status: "error",
    code: "invalid_input",
    message,
    retryable: false,
  });

  const normalizeReported = (
    value: unknown,
  ): {
    value?: NonNullable<AthleteFeedback["reported"]>;
    error?: CommandError;
  } => {
    if (value === undefined) return {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        error: invalidFeedback("reported must be an object when provided."),
      };
    }
    const reported = value as Record<string, unknown>;
    const accepted = ["sessionRpe", "legFeel", "painReported", "stoppedReason"];
    if (Object.keys(reported).some((key) => !accepted.includes(key))) {
      return {
        error: invalidFeedback("reported contains an unsupported field."),
      };
    }
    const normalized: NonNullable<AthleteFeedback["reported"]> = {};
    if (reported.sessionRpe !== undefined) {
      if (
        typeof reported.sessionRpe !== "number" ||
        !Number.isFinite(reported.sessionRpe) ||
        reported.sessionRpe < 0 ||
        reported.sessionRpe > 10
      ) {
        return {
          error: invalidFeedback(
            "reported.sessionRpe must be a finite number from 0 through 10.",
          ),
        };
      }
      normalized.sessionRpe = reported.sessionRpe;
    }
    for (const field of ["legFeel", "stoppedReason"] as const) {
      if (reported[field] !== undefined) {
        if (
          typeof reported[field] !== "string" ||
          reported[field].trim() === ""
        ) {
          return {
            error: invalidFeedback(
              `reported.${field} must be a non-empty string when provided.`,
            ),
          };
        }
        normalized[field] = reported[field].trim();
      }
    }
    if (reported.painReported !== undefined) {
      if (typeof reported.painReported !== "boolean") {
        return {
          error: invalidFeedback(
            "reported.painReported must be a boolean when provided.",
          ),
        };
      }
      normalized.painReported = reported.painReported;
    }
    return { value: normalized };
  };

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
    command: (async (command: WorkspaceCommand) => {
      if (command.type === "record_athlete_feedback") {
        if (
          typeof command.requestId !== "string" ||
          command.requestId.trim() === ""
        ) {
          return invalidFeedback("requestId must be a non-empty string.");
        }
        const existing = state.athleteFeedback.find(
          ({ requestId }) => requestId === command.requestId,
        );
        if (existing) {
          return {
            status: "ok",
            feedback: existing,
            durability: options.repository.durability ?? "persistent",
          };
        }
        if (
          typeof command.relatedWorkoutId !== "string" ||
          command.relatedWorkoutId.trim() === ""
        ) {
          return invalidFeedback(
            "relatedWorkoutId must be a non-empty Planned Workout ID.",
          );
        }
        if (
          !state.trainingPlan.plannedWorkouts.some(
            ({ id }) => id === command.relatedWorkoutId,
          )
        ) {
          return {
            status: "error",
            code: "not_found",
            message: `No Planned Workout was found for relatedWorkoutId ${command.relatedWorkoutId}.`,
            retryable: false,
          };
        }
        if (
          typeof command.rawText !== "string" ||
          command.rawText.trim() === ""
        ) {
          return invalidFeedback("rawText must be a non-empty string.");
        }
        const normalized = normalizeReported(command.reported);
        if (normalized.error) return normalized.error;

        const feedback: AthleteFeedback = {
          id: `athlete-feedback:${command.requestId}`,
          requestId: command.requestId,
          relatedWorkoutId: command.relatedWorkoutId,
          rawText: command.rawText,
          ...(command.reported === undefined
            ? {}
            : { reported: normalized.value ?? {} }),
          recordedAt: state.clock.now,
        };
        state = deepFreeze({
          ...state,
          athleteFeedback: [...state.athleteFeedback, feedback],
          processedRequestIds: [
            ...state.processedRequestIds,
            command.requestId,
          ],
        });
        listeners.forEach((listener) => listener());
        let durability: Durability = "persistent";
        try {
          durability = await options.repository.save({
            schemaVersion: 1,
            seedVersion: "demo-athlete-v1",
            savedAt: state.clock.now,
            state,
          });
        } catch {
          durability = "memory_only";
        }
        return { status: "ok", feedback, durability };
      }
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
    }) as WorkspaceApplication["command"],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
