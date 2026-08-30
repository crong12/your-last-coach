import type {
  PlannedWorkout,
  ReadinessHistoryRecord,
  TrainingPhaseHistoryRecord,
  WorkoutBlock,
  WorkoutResult,
  WorkspaceState,
} from "../domain/types";
import type {
  AdaptationAnnotation,
  ChartAnnotation,
  ChartPoint,
  PhaseAnnotation,
  RaceAnnotation,
} from "../ui/charts/chartTypes";

export type TrendsRange = "4w" | "12w" | "build";
export type ReadinessMetric = "hrv" | "restingHeartRate" | "sleep";

export interface TrendsDateRange {
  range: TrendsRange;
  from: string;
  to: string;
  evidenceTo: string;
  expectedDays: number;
  dates: readonly string[];
  weekStarts: readonly string[];
}

export type TrendsProjectionStatus =
  "ready" | "partial" | "degraded" | "empty" | "unavailable";

export interface ReadinessProjection {
  status: "ready" | "partial" | "empty" | "unavailable";
  metric: ReadinessMetric;
  points: readonly ChartPoint[];
  coverage: { observed: number; expected: number };
  latest: ChartPoint | null;
  average: number | null;
  records: readonly (ReadinessHistoryRecord | undefined)[];
}

export interface WeeklyVolumeLoadWeek {
  weekStart: string;
  weekEnd: string;
  distanceKm: number;
  trainingLoad: number | null;
  resultCount: number;
  availableLoadCount: number;
  fourWeekAverageLoad: number | null;
}

export interface WeeklyVolumeLoadProjection {
  status: TrendsProjectionStatus;
  weeks: readonly WeeklyVolumeLoadWeek[];
  coverage: { availableLoads: number; results: number };
}

export interface PaceHeartRatePoint {
  workoutResultId: string;
  plannedWorkoutId?: string;
  date: string;
  title: string;
  paceSecondsPerKm: number;
  heartRateBpm: number;
}

export interface PaceHeartRateProjection {
  status: TrendsProjectionStatus;
  points: readonly PaceHeartRatePoint[];
  excludedOutdoorRuns: number;
  selected: PaceHeartRatePoint | null;
}

export interface RepeatedSessionSummary {
  distanceKm: number | null;
  durationSeconds: number | null;
  trainingLoad: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
}

export interface RepeatedSessionGroup {
  key: string;
  label: string;
  attemptCount: number;
  latestResult: WorkoutResult;
  latestSummary: RepeatedSessionSummary;
  plannedWorkoutId: string;
  degraded: boolean;
}

export interface RepeatedSessionsProjection {
  status: TrendsProjectionStatus;
  groups: readonly RepeatedSessionGroup[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
    ? null
    : parsed;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const parsed = parseDate(date);
  if (!parsed) return date;
  return dateString(new Date(parsed.getTime() + days * DAY_MS));
}

function inclusiveDates(from: string, to: string): string[] {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  for (
    let cursor = start.getTime();
    cursor <= end.getTime();
    cursor += DAY_MS
  ) {
    dates.push(dateString(new Date(cursor)));
  }
  return dates;
}

function localDateForInstant(value: string, timeZone: string): string | null {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: part }) => [type, part]),
  );
  if (!values.year || !values.month || !values.day) return null;
  return `${values.year}-${values.month}-${values.day}`;
}

function clockDate(state: WorkspaceState): string {
  return (
    localDateForInstant(state.clock.now, state.clock.timeZone) ??
    state.clock.now.slice(0, 10)
  );
}

