import type {
  IsoDate,
  PlannedWorkout,
  TrainingPhaseHistoryRecord,
  WorkoutResult,
  WorkspaceState,
} from "../domain/types";
import {
  projectWorkoutResultMetrics,
  type WorkoutResultMetrics,
} from "./workoutResultMetrics";

const MILLISECONDS_PER_DAY = 86_400_000;
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type TodayRaceState = "normal" | "race_week" | "race_day" | "post_race";

export type TodayPlanStatus =
  | "today"
  | "completed"
  | "partial"
  | "stopped"
  | "missed"
  | "upcoming"
  | "rest";

export interface TodayPhaseSegment {
  id: string;
  phaseId: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  durationDays: number;
  widthPercent: number;
  elapsedPercent: number;
  active: boolean;
}

export interface TodayRaceProjection {
  state: TodayRaceState;
  daysRemaining: number;
  name: string;
  date: IsoDate;
  phaseSegments: TodayPhaseSegment[];
  phaseNames: string[];
  activePhaseId: string | null;
  activePhaseName: string;
  phaseCaption: string;
  progressPercent: number;
  elapsedBuildDays: number;
  totalBuildDays: number;
}

export interface TodayPlanDay {
  date: IsoDate;
  weekday: string;
  label: string;
  status: TodayPlanStatus;
  workout: PlannedWorkout | null;
  result: WorkoutResult | null;
}

export interface TodayPlanProjection {
  available: boolean;
  weekStart: IsoDate;
  weekEnd: IsoDate;
  days: TodayPlanDay[];
  calendarStart: IsoDate;
  calendarEnd: IsoDate;
  calendarDays: TodayPlanDay[];
}

export interface TodayWorkoutPrescription {
  targetPaceSecondsPerKm: { min: number; max: number } | null;
  recoverySeconds: number | null;
  distanceKm: number;
}

export type TodayResultMetrics = WorkoutResultMetrics;

export interface TodayRestWorkout {
  state: "rest";
  status: "rest";
  nextWorkout: PlannedWorkout | null;
}

export interface TodayPlannedWorkout {
  state: "planned";
  status: "today";
  workout: PlannedWorkout;
  result: null;
  prescription: TodayWorkoutPrescription;
}

export interface TodayResultWorkout {
  state: "result";
  status: WorkoutResult["status"];
  workout: PlannedWorkout;
  result: WorkoutResult;
  metrics: TodayResultMetrics;
}

export type TodayWorkoutProjection =
  TodayRestWorkout | TodayPlannedWorkout | TodayResultWorkout;

export interface TodayPaneProjection {
  today: IsoDate;
  race: TodayRaceProjection;
  hasPendingProposal: boolean;
  plan: TodayPlanProjection;
  todayWorkout: TodayWorkoutProjection;
}