function mondayOnOrBefore(date: string): string {
  const parsed = parseDate(date);
  if (!parsed) return date;
  const day = parsed.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

function weeklyStartsForRange(
  range: TrendsRange,
  from: string,
  to: string,
): string[] {
  if (range === "build") {
    const starts: string[] = [];
    for (
      let start = mondayOnOrBefore(from);
      start <= mondayOnOrBefore(to);
      start = addDays(start, 7)
    ) {
      starts.push(start);
    }
    return starts;
  }
  const count = range === "4w" ? 4 : 12;
  const end = mondayOnOrBefore(to);
  return Array.from({ length: count }, (_, index) =>
    addDays(end, -7 * (count - index - 1)),
  );
}

export function resolveTrendsRange(
  state: WorkspaceState,
  range: TrendsRange,
): TrendsDateRange {
  const clock = clockDate(state);
  let from = addDays(clock, range === "4w" ? -27 : -83);
  let to = clock;
  if (range === "build") {
    from = state.trainingPlan.buildStartDate;
    to = state.targetRace.date;
  }
  const evidenceTo = range === "build" && clock < to ? clock : to;
  const dates = inclusiveDates(from, evidenceTo);
  return {
    range,
    from,
    to,
    evidenceTo,
    expectedDays: dates.length,
    dates,
    weekStarts: weeklyStartsForRange(range, from, evidenceTo),
  };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validReadinessHistory(
  value: unknown,
): value is readonly ReadinessHistoryRecord[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  let previous: string | null = null;
  for (const record of value) {
    if (
      typeof record !== "object" ||
      record === null ||
      typeof record.date !== "string" ||
      parseDate(record.date) === null ||
      !validEvidenceSource(record.source) ||
      !validOptionalPositive(record.hrvMs) ||
      !validOptionalPositive(record.restingHeartRateBpm) ||
      !validReadinessSleep(record.sleep) ||
      seen.has(record.date) ||
      (previous !== null && record.date <= previous)
    ) {
      return false;
    }
    seen.add(record.date);
    previous = record.date;
  }
  return true;
}

function validEvidenceSource(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.adapter === "synthetic-coros-shaped" &&
    typeof candidate.readAt === "string" &&
    !Number.isNaN(Date.parse(candidate.readAt)) &&
    parseDate(candidate.readAt.slice(0, 10)) !== null &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      candidate.readAt,
    ) &&
    candidate.label === "seeded synthetic COROS-shaped observations"
  );
}

function validOptionalPositive(value: unknown): boolean {
  return value === undefined || value === null || (finite(value) && value > 0);
}

function validReadinessSleep(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object" || value === null) return false;
  const sleep = value as Record<string, unknown>;
  if (!validOptionalPositive(sleep.durationMinutes)) return false;
  if (sleep.stages === undefined || sleep.stages === null) return true;
  if (typeof sleep.stages !== "object" || sleep.stages === null) return false;
  const stages = sleep.stages as Record<string, unknown>;
  return ["deepRatio", "lightRatio", "remRatio", "awakeRatio"].every((key) => {
    const ratio = stages[key];
    return (
      ratio === undefined ||
      ratio === null ||
      (finite(ratio) && ratio >= 0 && ratio <= 1)
    );
  });
}

function readinessValue(
  record: ReadinessHistoryRecord | undefined,
  metric: ReadinessMetric,
): number | null {
  const value =
    metric === "hrv"
      ? record?.hrvMs
      : metric === "restingHeartRate"
        ? record?.restingHeartRateBpm
        : record?.sleep?.durationMinutes;
  return finite(value) ? value : null;
}

function latestPoint(points: readonly ChartPoint[]): ChartPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (finite(points[index].value)) return points[index];
  }
  return null;
}

export function projectReadinessSeries(
  state: WorkspaceState,
  metric: ReadinessMetric,
  range: TrendsRange,
): ReadinessProjection {
  const window = resolveTrendsRange(state, range);
  const history = state.observations?.readinessHistory;
  if (!validReadinessHistory(history)) {
    return {
      status: "unavailable",
      metric,
      points: [],
      coverage: { observed: 0, expected: window.expectedDays },
      latest: null,
      average: null,
      records: [],
    };
  }
  const byDate = new Map<string, ReadinessHistoryRecord>(
    history.map((record) => [record.date, record]),
  );
  const points = window.dates.map((date) => ({
    date,
    value: readinessValue(byDate.get(date), metric),
  }));
  const records = window.dates.map((date) => byDate.get(date));
  const observed = points.filter(({ value }) => finite(value));
  const trailingObserved = points
    .slice(-7)
    .filter(({ value }) => finite(value));
  const average =
    trailingObserved.length === 0
      ? null
      : Math.round(
          trailingObserved.reduce(
            (total, point) => total + (point.value as number),
            0,
          ) / trailingObserved.length,
        );
  return {
    status:
      observed.length === 0
        ? "empty"
        : observed.length === points.length
          ? "ready"
          : "partial",
    metric,
    points,
    coverage: { observed: observed.length, expected: points.length },
    latest: latestPoint(points),
    average,
    records,
  };
}

function validWorkoutResult(result: unknown): result is WorkoutResult {
  if (typeof result !== "object" || result === null) return false;
  const candidate = result as WorkoutResult;
  const summary = candidate.summary;
  if (typeof summary !== "object" || summary === null) return false;
  const extendedSummary = summary as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.plannedWorkoutId === undefined ||
      typeof candidate.plannedWorkoutId === "string") &&
    typeof candidate.startedAt === "string" &&
    parseDate(candidate.startedAt.slice(0, 10)) !== null &&
    !Number.isNaN(Date.parse(candidate.startedAt)) &&
    (candidate.status === "completed" ||
      candidate.status === "partial" ||
      candidate.status === "stopped") &&
    Array.isArray(candidate.laps) &&
    finite(extendedSummary.distanceKm) &&
    extendedSummary.distanceKm > 0 &&
    validOptionalPositive(extendedSummary.durationSeconds) &&
    validOptionalNonNegative(extendedSummary.trainingLoad) &&
    validOptionalPositive(extendedSummary.averagePaceSecondsPerKm) &&
    validOptionalPositive(extendedSummary.averageHeartRateBpm) &&
    validOptionalNonNegative(extendedSummary.completedWorkRepetitions) &&
    validOptionalPositiveInteger(extendedSummary.plannedWorkRepetitions) &&
    validActivityKind(extendedSummary.activityKind) &&
    validOptionalResultSource(candidate.source, extendedSummary)
  );
}

function validOptionalNonNegative(value: unknown): boolean {
  return value === undefined || value === null || (finite(value) && value >= 0);
}

function validOptionalPositiveInteger(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (finite(value) && Number.isInteger(value) && value > 0)
  );
}

function validActivityKind(value: unknown): boolean {
  return (
    value === undefined ||
    value === "outdoor_run" ||
    value === "indoor_run" ||
    value === "trail_run" ||
    value === "other"
  );
}

function hasPaceClassification(result: WorkoutResult): boolean {
  return (
    result.summary.activityKind !== undefined &&
    validActivityKind(result.summary.activityKind)
  );
}

function validOptionalResultSource(
  source: unknown,
  summary: Record<string, unknown>,
): boolean {
  const hasExtendedSummary = [
    summary.durationSeconds,
    summary.trainingLoad,
    summary.averagePaceSecondsPerKm,
    summary.averageHeartRateBpm,
    summary.activityKind,
  ].some((value) => value !== undefined);
  return !hasExtendedSummary || validEvidenceSource(source);
}

function resultDate(result: WorkoutResult, timeZone: string): string {
  return (
    localDateForInstant(result.startedAt, timeZone) ??
    result.startedAt.slice(0, 10)
  );
}

function resultInWindow(
  result: WorkoutResult,
  window: TrendsDateRange,
  timeZone: string,
): boolean {
  const date = resultDate(result, timeZone);
  return date >= window.from && date <= window.evidenceTo;
}

function validWorkoutBlock(block: unknown): block is WorkoutBlock {
  if (typeof block !== "object" || block === null) return false;
  const candidate = block as Record<string, unknown>;
  if (
    candidate.kind === "warmup" ||
    candidate.kind === "cooldown" ||
    candidate.kind === "easy"
  ) {
    return finite(candidate.distanceKm) && candidate.distanceKm > 0;
  }
  if (candidate.kind !== "repeat") return false;
  const pace = candidate.targetPaceSecondsPerKm;
  return (
    finite(candidate.repetitions) &&
    Number.isInteger(candidate.repetitions) &&
    candidate.repetitions > 0 &&
    finite(candidate.workDistanceKm) &&
    candidate.workDistanceKm > 0 &&
    finite(candidate.recoverySeconds) &&
    candidate.recoverySeconds >= 0 &&
    typeof pace === "object" &&
    pace !== null &&
    finite((pace as Record<string, unknown>).min) &&
    finite((pace as Record<string, unknown>).max) &&
    (pace as Record<string, number>).min > 0 &&
    (pace as Record<string, number>).max >= (pace as Record<string, number>).min
  );
}