function dateFromInstant(now: string, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).formatToParts(new Date(now));
  const values = new Map(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}` as IsoDate;
}

function dateValue(date: IsoDate) {
  return Date.parse(`${date}T00:00:00Z`);
}

function daysBetween(from: IsoDate, to: IsoDate) {
  return Math.round((dateValue(to) - dateValue(from)) / MILLISECONDS_PER_DAY);
}

function addDays(date: IsoDate, days: number): IsoDate {
  const value = new Date(dateValue(date));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10) as IsoDate;
}

function mondayOf(date: IsoDate): IsoDate {
  const value = new Date(dateValue(date));
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10) as IsoDate;
}

function dateLabel(date: IsoDate) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function sortByDate<T extends { date: IsoDate }>(items: readonly T[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.date.localeCompare(b.item.date) || a.index - b.index)
    .map(({ item }) => item);
}

function sortWorkouts(workouts: readonly PlannedWorkout[]) {
  return sortByDate(workouts);
}

function activePhase(
  history: readonly TrainingPhaseHistoryRecord[],
  today: IsoDate,
  fallbackName: string,
) {
  const eligible = sortByDate(history).filter(({ date }) => date <= today);
  const record = eligible.at(-1);
  return {
    id: record?.phaseId ?? null,
    name: record?.name ?? fallbackName,
  };
}

function buildRaceProjection(state: WorkspaceState, today: IsoDate) {
  const { buildStartDate } = state.trainingPlan;
  const raceDate = state.targetRace.date;
  const daysRemaining = daysBetween(today, raceDate);
  const stateName: TodayRaceState =
    daysRemaining < 0
      ? "post_race"
      : daysRemaining === 0
        ? "race_day"
        : daysRemaining <= 7
          ? "race_week"
          : "normal";
  const totalBuildDays = Math.max(0, daysBetween(buildStartDate, raceDate));
  const elapsedBuildDays = Math.min(
    totalBuildDays,
    Math.max(0, daysBetween(buildStartDate, today)),
  );
  const progressPercent =
    totalBuildDays === 0 ? 0 : (elapsedBuildDays / totalBuildDays) * 100;
  const history = sortByDate(state.trainingPhaseHistory);
  const active = activePhase(history, today, state.trainingPhase.name);
  const phaseSegments = history.flatMap((record, index) => {
    const startDate =
      record.date < buildStartDate ? buildStartDate : record.date;
    const nextRecord = history[index + 1];
    const endDate =
      nextRecord && nextRecord.date < raceDate ? nextRecord.date : raceDate;
    const durationDays = daysBetween(startDate, endDate);
    if (durationDays <= 0 || startDate >= raceDate) return [];
    const elapsedPercent =
      today <= startDate
        ? 0
        : today >= endDate
          ? 100
          : (daysBetween(startDate, today) / durationDays) * 100;
    return [
      {
        id: record.id,
        phaseId: record.phaseId,
        name: record.name,
        startDate,
        endDate,
        durationDays,
        widthPercent:
          totalBuildDays === 0 ? 0 : (durationDays / totalBuildDays) * 100,
        elapsedPercent,
        active: active.id === record.phaseId && record.date <= today,
      } satisfies TodayPhaseSegment,
    ];
  });
  const totalBuildDayCount = totalBuildDays + 1;
  const currentBuildDay = elapsedBuildDays + 1;
  return {
    state: stateName,
    daysRemaining,
    name: state.targetRace.name,
    date: raceDate,
    phaseSegments,
    phaseNames: phaseSegments.map(({ name }) => name),
    activePhaseId: active.id,
    activePhaseName: active.name,
    phaseCaption: `${active.name.toUpperCase()} · DAY ${currentBuildDay} OF ${totalBuildDayCount}`,
    progressPercent,
    elapsedBuildDays,
    totalBuildDays,
  } satisfies TodayRaceProjection;
}

function prescriptionFor(workout: PlannedWorkout): TodayWorkoutPrescription {
  const repeatBlock = workout.prescription.blocks.find(
    (block) => block.kind === "repeat",
  );
  return {
    targetPaceSecondsPerKm:
      repeatBlock?.kind === "repeat"
        ? { ...repeatBlock.targetPaceSecondsPerKm }
        : null,
    recoverySeconds:
      repeatBlock?.kind === "repeat" ? repeatBlock.recoverySeconds : null,
    distanceKm: workout.distanceKm,
  };
}

function statusFor(
  date: IsoDate,
  today: IsoDate,
  result: WorkoutResult | null,
): TodayPlanStatus {
  if (result) return result.status;
  if (date === today) return "today";
  return date < today ? "missed" : "upcoming";
}

function buildPlanProjection(state: WorkspaceState, today: IsoDate) {
  const workouts = sortWorkouts(state.trainingPlan.plannedWorkouts);
  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 6);
  const calendarStart = state.trainingPlan.buildStartDate;
  const calendarEnd = state.targetRace.date;
  const buildDay = (date: IsoDate) => {
    const workout =
      workouts.find(({ date: workoutDate }) => workoutDate === date) ?? null;
    const result = workout
      ? (state.workoutResults.find(
          ({ plannedWorkoutId }) => plannedWorkoutId === workout.id,
        ) ?? null)
      : null;
    return {
      date,
      weekday: DAY_NAMES[(new Date(dateValue(date)).getUTCDay() + 6) % 7],
      label: dateLabel(date),
      status: workout ? statusFor(date, today, result) : "rest",
      workout,
      result,
    } satisfies TodayPlanDay;
  };
  const calendarDays = Array.from(
    { length: daysBetween(calendarStart, calendarEnd) + 1 },
    (_, index) => buildDay(addDays(calendarStart, index)),
  );
  const days = Array.from({ length: 7 }, (_, index) =>
    buildDay(addDays(weekStart, index)),
  );
  return {
    available: workouts.length > 0,
    weekStart,
    weekEnd,
    days,
    calendarStart,
    calendarEnd,
    calendarDays,
  } satisfies TodayPlanProjection;
}

function buildTodayWorkout(
  state: WorkspaceState,
  today: IsoDate,
  sortedWorkouts: readonly PlannedWorkout[],
): TodayWorkoutProjection {
  const workout = sortedWorkouts.find(({ date }) => date === today);
  if (!workout) {
    return {
      state: "rest",
      status: "rest",
      nextWorkout: sortedWorkouts.find(({ date }) => date > today) ?? null,
    };
  }
  const result =
    state.workoutResults.find(
      ({ plannedWorkoutId }) => plannedWorkoutId === workout.id,
    ) ?? null;
  if (!result) {
    return {
      state: "planned",
      status: "today",
      workout,
      result: null,
      prescription: prescriptionFor(workout),
    };
  }
  return {
    state: "result",
    status: result.status,
    workout,
    result,
    metrics: projectWorkoutResultMetrics(result),
  };
}

export function selectTodayPane(state: WorkspaceState): TodayPaneProjection {
  const today = dateFromInstant(state.clock.now, state.clock.timeZone);
  const sortedWorkouts = sortWorkouts(state.trainingPlan.plannedWorkouts);
  return {
    today,
    race: buildRaceProjection(state, today),
    hasPendingProposal: state.pendingAdaptationProposal !== undefined,
    plan: buildPlanProjection(state, today),
    todayWorkout: buildTodayWorkout(state, today, sortedWorkouts),
  };
}