function validPlannedWorkoutAuthority(value: unknown): value is PlannedWorkout {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as PlannedWorkout;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.date === "string" &&
    parseDate(candidate.date) !== null &&
    typeof candidate.type === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.prescription === "object" &&
    candidate.prescription !== null &&
    Array.isArray(candidate.prescription.blocks) &&
    candidate.prescription.blocks.length > 0 &&
    candidate.prescription.blocks.every(validWorkoutBlock)
  );
}

function validTrainingPlanAuthority(state: WorkspaceState): boolean {
  const plan = state.trainingPlan;
  const plannedWorkouts =
    typeof plan === "object" &&
    plan !== null &&
    Array.isArray(plan.plannedWorkouts)
      ? plan.plannedWorkouts
      : [];
  const workoutIds = new Set<string>();
  return (
    typeof plan === "object" &&
    plan !== null &&
    typeof plan.buildStartDate === "string" &&
    parseDate(plan.buildStartDate) !== null &&
    typeof state.targetRace?.date === "string" &&
    parseDate(state.targetRace.date) !== null &&
    plan.buildStartDate <= state.targetRace.date &&
    plannedWorkouts.length > 0 &&
    plannedWorkouts.every((workout) => {
      if (
        !validPlannedWorkoutAuthority(workout) ||
        workoutIds.has(workout.id)
      ) {
        return false;
      }
      workoutIds.add(workout.id);
      return true;
    })
  );
}

export function projectWeeklyVolumeLoad(
  state: WorkspaceState,
  range: TrendsRange,
): WeeklyVolumeLoadProjection {
  const window = resolveTrendsRange(state, range);
  const rawResults = state.workoutResults;
  if (
    !Array.isArray(rawResults) ||
    !rawResults.every(validWorkoutResult) ||
    !validTrainingPlanAuthority(state)
  ) {
    return {
      status: "unavailable",
      weeks: [],
      coverage: { availableLoads: 0, results: 0 },
    };
  }
  const results = rawResults.filter((result) =>
    resultInWindow(result, window, state.clock.timeZone),
  );
  const weeks: WeeklyVolumeLoadWeek[] = window.weekStarts.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const weekResults = results.filter((result) => {
      const date = resultDate(result, state.clock.timeZone);
      return date >= weekStart && date <= weekEnd;
    });
    const loadValues = weekResults.map((result) => result.summary.trainingLoad);
    const availableLoadValues = loadValues.filter(finite);
    return {
      weekStart,
      weekEnd,
      distanceKm: weekResults.reduce(
        (total, result) => total + result.summary.distanceKm,
        0,
      ),
      trainingLoad:
        weekResults.length === 0
          ? 0
          : availableLoadValues.length === weekResults.length
            ? availableLoadValues.reduce((total, value) => total + value, 0)
            : null,
      resultCount: weekResults.length,
      availableLoadCount: availableLoadValues.length,
      fourWeekAverageLoad: null,
    } satisfies WeeklyVolumeLoadWeek;
  });
  for (const [index, week] of weeks.entries()) {
    const values = weeks
      .slice(Math.max(0, index - 3), index + 1)
      .map(({ trainingLoad }) => trainingLoad)
      .filter(finite);
    week.fourWeekAverageLoad =
      values.length === 0
        ? null
        : Math.round(
            values.reduce((total, value) => total + value, 0) / values.length,
          );
  }
  const resultCount = results.length;
  const availableLoads = results.filter(({ summary }) =>
    finite(summary.trainingLoad),
  ).length;
  return {
    status:
      resultCount === 0
        ? "empty"
        : availableLoads === resultCount
          ? "ready"
          : "partial",
    weeks,
    coverage: { availableLoads, results: resultCount },
  };
}

function workoutTitle(
  plannedWorkouts: readonly PlannedWorkout[],
  plannedWorkoutId: string | undefined,
): string {
  return (
    plannedWorkouts.find(({ id }) => id === plannedWorkoutId)?.title ??
    "Recorded Workout Result"
  );
}

export function projectPaceHeartRate(
  state: WorkspaceState,
  range: TrendsRange,
): PaceHeartRateProjection {
  const window = resolveTrendsRange(state, range);
  const rawResults = state.workoutResults;
  if (
    !Array.isArray(rawResults) ||
    !rawResults.every(validWorkoutResult) ||
    !rawResults.every(hasPaceClassification)
  ) {
    return {
      status: "unavailable",
      points: [],
      excludedOutdoorRuns: 0,
      selected: null,
    };
  }
  const outdoorRuns = rawResults.filter(
    (result) =>
      resultInWindow(result, window, state.clock.timeZone) &&
      result.summary.activityKind === "outdoor_run",
  );
  const points = outdoorRuns
    .map((result) => {
      const { averagePaceSecondsPerKm: pace, averageHeartRateBpm: heartRate } =
        result.summary;
      if (!finite(pace) || !finite(heartRate)) return null;
      const point = {
        workoutResultId: result.id,
        date: resultDate(result, state.clock.timeZone),
        title: workoutTitle(
          state.trainingPlan.plannedWorkouts,
          result.plannedWorkoutId,
        ),
        paceSecondsPerKm: pace,
        heartRateBpm: heartRate,
      } satisfies Omit<PaceHeartRatePoint, "plannedWorkoutId">;
      return result.plannedWorkoutId
        ? { ...point, plannedWorkoutId: result.plannedWorkoutId }
        : point;
    })
    .filter((point): point is PaceHeartRatePoint => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    status:
      points.length === 0
        ? "empty"
        : points.length < outdoorRuns.length
          ? "partial"
          : "ready",
    points,
    excludedOutdoorRuns: outdoorRuns.length - points.length,
    selected: points.at(-1) ?? null,
  };
}

function completeRepeatKey(workout: PlannedWorkout): string | null {
  const blocks: WorkoutBlock[] = workout.prescription.blocks;
  if (!blocks.some((block) => block.kind === "repeat")) return null;
  return JSON.stringify({ type: workout.type, blocks });
}

function summaryForResult(result: WorkoutResult): RepeatedSessionSummary {
  return {
    distanceKm: finite(result.summary.distanceKm)
      ? result.summary.distanceKm
      : null,
    durationSeconds: finite(result.summary.durationSeconds)
      ? result.summary.durationSeconds
      : null,
    trainingLoad: finite(result.summary.trainingLoad)
      ? result.summary.trainingLoad
      : null,
    averagePaceSecondsPerKm: finite(result.summary.averagePaceSecondsPerKm)
      ? result.summary.averagePaceSecondsPerKm
      : null,
    averageHeartRateBpm: finite(result.summary.averageHeartRateBpm)
      ? result.summary.averageHeartRateBpm
      : null,
  };
}

function hasMissingOptionalSummary(summary: RepeatedSessionSummary): boolean {
  return Object.values(summary).some((value) => value === null);
}

export function projectRepeatedSessions(
  state: WorkspaceState,
  range: TrendsRange,
): RepeatedSessionsProjection {
  const window = resolveTrendsRange(state, range);
  if (
    !Array.isArray(state.workoutResults) ||
    !state.workoutResults.every(validWorkoutResult) ||
    !validTrainingPlanAuthority(state)
  ) {
    return { status: "unavailable", groups: [] };
  }
  const plans = new Map(
    state.trainingPlan.plannedWorkouts.map((workout) => [workout.id, workout]),
  );
  const grouped = new Map<
    string,
    { plannedWorkout: PlannedWorkout; results: WorkoutResult[] }
  >();
  for (const result of state.workoutResults.filter((item) =>
    resultInWindow(item, window, state.clock.timeZone),
  )) {
    const plannedWorkout = plans.get(result.plannedWorkoutId ?? "");
    if (!plannedWorkout) continue;
    const key = completeRepeatKey(plannedWorkout);
    if (!key) continue;
    const existing = grouped.get(key);
    if (existing) existing.results.push(result);
    else grouped.set(key, { plannedWorkout, results: [result] });
  }
  const groups = [...grouped.entries()]
    .map(([key, { plannedWorkout, results }]) => {
      const sortedResults = [...results].sort(
        (a, b) =>
          resultDate(b, state.clock.timeZone).localeCompare(
            resultDate(a, state.clock.timeZone),
          ) || b.id.localeCompare(a.id),
      );
      const latestResult = sortedResults[0];
      const latestSummary = summaryForResult(latestResult);
      return {
        key,
        label: plannedWorkout.title,
        attemptCount: sortedResults.length,
        latestResult,
        latestSummary,
        plannedWorkoutId: plannedWorkout.id,
        degraded: hasMissingOptionalSummary(latestSummary),
      } satisfies RepeatedSessionGroup;
    })
    .filter(({ attemptCount }) => attemptCount >= 2)
    .sort(
      (a, b) =>
        resultDate(b.latestResult, state.clock.timeZone).localeCompare(
          resultDate(a.latestResult, state.clock.timeZone),
        ) || a.key.localeCompare(b.key),
    );
  return {
    status:
      groups.length === 0
        ? "empty"
        : groups.some(({ degraded }) => degraded)
          ? "degraded"
          : "ready",
    groups,
  };
}

function annotationInRange(
  annotation: ChartAnnotation,
  window: TrendsDateRange,
): boolean {
  return annotation.date >= window.from && annotation.date <= window.to;
}

function validPhaseHistory(
  value: unknown,
  state: WorkspaceState,
): value is TrainingPhaseHistoryRecord[] {
  if (!Array.isArray(value)) return false;
  const seenIds = new Set<string>();
  const seenDates = new Set<string>();
  let previousDate: string | null = null;
  return value.every((record) => {
    if (
      typeof record !== "object" ||
      record === null ||
      typeof record.id !== "string" ||
      record.id.trim() === "" ||
      seenIds.has(record.id) ||
      typeof record.date !== "string" ||
      parseDate(record.date) === null ||
      seenDates.has(record.date) ||
      (previousDate !== null && record.date <= previousDate) ||
      record.date < state.trainingPlan.buildStartDate ||
      record.date > state.targetRace.date ||
      typeof record.phaseId !== "string" ||
      record.phaseId.trim() === "" ||
      typeof record.name !== "string" ||
      record.name.trim() === ""
    ) {
      return false;
    }
    seenIds.add(record.id);
    seenDates.add(record.date);
    previousDate = record.date;
    return true;
  });
}

export function deriveChartAnnotations(
  state: WorkspaceState,
  range: TrendsRange,
): ChartAnnotation[] {
  const window = resolveTrendsRange(state, range);
  const annotations: ChartAnnotation[] = [];
  if (validPhaseHistory(state.trainingPhaseHistory, state)) {
    for (const phase of state.trainingPhaseHistory) {
      const annotation: PhaseAnnotation = {
        kind: "phase",
        date: phase.date,
        label: phase.name,
      };
      if (annotationInRange(annotation, window)) annotations.push(annotation);
    }
  }
  if (Array.isArray(state.adaptationReceipts)) {
    for (const receipt of state.adaptationReceipts) {
      const date = localDateForInstant(receipt.appliedAt, state.clock.timeZone);
      if (!date) continue;
      const annotation: AdaptationAnnotation = {
        kind: "adaptation",
        date,
        label: receipt.selectedOption.label,
        adaptationId: receipt.reviewId,
      };
      if (annotationInRange(annotation, window)) annotations.push(annotation);
    }
  }
  const race: RaceAnnotation = {
    kind: "race",
    date: state.targetRace.date,
    label: "Target race",
  };
  if (annotationInRange(race, window)) annotations.push(race);
  return annotations.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.kind.localeCompare(b.kind) ||
      a.label.localeCompare(b.label),
  );
}
