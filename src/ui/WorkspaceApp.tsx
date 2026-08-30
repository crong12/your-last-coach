import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { CoachAgentConnection } from "../adapters/webmcp/types";
import type { DemoGuidePreference } from "../adapters/persistence/demoGuidePreference";
import type { ToolActivityStore } from "../adapters/webmcp/toolActivityStore";
import type {
  AthleteContextData,
  WorkoutContextData,
} from "../application/readSelectors";
import type { Durability } from "../application/ports";
import type { WorkspaceApplication } from "../application/createWorkspaceApplication";
import type { ReviewCoordinator } from "../application/createReviewCoordinator";
import {
  NAVIGATION_FOCUS_STATE_KEY,
  NAVIGATION_STATE_KEY,
  PANE_IDS,
  paneOriginFromHistoryState,
  type PaneNavigation,
  type PaneId,
  type PaneOriginReceipt,
  workoutFocusFromHistoryState,
  workoutOriginFromHistoryState,
  type WorkoutOriginReceipt,
  type WorkspaceRoute,
  workspaceRouteFromHash,
  workspaceRouteHash,
} from "../application/createPaneNavigation";
import type {
  AppliedPlanAdaptation,
  AthleteFeedback,
  DeclinedPlanAdaptation,
  PendingAdaptationProposal,
  PlannedWorkout,
  WorkoutResult,
  WorkspaceState,
} from "../domain/types";
import {
  buildReviewPreview,
  type AdaptationOption,
  type ReviewProposal,
  type ReviewPreviewRow,
} from "../domain/review";
import { useModalFocus } from "./useModalFocus";
import { HrvChart } from "./charts/HrvChart";
import { ResultDetailChart } from "./charts/ResultDetailChart";
import {
  formatPaceSeconds,
  normalizeResultLaps,
} from "./charts/resultDetailMath";
import { TrendsPane } from "./charts/TrendsPane";

interface WorkspaceAppProps {
  application: WorkspaceApplication;
  paneNavigation: PaneNavigation;
  reviewCoordinator: ReviewCoordinator;
  initialNotice: string | null;
  initialDurability: Durability;
  coachAgentConnection: CoachAgentConnection;
  demoGuidePreference: DemoGuidePreference;
  toolActivityStore: ToolActivityStore;
}

type PlanView = "week" | "month";

const PANE_LABELS: Record<PaneId, string> = {
  today: "Today",
  trends: "Trends",
  coaching: "Coaching",
};

function historyStateWithOrigin(
  origin: PaneOriginReceipt | WorkoutOriginReceipt,
) {
  const current = window.history.state;
  const next = {
    ...(typeof current === "object" && current !== null ? current : {}),
    [NAVIGATION_STATE_KEY]: origin,
  };
  delete next[NAVIGATION_FOCUS_STATE_KEY];
  return next;
}

function historyStateWithoutOrigin() {
  const current = window.history.state;
  if (typeof current !== "object" || current === null) return null;
  const next = { ...(current as Record<string, unknown>) };
  delete next[NAVIGATION_STATE_KEY];
  delete next[NAVIGATION_FOCUS_STATE_KEY];
  return next;
}

function historyStateWithFocus(focus: WorkoutOriginReceipt) {
  const current = window.history.state;
  return {
    ...(typeof current === "object" && current !== null ? current : {}),
    [NAVIGATION_FOCUS_STATE_KEY]: focus,
  };
}

const WEEK_DATES = [
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
] as const;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_DAY_OFFSET = 5;

function formatPace(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatClock(now: string, timeZone: string) {
  const instant = new Date(now);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(instant);
  return `${date} · ${time}`;
}

function formatObjective(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatSleep(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}`;
}

function formatClassification(classification: string) {
  const words = classification.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function workoutTone(workout: PlannedWorkout) {
  if (workout.id === "planned-2026-08-26-threshold") return "incomplete";
  return workout.type;
}

type WorkoutSelect = (workout: PlannedWorkout, invoker: HTMLElement) => void;

function WorkoutButton({
  workout,
  onSelect,
  compact = false,
  adapted = false,
}: {
  workout: PlannedWorkout;
  onSelect: WorkoutSelect;
  compact?: boolean;
  adapted?: boolean;
}) {
  return (
    <button
      id={`workout-entry-${workout.id}`}
      className={`workout-card workout-card--${workoutTone(workout)} ${compact ? "workout-card--compact" : ""} ${adapted ? "workout-card--adapted" : ""}`}
      onClick={(event) => onSelect(workout, event.currentTarget)}
      aria-label={`${workout.title}, ${workout.date}, ${workout.distanceKm} kilometres, open details`}
    >
      <span className="workout-card__type">
        {workoutTone(workout) === "incomplete"
          ? "Partial result"
          : workout.type.replace("_", " ")}
      </span>
      <strong>{workout.title}</strong>
      {adapted && <small className="adapted-marker">Adapted</small>}
      {!compact && <span>{workout.purpose}</span>}
    </button>
  );
}

function WeekPlan({
  workouts,
  currentDate,
  onSelect,
  adaptedWorkoutIds,
}: {
  workouts: PlannedWorkout[];
  currentDate: string;
  onSelect: WorkoutSelect;
  adaptedWorkoutIds: Set<string>;
}) {
  const remainingDistanceKm = workouts
    .filter((workout) => workout.date > currentDate)
    .reduce((total, workout) => total + workout.distanceKm, 0);

  return (
    <section className="plan-panel" aria-labelledby="week-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">This week</span>
          <h2 id="week-title">24–30 August</h2>
        </div>
        <p>
          {remainingDistanceKm} km remain after Wednesday’s partial session.
        </p>
      </div>
      <div className="week-route">
        {WEEK_DATES.map((date, index) => {
          const workout = workouts.find((item) => item.date === date);
          const isToday = date === "2026-08-26";
          return (
            <article
              className={`week-day ${isToday ? "week-day--today" : ""}`}
              key={date}
            >
              <header>
                <span>{DAY_NAMES[index]}</span>
                <strong>{Number(date.slice(-2))}</strong>
              </header>
              <span className="route-node" aria-hidden="true" />
              {workout ? (
                <WorkoutButton
                  workout={workout}
                  onSelect={onSelect}
                  adapted={adaptedWorkoutIds.has(workout.id)}
                />
              ) : (
                <div className="rest-day">
                  <span>Rest</span>
                  <small>Space to recover</small>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MonthPlan({
  workouts,
  onSelect,
  adaptedWorkoutIds,
}: {
  workouts: PlannedWorkout[];
  onSelect: WorkoutSelect;
  adaptedWorkoutIds: Set<string>;
}) {
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  return (
    <section className="plan-panel" aria-labelledby="month-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Training Plan horizon</span>
          <h2 id="month-title">August 2026</h2>
        </div>
        <p>{workouts.length} Planned Workouts from the same plan.</p>
      </div>
      <div className="month-scroll">
        <div className="month-calendar">
          {DAY_NAMES.map((day) => (
            <span className="month-weekday" key={day}>
              {day}
            </span>
          ))}
          {Array.from({ length: MONTH_DAY_OFFSET }, (_, index) => (
            <span
              className="month-cell month-cell--empty"
              key={`empty-${index}`}
            />
          ))}
          {days.map((day) => {
            const date = `2026-08-${String(day).padStart(2, "0")}`;
            const workout = workouts.find((item) => item.date === date);
            return (
              <article
                className={`month-cell ${day === 26 ? "month-cell--today" : ""}`}
                key={day}
              >
                <span className="month-date">{day}</span>
                {workout && (
                  <WorkoutButton
                    workout={workout}
                    onSelect={onSelect}
                    compact
                    adapted={adaptedWorkoutIds.has(workout.id)}
                  />
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.round(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatDistance(distanceKm: number) {
  return `${Number.isInteger(distanceKm) ? distanceKm : distanceKm.toFixed(1)} km`;
}

function formatDelta(value: number, unit: string) {
  const rounded = Math.round(value * 10) / 10;
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded} ${unit}`;
}

function WorkoutStat({
  label,
  value,
  basis,
}: {
  label: string;
  value: string;
  basis?: string;
}) {
  return (
    <div className="workout-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {basis && <small className="workout-stat__basis">{basis}</small>}
    </div>
  );
}

function WorkoutStats({ result }: { result: WorkoutResult }) {
  const duration = result.summary.durationSeconds;
  const averagePace =
    duration !== undefined && result.summary.distanceKm > 0
      ? duration / result.summary.distanceKm
      : null;
  return (
    <section className="workout-result-section" aria-labelledby="stats-title">
      <span className="eyebrow">Recorded outcome</span>
      <h2 id="stats-title">Workout Result</h2>
      <dl className="workout-stats">
        <WorkoutStat
          label="Distance"
          value={formatDistance(result.summary.distanceKm)}
        />
        <WorkoutStat
          label="Time"
          value={
            duration === undefined
              ? "No duration recorded"
              : formatDuration(duration)
          }
        />
        <WorkoutStat
          label="Average pace"
          value={
            averagePace === null
              ? "No average pace recorded"
              : `${formatPaceSeconds(averagePace)}/km`
          }
          basis={averagePace === null ? undefined : "Derived"}
        />
        <WorkoutStat label="Average HR" value="No average HR recorded" />
        <WorkoutStat label="Training Load" value="No Training Load recorded" />
      </dl>
    </section>
  );
}

function PlanVersusActual({
  workout,
  result,
}: {
  workout: PlannedWorkout;
  result: WorkoutResult;
}) {
  const repeatBlock = workout.prescription.blocks.find(
    (block) => block.kind === "repeat",
  );
  return (
    <section
      className="workout-result-section"
      aria-labelledby="plan-actual-title"
    >
      <span className="eyebrow">Like-for-like evidence</span>
      <h2 id="plan-actual-title">Plan versus actual</h2>
      <dl className="plan-actual-list">
        <div>
          <dt>Distance</dt>
          <dd>
            <span>Planned {formatDistance(workout.distanceKm)}</span>
            <span>Actual {formatDistance(result.summary.distanceKm)}</span>
            <strong>
              Delta{" "}
              {formatDelta(
                result.summary.distanceKm - workout.distanceKm,
                "km",
              )}
            </strong>
          </dd>
        </div>
        {repeatBlock?.kind === "repeat" && (
          <div>
            <dt>Work repetitions</dt>
            <dd>
              <span>
                Planned {repeatBlock.repetitions} repetitions from the repeat
                block
              </span>
              <strong>
                {result.summary.completedWorkRepetitions === undefined
                  ? "No completed repetitions recorded"
                  : `${result.summary.completedWorkRepetitions} of ${repeatBlock.repetitions} completed`}
              </strong>
              {result.summary.completedWorkRepetitions !== undefined && (
                <small>
                  Difference{" "}
                  {formatDelta(
                    result.summary.completedWorkRepetitions -
                      repeatBlock.repetitions,
                    "repetitions",
                  )}
                </small>
              )}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function SplitsTable({
  laps,
}: {
  laps: ReturnType<typeof normalizeResultLaps>;
}) {
  return (
    <details className="workout-splits">
      <summary>Splits</summary>
      <div className="workout-splits__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Lap</th>
              <th scope="col">Distance</th>
              <th scope="col">Pace</th>
              <th scope="col">Avg HR</th>
              <th scope="col">Max HR</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap) => (
              <tr key={lap.id}>
                <th scope="row">{lap.label}</th>
                <td>{formatDistance(lap.distanceKm)}</td>
                <td>
                  {lap.paceSecondsPerKm === null
                    ? "Not recorded"
                    : `${formatPaceSeconds(lap.paceSecondsPerKm)}/km`}
                </td>
                <td>
                  {lap.averageHeartRateBpm === null
                    ? "Not recorded"
                    : `${lap.averageHeartRateBpm} bpm`}
                </td>
                <td>
                  {lap.maximumHeartRateBpm === null
                    ? "Not recorded"
                    : `${lap.maximumHeartRateBpm} bpm`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function WorkoutPreviousAttempts({
  context,
  onSelectWorkout,
}: {
  context: WorkoutContextData;
  onSelectWorkout?: WorkoutSelect;
}) {
  if (context.previousAttempts.length === 0) return null;
  return (
    <section
      className="workout-result-section"
      aria-labelledby="previous-attempts-title"
    >
      <span className="eyebrow">Same session type</span>
      <h2 id="previous-attempts-title">Previous attempts</h2>
      <ol className="previous-attempts-list">
        {context.previousAttempts.map(({ plannedWorkout, workoutResult }) => {
          const date = formatDate(workoutResult.startedAt.slice(0, 10));
          const label = `View previous attempt ${date} · ${formatDistance(workoutResult.summary.distanceKm)}`;
          const distanceDelta = context.workoutResult
            ? formatDelta(
                workoutResult.summary.distanceKm -
                  context.workoutResult.summary.distanceKm,
                "km",
              )
            : null;
          return (
            <li key={workoutResult.id}>
              {onSelectWorkout ? (
                <button
                  className="previous-attempt"
                  id={`previous-attempt-${workoutResult.id}`}
                  aria-label={label}
                  onClick={(event) =>
                    onSelectWorkout(plannedWorkout, event.currentTarget)
                  }
                >
                  <span>
                    <strong>{date}</strong>
                    <small>{plannedWorkout.title}</small>
                  </span>
                  <span>
                    <strong>
                      {formatDistance(workoutResult.summary.distanceKm)}
                    </strong>
                    <small>Previous attempt</small>
                    {distanceDelta !== null && (
                      <small>Delta vs current {distanceDelta}</small>
                    )}
                  </span>
                </button>
              ) : (
                <div className="previous-attempt">
                  <span>
                    <strong>{date}</strong>
                    <small>{plannedWorkout.title}</small>
                  </span>
                  <span>
                    <strong>
                      {formatDistance(workoutResult.summary.distanceKm)}
                    </strong>
                    <small>Previous attempt</small>
                    {distanceDelta !== null && (
                      <small>Delta vs current {distanceDelta}</small>
                    )}
                  </span>
                </div>
              )}
              <dl className="previous-attempt__aggregates">
                <div>
                  <dt>Average pace</dt>
                  <dd>Not recorded</dd>
                </div>
                <div>
                  <dt>Average HR</dt>
                  <dd>Not recorded</dd>
                </div>
                <div>
                  <dt>Training Load</dt>
                  <dd>Not recorded</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function makeFeedbackRequestId() {
  try {
    return `workout-feedback-${crypto.randomUUID()}`;
  } catch {
    return `workout-feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function WorkoutFeedback({
  context,
  application,
  onDurability,
}: {
  context: WorkoutContextData;
  application: WorkspaceApplication;
  onDurability: (durability: Durability) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const feedback = [...context.athleteFeedback].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
  );

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const open = () => {
    requestIdRef.current = makeFeedbackRequestId();
    setDraft("");
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setDraft("");
    setError(null);
    requestIdRef.current = null;
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || draft.trim() === "") {
      if (draft.trim() === "") setError("Athlete Feedback is required.");
      return;
    }
    const requestId = requestIdRef.current ?? makeFeedbackRequestId();
    requestIdRef.current = requestId;
    setSaving(true);
    setError(null);
    const outcome = await application.command({
      type: "record_athlete_feedback",
      requestId,
      relatedWorkoutId: context.plannedWorkout.id,
      rawText: draft,
    });
    setSaving(false);
    if (outcome.status === "ok") {
      onDurability(outcome.durability);
      cancel();
      return;
    }
    setError(outcome.message);
  };

  return (
    <section
      className="workout-result-section workout-feedback"
      aria-labelledby="feedback-title"
    >
      <span className="eyebrow">Athlete-owned evidence</span>
      <h2 id="feedback-title">Athlete Feedback</h2>
      {feedback.length === 0 ? (
        <p className="workout-feedback__empty">
          No Athlete Feedback recorded for this workout yet
        </p>
      ) : (
        <div className="workout-feedback__list">
          {feedback.map((entry) => (
            <article className="workout-feedback__card" key={entry.id}>
              <blockquote>{entry.rawText}</blockquote>
              <time dateTime={entry.recordedAt}>
                {formatDate(entry.recordedAt.slice(0, 10))}
              </time>
            </article>
          ))}
        </div>
      )}
      {!editing ? (
        <button
          className="button button--quiet workout-feedback__add"
          onClick={open}
        >
          Add feedback
        </button>
      ) : (
        <form
          className="workout-feedback__form"
          aria-label="Add Athlete Feedback"
          onSubmit={(event) => void save(event)}
          data-feedback-request-id={requestIdRef.current ?? undefined}
        >
          <label htmlFor="workout-feedback-text">Athlete Feedback</label>
          <textarea
            id="workout-feedback-text"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(null);
            }}
            rows={4}
            required
            disabled={saving}
          />
          {error && (
            <p
              ref={errorRef}
              className="workout-feedback__error"
              role="alert"
              tabIndex={-1}
            >
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button button--quiet"
              type="button"
              onClick={cancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={saving || draft.trim() === ""}
            >
              {saving ? "Saving…" : "Save feedback"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function PlannedWorkoutComposition({ workout }: { workout: PlannedWorkout }) {
  const repeatBlock = workout.prescription.blocks.find(
    (block) => block.kind === "repeat",
  );
  return (
    <>
      <section
        className="workout-detail__intent"
        aria-labelledby="intent-title"
      >
        <span className="eyebrow">Purpose in the plan</span>
        <h2 id="intent-title">Coach’s intent</h2>
        <p>{workout.purpose}</p>
      </section>

      <section aria-labelledby="structure-title">
        <span className="eyebrow">Planned structure</span>
        <h2 id="structure-title">Workout structure</h2>
        <ol className="workout-structure">
          {workout.prescription.blocks.map((block, index) => {
            const label =
              block.kind === "warmup"
                ? "Warm-up"
                : block.kind === "cooldown"
                  ? "Cool-down"
                  : "Main set";
            const value =
              block.kind === "repeat"
                ? `${block.repetitions} × ${block.workDistanceKm} km at ${formatPace(block.targetPaceSecondsPerKm.min)}–${formatPace(block.targetPaceSecondsPerKm.max)}/km · ${block.recoverySeconds} seconds easy jog`
                : `${block.distanceKm} km`;
            return (
              <li key={`${block.kind}-${index}`}>
                <span>{label}</span>
                <strong>{value}</strong>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="targets-title">
        <span className="eyebrow">Prescription at a glance</span>
        <h2 id="targets-title">Targets</h2>
        <table className="workout-targets">
          <tbody>
            <tr>
              <th scope="row">Target pace</th>
              <td>
                {repeatBlock?.kind === "repeat"
                  ? `${formatPace(repeatBlock.targetPaceSecondsPerKm.min)}–${formatPace(repeatBlock.targetPaceSecondsPerKm.max)}/km`
                  : "No separate pace target recorded"}
              </td>
            </tr>
            <tr>
              <th scope="row">Effort / heart-rate guidance</th>
              <td>No separate guidance recorded</td>
            </tr>
            <tr>
              <th scope="row">Planned distance</th>
              <td>{formatDistance(workout.distanceKm)}</td>
            </tr>
            <tr>
              <th scope="row">Planned duration</th>
              <td>No duration recorded</td>
            </tr>
            <tr>
              <th scope="row">Recovery protocol</th>
              <td>
                {repeatBlock?.kind === "repeat"
                  ? `${repeatBlock.recoverySeconds} seconds easy jog between repetitions`
                  : "No separate recovery protocol recorded"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}

function ResultBackedWorkoutComposition({
  context,
  application,
  onDurability,
  onSelectWorkout,
}: {
  context: WorkoutContextData;
  application: WorkspaceApplication;
  onDurability: (durability: Durability) => void;
  onSelectWorkout?: WorkoutSelect;
}) {
  const result = context.workoutResult;
  if (!result) return null;
  const laps = normalizeResultLaps(result.laps);
  return (
    <>
      <WorkoutStats result={result} />
      <PlanVersusActual workout={context.plannedWorkout} result={result} />
      <section
        className="workout-result-section"
        aria-labelledby="lap-chart-title"
      >
        <span className="eyebrow">Recorded laps</span>
        <h2 id="lap-chart-title">Per-lap pace and heart rate</h2>
        {laps.length === 0 ? (
          <p className="result-detail-chart__empty">No lap data recorded</p>
        ) : (
          <>
            <ResultDetailChart laps={laps} />
            <SplitsTable laps={laps} />
          </>
        )}
      </section>
      <WorkoutPreviousAttempts
        context={context}
        onSelectWorkout={onSelectWorkout}
      />
      <WorkoutFeedback
        context={context}
        application={application}
        onDurability={onDurability}
      />
    </>
  );
}

function WorkoutDetailScreen({
  context,
  backLabel,
  onBack,
  application,
  onDurability,
  onSelectWorkout,
  screenRef,
}: {
  context: WorkoutContextData;
  backLabel: string;
  onBack: () => void;
  application: WorkspaceApplication;
  onDurability: (durability: Durability) => void;
  onSelectWorkout?: WorkoutSelect;
  screenRef: RefObject<HTMLElement | null>;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const workout = context.plannedWorkout;
  const result = context.workoutResult;
  const date = result?.startedAt.slice(0, 10) ?? workout.date;
  const screenLabel = result ? "Workout Result" : "Planned Workout";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [workout.id, result?.id]);

  return (
    <main ref={screenRef} className="workout-screen" aria-label={screenLabel}>
      <header className="workout-screen__header">
        <button
          className="workout-screen__back"
          onClick={onBack}
          aria-label={backLabel}
        >
          <span aria-hidden="true">←</span>
          Back
        </button>
        <span className="workout-screen__status">
          {result ? result.status.toUpperCase() : "PLANNED"}
        </span>
      </header>
      <article className="workout-detail">
        <header className="workout-detail__title">
          <div className="workout-detail__meta">
            <time dateTime={date}>{formatDate(date)}</time>
            <span>{formatClassification(workout.type)}</span>
          </div>
          <h1 ref={titleRef} tabIndex={-1}>
            {workout.title}
          </h1>
          {result?.provenance && (
            <small className="provenance-label">
              Source: {result.provenance}
            </small>
          )}
        </header>
        {result ? (
          <ResultBackedWorkoutComposition
            context={context}
            application={application}
            onDurability={onDurability}
            onSelectWorkout={onSelectWorkout}
          />
        ) : (
          <PlannedWorkoutComposition workout={workout} />
        )}
      </article>
    </main>
  );
}

function ResetDialog({
  onCancel,
  onReset,
}: {
  onCancel: () => void;
  onReset: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocus(dialogRef, onCancel);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="reset-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="eyebrow">Return to the start</span>
        <h2 id="reset-title">Reset the demo?</h2>
        <p>
          This restores the original August Training Plan and removes saved demo
          changes.
        </p>
        <div className="dialog-actions">
          <button
            className="button button--quiet"
            onClick={onCancel}
            data-initial-focus
          >
            Keep current plan
          </button>
          <button className="button button--danger" onClick={onReset}>
            Reset demo
          </button>
        </div>
      </section>
    </div>
  );
}

const SUGGESTED_PROMPT =
  "That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn't hold the pace. No pain. Can you review what happened and make the rest of this week easier? Show me the options before changing my plan.";

function DemoGuide({
  connection,
  latestActivity,
  onContinue,
  onReset,
}: {
  connection: CoachAgentConnection;
  latestActivity: ReturnType<ToolActivityStore["getSnapshot"]>;
  onContinue: () => void;
  onReset: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocus(dialogRef, onContinue);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SUGGESTED_PROMPT);
      setCopyNotice("Prompt copied.");
    } catch {
      setCopyNotice("Select the prompt and copy it from this guide.");
    }
  };
  const connectionHeading =
    connection.status === "connected"
      ? "Coach Agent connected"
      : connection.status === "error"
        ? "Coach Agent couldn’t connect"
        : "Coach Agent unavailable";
  const connectionCopy =
    connection.status === "connected"
      ? "The fallback review tools are ready in this browser."
      : connection.status === "error"
        ? "Reload this page and try again. Your Training Plan was not changed."
        : "Coach Agent tools aren’t available in this browser. You can still explore the workspace.";

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={onContinue}
    >
      <section
        ref={dialogRef}
        className="guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button"
          onClick={onContinue}
          aria-label="Close Demo Guide"
          data-initial-focus
        >
          ×
        </button>
        <div className="guide-scroll">
          <span className="eyebrow">Judge briefing</span>
          <h2 id="guide-title">Demo Guide</h2>
          <p className="guide-intro">
            Sam is a fictional runner preparing for Brighton Marathon. This
            reproducible scenario uses seeded synthetic COROS-shaped
            observations and does not connect to a COROS account.
          </p>

          <section className="guide-prompt" aria-labelledby="prompt-title">
            <div>
              <span className="eyebrow">Suggested message</span>
              <h3 id="prompt-title">Ask the Coach Agent</h3>
            </div>
            <blockquote>{SUGGESTED_PROMPT}</blockquote>
            <button className="button button--quiet" onClick={copyPrompt}>
              Copy prompt
            </button>
            {copyNotice && (
              <p className="guide-copy-notice" role="status">
                {copyNotice}
              </p>
            )}
          </section>

          <div className="guide-grid">
            <section aria-labelledby="connection-title">
              <span className="eyebrow">Connection</span>
              <h3 id="connection-title">{connectionHeading}</h3>
              <p>{connectionCopy}</p>
              {connection.toolNames.length > 0 && (
                <ul className="guide-tools" aria-label="Registered tools">
                  {connection.toolNames.map((toolName) => (
                    <li key={toolName}>{toolName}</li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="activity-title">
              <span className="eyebrow">Latest tool outcome</span>
              <h3 id="activity-title">Coach Agent activity</h3>
              <p>
                {latestActivity?.message ?? "No Coach Agent tool has run yet."}
              </p>
              <p>
                This demo uses a reliable two-step review: the Coach Agent opens
                a review here, then reads your decision after you approve or
                discuss further.
              </p>
            </section>
          </div>

          <section
            className="guide-troubleshooting"
            aria-labelledby="troubleshooting-title"
          >
            <span className="eyebrow">Troubleshooting</span>
            <h3 id="troubleshooting-title">If tools are unavailable</h3>
            <p>
              Open this page in ChatGPT’s in-app browser and attach it to the
              conversation. Reload the page if the status does not update. Reset
              restores the scenario; it does not enable browser tools.
            </p>
          </section>
        </div>
        <div className="dialog-actions guide-actions">
          <button className="button button--quiet" onClick={onReset}>
            Reset demo
          </button>
          <button className="button button--primary" onClick={onContinue}>
            Continue to workspace
          </button>
        </div>
      </section>
    </div>
  );
}

type CoachingTimelineLink = {
  entryId: string;
  direction: "causal" | "related";
};

type CoachingTimelineEntry =
  | {
      kind: "feedback";
      id: string;
      timestamp: string;
      feedback: AthleteFeedback;
      relatedEntries: CoachingTimelineLink[];
    }
  | {
      kind: "workout-result";
      id: string;
      timestamp: string;
      result: WorkoutResult;
      workout: PlannedWorkout | null;
      relatedEntries: CoachingTimelineLink[];
    }
  | {
      kind: "approved-adaptation";
      id: string;
      timestamp: string;
      receipt: AppliedPlanAdaptation;
      relatedEntries: CoachingTimelineLink[];
    }
  | {
      kind: "declined-adaptation";
      id: string;
      timestamp: string;
      decision: DeclinedPlanAdaptation;
      relatedEntries: CoachingTimelineLink[];
    };

const coachingEntryId = (
  kind: CoachingTimelineEntry["kind"],
  sourceId: string,
) => {
  const prefix =
    kind === "feedback"
      ? "athlete-feedback"
      : kind === "workout-result"
        ? "workout-result"
        : kind === "approved-adaptation"
          ? "approved-adaptation"
          : "declined-adaptation";
  const normalizedSourceId = sourceId
    .replace(/^(athlete-feedback:|result-|review:)/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return `coaching-entry-${prefix}-${normalizedSourceId}`;
};

function timelineTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function workoutResultForFeedback(
  feedback: AthleteFeedback,
  results: WorkoutResult[],
) {
  if (feedback.relatedWorkoutResultId !== undefined) {
    return (
      results.find(({ id }) => id === feedback.relatedWorkoutResultId) ?? null
    );
  }
  return (
    results.find(
      ({ plannedWorkoutId }) => plannedWorkoutId === feedback.relatedWorkoutId,
    ) ?? null
  );
}

function workoutResultForEvidenceRef(ref: string, context: AthleteContextData) {
  if (!ref.startsWith("workout-result:")) return null;
  const resultId = ref.slice("workout-result:".length);
  return context.recentTraining.find(({ id }) => id === resultId) ?? null;
}

function sourceLabelForEvidenceRef(
  ref: string,
  context: AthleteContextData,
  plannedWorkouts: PlannedWorkout[],
) {
  if (ref.startsWith("planned-workout:")) {
    const plannedWorkoutId = ref.slice("planned-workout:".length);
    const workout = plannedWorkouts.find(({ id }) => id === plannedWorkoutId);
    return workout
      ? `${formatDate(workout.date)} · ${workout.title}`
      : `Evidence reference ${ref}`;
  }
  const result = workoutResultForEvidenceRef(ref, context);
  if (result) {
    const workout = plannedWorkouts.find(
      ({ id }) => id === result.plannedWorkoutId,
    );
    return `${formatDate(result.startedAt.slice(0, 10))} · ${workout?.title ?? "Recorded workout"}`;
  }
  if (ref.startsWith("athlete-feedback:")) {
    const feedbackId = ref.slice("athlete-feedback:".length);
    const feedback = context.recentAthleteFeedback.find(
      ({ id }) => id === feedbackId,
    );
    return feedback
      ? `${formatDate(feedback.recordedAt.slice(0, 10))} · Athlete Feedback`
      : `Evidence reference ${ref}`;
  }
  const observationLabels: Record<string, string> = {
    "observation:training-load": "Training Load",
    "observation:recovery": "Recovery",
    "observation:sleep": "Sleep",
    "observation:sleep-hrv": "Sleep HRV",
    "observation:resting-heart-rate": "Resting heart rate",
    "observation:daily-stress": "Daily stress",
  };
  return observationLabels[ref] ?? `Evidence reference ${ref}`;
}

function projectCoachingTimeline(
  context: AthleteContextData,
  plannedWorkouts: PlannedWorkout[],
  declinedAdaptations: DeclinedPlanAdaptation[] = [],
): CoachingTimelineEntry[] {
  const feedbackEntries = context.recentAthleteFeedback.map((feedback) => ({
    kind: "feedback" as const,
    id: coachingEntryId("feedback", feedback.id),
    timestamp: feedback.recordedAt,
    feedback,
    relatedEntries: [] as CoachingTimelineLink[],
  }));
  const resultsById = new Map(
    context.recentTraining.map((result) => [result.id, result]),
  );
  const referencedResultIds = new Set<string>();
  for (const feedback of context.recentAthleteFeedback) {
    const result = workoutResultForFeedback(feedback, context.recentTraining);
    if (result) referencedResultIds.add(result.id);
  }
  for (const receipt of context.recentAdaptationHistory) {
    for (const ref of receipt.evidenceRefs) {
      const result = workoutResultForEvidenceRef(ref, context);
      if (result) referencedResultIds.add(result.id);
    }
  }

  const resultEntries = [...referencedResultIds]
    .map((resultId) => resultsById.get(resultId))
    .filter((result): result is WorkoutResult => result !== undefined)
    .map((result) => ({
      kind: "workout-result" as const,
      id: coachingEntryId("workout-result", result.id),
      timestamp: result.startedAt,
      result,
      workout:
        plannedWorkouts.find(({ id }) => id === result.plannedWorkoutId) ??
        null,
      relatedEntries: [] as CoachingTimelineLink[],
    }));
  const adaptationEntries = context.recentAdaptationHistory.map((receipt) => ({
    kind: "approved-adaptation" as const,
    id: coachingEntryId("approved-adaptation", receipt.reviewId),
    timestamp: receipt.appliedAt,
    receipt,
    relatedEntries: [] as CoachingTimelineLink[],
  }));
  const declinedEntries = declinedAdaptations.map((decision) => ({
    kind: "declined-adaptation" as const,
    id: coachingEntryId("declined-adaptation", decision.reviewId),
    timestamp: decision.declinedAt,
    decision,
    relatedEntries: [] as CoachingTimelineLink[],
  }));
  const entries: CoachingTimelineEntry[] = [
    ...feedbackEntries,
    ...resultEntries,
    ...adaptationEntries,
    ...declinedEntries,
  ];
  const resultEntryById = new Map(
    resultEntries.map((entry) => [entry.result.id, entry]),
  );
  const feedbackEntryById = new Map(
    feedbackEntries.map((entry) => [entry.feedback.id, entry]),
  );

  const addThreadLink = (
    entry: CoachingTimelineEntry,
    relatedEntry: CoachingTimelineEntry,
    direction: CoachingTimelineLink["direction"],
  ) => {
    if (
      !entry.relatedEntries.some(({ entryId }) => entryId === relatedEntry.id)
    ) {
      entry.relatedEntries.push({ entryId: relatedEntry.id, direction });
    }
  };
  const connectThread = (
    dependent: CoachingTimelineEntry,
    source: CoachingTimelineEntry,
  ) => {
    const direction =
      timelineTimestamp(dependent.timestamp) >
      timelineTimestamp(source.timestamp)
        ? "causal"
        : "related";
    addThreadLink(dependent, source, direction);
    addThreadLink(source, dependent, "related");
  };

  for (const feedbackEntry of feedbackEntries) {
    const result = workoutResultForFeedback(
      feedbackEntry.feedback,
      context.recentTraining,
    );
    const resultEntry = result ? resultEntryById.get(result.id) : undefined;
    if (resultEntry) {
      connectThread(feedbackEntry, resultEntry);
    }
  }
  for (const adaptationEntry of adaptationEntries) {
    const { receipt } = adaptationEntry;
    for (const ref of receipt.evidenceRefs) {
      const result = workoutResultForEvidenceRef(ref, context);
      const resultEntry = result ? resultEntryById.get(result.id) : undefined;
      if (resultEntry) connectThread(adaptationEntry, resultEntry);
      if (ref.startsWith("athlete-feedback:")) {
        const feedbackId = ref.slice("athlete-feedback:".length);
        const feedbackEntry = feedbackEntryById.get(feedbackId);
        if (feedbackEntry) connectThread(adaptationEntry, feedbackEntry);
      }
    }
  }
  for (const declinedEntry of declinedEntries) {
    for (const ref of declinedEntry.decision.evidenceRefs) {
      const result = workoutResultForEvidenceRef(ref, context);
      const resultEntry = result ? resultEntryById.get(result.id) : undefined;
      if (resultEntry) connectThread(declinedEntry, resultEntry);
      if (ref.startsWith("athlete-feedback:")) {
        const feedbackId = ref.slice("athlete-feedback:".length);
        const feedbackEntry = feedbackEntryById.get(feedbackId);
        if (feedbackEntry) connectThread(declinedEntry, feedbackEntry);
      }
    }
  }
  return entries.sort(
    (a, b) =>
      timelineTimestamp(b.timestamp) - timelineTimestamp(a.timestamp) ||
      timelineEntryPriority(a.kind) - timelineEntryPriority(b.kind) ||
      a.id.localeCompare(b.id),
  );
}

function timelineEntryPriority(kind: CoachingTimelineEntry["kind"]) {
  if (kind === "approved-adaptation" || kind === "declined-adaptation") {
    return -1;
  }
  if (kind === "workout-result") return 0;
  return 1;
}

function timelineEntryLabel(kind: CoachingTimelineEntry["kind"]) {
  if (kind === "feedback") return "Athlete Feedback";
  if (kind === "workout-result") return "Workout Result";
  if (kind === "approved-adaptation") return "Approved Adaptation";
  return "Declined Adaptation";
}

function TimelineThreadLinks({
  entry,
  entries,
}: {
  entry: CoachingTimelineEntry;
  entries: CoachingTimelineEntry[];
}) {
  if (entry.relatedEntries.length === 0) return null;
  const relatedEntries = entry.relatedEntries
    .map((link) => ({
      ...link,
      entry: entries.find((candidate) => candidate.id === link.entryId),
    }))
    .filter(
      (
        candidate,
      ): candidate is CoachingTimelineLink & {
        entry: CoachingTimelineEntry;
      } => candidate.entry !== undefined,
    );
  if (relatedEntries.length === 0) return null;
  return (
    <nav
      className="coaching-entry__threads"
      aria-label="Related coaching entries"
    >
      {relatedEntries.map(({ entry: related, direction }) => (
        <a
          key={related.id}
          href={`#${related.id}`}
          onClick={(event) => {
            event.preventDefault();
            const target = document.getElementById(related.id);
            target?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
              block: "center",
            });
            target?.focus({ preventScroll: true });
          }}
        >
          ↳ {threadLinkLabel(entry, related, direction)}
        </a>
      ))}
    </nav>
  );
}

function threadLinkLabel(
  entry: CoachingTimelineEntry,
  related: CoachingTimelineEntry,
  direction: CoachingTimelineLink["direction"],
) {
  if (direction === "related") {
    return `Related ${timelineEntryLabel(related.kind)}`;
  }
  return entry.kind === "approved-adaptation" ||
    entry.kind === "declined-adaptation"
    ? `Based on ${timelineEntryLabel(related.kind)}`
    : `In response to ${timelineEntryLabel(related.kind)}`;
}

function CoachingTimelineEntryView({
  entry,
  entries,
  context,
  plannedWorkouts,
  onSelectWorkout,
}: {
  entry: CoachingTimelineEntry;
  entries: CoachingTimelineEntry[];
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onSelectWorkout?: WorkoutSelect;
}) {
  const typeLabel = timelineEntryLabel(entry.kind);
  return (
    <li
      id={entry.id}
      className={`coaching-entry coaching-entry--${entry.kind}`}
      tabIndex={-1}
    >
      <article className="coaching-entry__card">
        <header className="coaching-entry__header">
          <span className="coaching-entry__icon" aria-hidden="true">
            {entry.kind === "feedback"
              ? "“"
              : entry.kind === "workout-result"
                ? "⌁"
                : entry.kind === "approved-adaptation"
                  ? "↗"
                  : "—"}
          </span>
          <span className="eyebrow">{typeLabel}</span>
          <time dateTime={entry.timestamp}>
            {formatDate(entry.timestamp.slice(0, 10))}
          </time>
        </header>
        {entry.kind === "feedback" && (
          <>
            <blockquote>{entry.feedback.rawText}</blockquote>
            {entry.feedback.reported && (
              <dl className="feedback-reported">
                {entry.feedback.reported.sessionRpe !== undefined && (
                  <div>
                    <dt>Effort</dt>
                    <dd>{entry.feedback.reported.sessionRpe}/10 effort</dd>
                  </div>
                )}
                {entry.feedback.reported.legFeel !== undefined && (
                  <div>
                    <dt>Legs</dt>
                    <dd>{entry.feedback.reported.legFeel}</dd>
                  </div>
                )}
                {entry.feedback.reported.painReported !== undefined && (
                  <div>
                    <dt>Pain</dt>
                    <dd>
                      {entry.feedback.reported.painReported
                        ? "Pain reported"
                        : "No pain reported"}
                    </dd>
                  </div>
                )}
                {entry.feedback.reported.stoppedReason !== undefined && (
                  <div>
                    <dt>Why you stopped</dt>
                    <dd>{entry.feedback.reported.stoppedReason}</dd>
                  </div>
                )}
              </dl>
            )}
          </>
        )}
        {entry.kind === "workout-result" && (
          <>
            <h3>{entry.workout?.title ?? "Recorded workout"}</h3>
            <p className="coaching-entry__summary">
              {formatClassification(entry.result.status)} ·{" "}
              {entry.result.summary.completedWorkRepetitions !== undefined &&
              entry.result.summary.plannedWorkRepetitions !== undefined
                ? `${entry.result.summary.completedWorkRepetitions} of ${entry.result.summary.plannedWorkRepetitions} work repetitions · `
                : ""}
              {entry.result.summary.distanceKm} km
            </p>
            <p className="coaching-entry__provenance">
              Based on:{" "}
              {entry.workout
                ? `${formatDate(entry.result.startedAt.slice(0, 10))} · ${entry.workout.title}`
                : `Workout Result ${formatDate(entry.result.startedAt.slice(0, 10))}`}
            </p>
            {entry.workout && onSelectWorkout && (
              <a
                id={`coaching-view-workout-${entry.workout.id}`}
                className="coaching-entry__workout-link"
                href={workspaceRouteHash({
                  kind: "workout",
                  workoutId: entry.workout.id,
                })}
                onClick={(event) => {
                  event.preventDefault();
                  onSelectWorkout(entry.workout!, event.currentTarget);
                }}
              >
                View workout
              </a>
            )}
          </>
        )}
        {entry.kind === "approved-adaptation" && (
          <>
            <h3>{entry.receipt.selectedOption.label}</h3>
            <p className="coaching-entry__summary">approved by you</p>
            <dl className="coaching-entry__facts">
              <div>
                <dt>Plan version</dt>
                <dd>
                  {entry.receipt.planVersionBefore} →{" "}
                  {entry.receipt.planVersionAfter}
                </dd>
              </div>
              <div>
                <dt>Applied</dt>
                <dd>{formatDate(entry.receipt.appliedAt.slice(0, 10))}</dd>
              </div>
              <div>
                <dt>Workouts affected</dt>
                <dd>{entry.receipt.affectedWorkouts.length}</dd>
              </div>
            </dl>
            <p className="coaching-entry__provenance">
              Based on:{" "}
              {[
                ...new Set(
                  entry.receipt.evidenceRefs.map((ref) =>
                    sourceLabelForEvidenceRef(ref, context, plannedWorkouts),
                  ),
                ),
              ].join(" · ") || "No linked Coaching Evidence available."}
            </p>
          </>
        )}
        {entry.kind === "declined-adaptation" && (
          <>
            <h3>{entry.decision.recommendation.label}</h3>
            <p className="coaching-entry__summary">kept current plan</p>
            <dl className="coaching-entry__facts">
              <div>
                <dt>Plan version</dt>
                <dd>{entry.decision.planVersion}</dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>{formatDate(entry.decision.declinedAt.slice(0, 10))}</dd>
              </div>
            </dl>
            <p className="coaching-entry__provenance">
              Based on:{" "}
              {[
                ...new Set(
                  entry.decision.evidenceRefs.map((ref) =>
                    sourceLabelForEvidenceRef(ref, context, plannedWorkouts),
                  ),
                ),
              ].join(" · ") || "No linked Coaching Evidence available."}
            </p>
          </>
        )}
        <TimelineThreadLinks entry={entry} entries={entries} />
      </article>
    </li>
  );
}

function AthleteProfileSummary({ context }: { context: AthleteContextData }) {
  const { profile } = context.athlete;
  return (
    <section className="profile-card" aria-labelledby="profile-title">
      <div className="section-heading section-heading--small">
        <div>
          <span className="eyebrow">Shared profile</span>
          <h2 id="profile-title">Athlete Profile</h2>
        </div>
        <strong className="profile-name">{context.athlete.displayName}</strong>
      </div>
      <dl className="profile-list">
        <div>
          <dt>Target Race</dt>
          <dd>
            {context.targetRace.name} · {formatDate(context.targetRace.date)}
          </dd>
        </div>
        <div>
          <dt>Objective</dt>
          <dd>{formatObjective(context.targetRace.objectiveSeconds)}</dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>
            {profile.preferredLongRunDay.value} long run · up to{" "}
            {profile.maximumWeekdayTrainingDurationMinutes.value} minutes
            weekdays
          </dd>
        </div>
        <div>
          <dt>Constraints</dt>
          <dd>
            Weekday sessions capped at{" "}
            {profile.maximumWeekdayTrainingDurationMinutes.value} minutes
          </dd>
        </div>
        <div>
          <dt>Performance context</dt>
          <dd>
            {profile.normalWeeklyVolumeKm.value.min}–
            {profile.normalWeeklyVolumeKm.value.max} km weekly ·{" "}
            {formatObjective(profile.recentHalfMarathonSeconds.value)}{" "}
            half-marathon ·{" "}
            {formatPace(profile.thresholdPaceSecondsPerKm.value)}/km threshold
          </dd>
        </div>
      </dl>
    </section>
  );
}

function evidenceSummary(
  evidenceRefs: string[],
  context: AthleteContextData,
  plannedWorkouts: PlannedWorkout[],
) {
  return (
    [...new Set(evidenceRefs)]
      .map((ref) => sourceLabelForEvidenceRef(ref, context, plannedWorkouts))
      .join(" · ") || "No linked Coaching Evidence available."
  );
}

function PendingAdaptationCard({
  pending,
  context,
  plannedWorkouts,
  onReview,
}: {
  pending: PendingAdaptationProposal;
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onReview: (reviewId: string, invoker: HTMLButtonElement) => void;
}) {
  return (
    <section
      className="coaching-review-card"
      aria-labelledby="coaching-review-card-title"
    >
      <header className="coaching-review-card__header">
        <span className="eyebrow">
          <span className="attention-dot" aria-hidden="true" />
          Awaiting your review
        </span>
        <time dateTime={pending.openedAt}>
          Opened {formatClock(pending.openedAt, "Europe/London")}
        </time>
      </header>
      <h3 id="coaching-review-card-title">
        {pending.proposal.recommended.label}
      </h3>
      <p>{pending.proposal.rationale.summary}</p>
      <p className="coaching-review-card__provenance">
        Based on:{" "}
        {evidenceSummary(
          pending.proposal.evidenceRefs,
          context,
          plannedWorkouts,
        )}
      </p>
      <button
        id="coaching-review-card"
        className="button button--primary"
        type="button"
        onClick={(event) =>
          onReview(pending.proposal.reviewId, event.currentTarget)
        }
      >
        Review proposal
      </button>
    </section>
  );
}

export function CoachingPane({
  context,
  plannedWorkouts,
  pending,
  declinedAdaptations = [],
  onReview,
  onSelectWorkout,
}: {
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  pending?: PendingAdaptationProposal | null;
  declinedAdaptations?: DeclinedPlanAdaptation[];
  onReview?: (reviewId: string, invoker: HTMLButtonElement) => void;
  onSelectWorkout?: WorkoutSelect;
}) {
  const entries = projectCoachingTimeline(
    context,
    plannedWorkouts,
    declinedAdaptations,
  );
  return (
    <div className="coaching-pane">
      {pending && onReview && (
        <PendingAdaptationCard
          pending={pending}
          context={context}
          plannedWorkouts={plannedWorkouts}
          onReview={onReview}
        />
      )}
      <section
        className="coaching-timeline"
        aria-labelledby="coaching-timeline-title"
      >
        <div className="section-heading section-heading--small">
          <div>
            <span className="eyebrow">Shared coaching story</span>
            <h2 id="coaching-timeline-title" tabIndex={-1}>
              Coaching timeline
            </h2>
          </div>
        </div>
        {entries.length === 0 ? (
          <div className="coaching-timeline__empty">
            <h3>No coaching activity yet</h3>
            <p>
              Athlete Feedback, Coach Recommendations, and Workout Results will
              appear here.
            </p>
          </div>
        ) : (
          <ol className="coaching-timeline-list">
            {entries.map((entry) => (
              <CoachingTimelineEntryView
                key={entry.id}
                entry={entry}
                entries={entries}
                context={context}
                plannedWorkouts={plannedWorkouts}
                onSelectWorkout={onSelectWorkout}
              />
            ))}
          </ol>
        )}
      </section>
      <AthleteProfileSummary context={context} />
    </div>
  );
}

function ContextRail({
  context,
  plannedWorkouts,
  surface,
  pending,
  declinedAdaptations,
  onReview,
  onSelectWorkout,
  onViewAdaptation,
  state,
}: {
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  surface: PaneId;
  pending?: PendingAdaptationProposal | null;
  declinedAdaptations?: DeclinedPlanAdaptation[];
  onReview?: (reviewId: string, invoker: HTMLButtonElement) => void;
  onSelectWorkout?: WorkoutSelect;
  onViewAdaptation?: (adaptationId: string) => void;
  state?: WorkspaceState;
}) {
  const { observations } = context;
  const priorWeekDistanceKm = context.recentTraining
    .filter(({ startedAt }) => {
      const date = startedAt.slice(0, 10);
      return date >= "2026-08-18" && date <= "2026-08-23";
    })
    .reduce((total, result) => total + result.summary.distanceKm, 0);
  if (surface === "coaching") {
    return (
      <CoachingPane
        context={context}
        plannedWorkouts={plannedWorkouts}
        pending={pending}
        declinedAdaptations={declinedAdaptations}
        onReview={onReview}
        onSelectWorkout={onSelectWorkout}
      />
    );
  }
  return (
    <div className="context-rail">
      {surface === "trends" && state && (
        <TrendsPane
          state={state}
          onSelectWorkout={onSelectWorkout}
          onViewAdaptation={onViewAdaptation}
        />
      )}
      {surface === "today" && (
        <section className="race-card">
          <span className="eyebrow">Target Race</span>
          <h2>{context.targetRace.name}</h2>
          <p>{formatDate(context.targetRace.date)}</p>
          <div className="race-objective">
            <span>Objective</span>
            <strong>
              {formatObjective(context.targetRace.objectiveSeconds)}
            </strong>
          </div>
        </section>
      )}
      {surface === "trends" && context.activeCoachingTopics.length > 0 && (
        <section className="monitoring-card" aria-labelledby="monitoring-title">
          <div className="section-heading section-heading--small">
            <div>
              <span className="eyebrow">Longitudinal context</span>
              <h2 id="monitoring-title">Monitoring</h2>
            </div>
          </div>
          <div className="monitoring-topics">
            {context.activeCoachingTopics.map((topic) => (
              <article className="monitoring-topic" key={topic.id}>
                <span className="monitoring-status">
                  {formatClassification(topic.status)}
                </span>
                <h3>{topic.title}</h3>
                <blockquote>{topic.athleteReport}</blockquote>
                <dl className="monitoring-meta">
                  <div>
                    <dt>Recorded</dt>
                    <dd>
                      <time dateTime={topic.latestReportedAt}>
                        {formatDate(topic.latestReportedAt.slice(0, 10))}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Follow-up</dt>
                    <dd>{topic.followUpCondition}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
      {surface === "trends" && (
        <section className="evidence-card">
          <div className="section-heading section-heading--small">
            <div>
              <span className="eyebrow">Shared evidence</span>
              <h2>How you’re arriving</h2>
            </div>
          </div>
          <dl className="metrics-list">
            <div>
              <dt>Recovery</dt>
              <dd>{observations.recovery.percent}%</dd>
              <small>
                {formatClassification(observations.recovery.classification)}
              </small>
            </div>
            <div>
              <dt>Load ratio</dt>
              <dd>{observations.trainingLoad.ratio.toFixed(2)}</dd>
              <small>
                {observations.trainingLoad.shortTerm} short /{" "}
                {observations.trainingLoad.longTerm} long
              </small>
            </div>
            <div>
              <dt>Sleep</dt>
              <dd>{formatSleep(observations.sleep.durationMinutes)}</dd>
              <small>Score {observations.sleep.score}</small>
            </div>
            <div>
              <dt>HRV</dt>
              <dd>{observations.sleepHrvMs.value} ms</dd>
              <small>
                Usual {observations.sleepHrvMs.syntheticNormalRange[0]}–
                {observations.sleepHrvMs.syntheticNormalRange[1]} ms
              </small>
            </div>
            <div>
              <dt>Resting heart rate</dt>
              <dd>{observations.restingHeartRateBpm} bpm</dd>
              <small>Within the seeded normal context</small>
            </div>
            <div>
              <dt>Daily stress</dt>
              <dd>{formatClassification(observations.dailyStress)}</dd>
              <small>No broad stress signal</small>
            </div>
          </dl>
          <p className="evidence-balance">
            Load and recovery support caution. Sleep, HRV, resting heart rate,
            and stress remain within the seeded normal context.
          </p>
          <small className="provenance-label">
            Seeded synthetic observations
          </small>
        </section>
      )}
      {surface === "trends" && (
        <section className="recent-training-card">
          <div className="section-heading section-heading--small">
            <div>
              <span className="eyebrow">Synthetic observation history</span>
              <h2>Recent training</h2>
            </div>
          </div>
          <p className="recent-training-summary">
            {priorWeekDistanceKm} km from 18–23 August
          </p>
          <ol className="recent-training-list">
            {context.recentTraining.map((result) => {
              const date = result.startedAt.slice(0, 10);
              const workout = plannedWorkouts.find(
                ({ id }) => id === result.plannedWorkoutId,
              );
              return (
                <li key={result.id}>
                  <time dateTime={date}>{formatShortDate(date)}</time>
                  <span>{workout?.title ?? "Recorded workout"}</span>
                  <strong>
                    {result.summary.distanceKm} km
                    {result.status === "partial" ? " · partial" : ""}
                  </strong>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function AdaptationComparison({
  rows,
  titleId = "comparison-title",
}: {
  rows: ReviewPreviewRow[];
  titleId?: string;
}) {
  const changedFields = (row: ReviewPreviewRow) => {
    if (!row.before && row.after) return "New Planned Workout";
    if (row.before && !row.after) return "Removed from plan";
    if (!row.before || !row.after) return "No change recorded";
    const fields = (
      ["date", "title", "purpose", "distanceKm", "prescription"] as const
    ).filter(
      (field) =>
        JSON.stringify(row.before?.[field]) !==
        JSON.stringify(row.after?.[field]),
    );
    return fields.length > 0
      ? `Changed: ${fields
          .map((field) =>
            field === "distanceKm"
              ? "distance"
              : field.charAt(0).toUpperCase() + field.slice(1),
          )
          .join(", ")}`
      : "No changed fields";
  };
  return (
    <section className="adaptation-comparison" aria-labelledby={titleId}>
      <div className="section-heading section-heading--small">
        <div>
          <span className="eyebrow">Plan comparison</span>
          <h2 id={titleId}>What would change</h2>
        </div>
        <span className="adaptation-comparison__note">Preview only</span>
      </div>
      <div className="adaptation-comparison__table-wrap">
        <table className="adaptation-comparison__table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Current plan</th>
              <th scope="col">Proposed plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <th scope="row">
                  <time dateTime={row.date}>{formatShortDate(row.date)}</time>
                </th>
                <td className={row.before === null ? "is-changed" : undefined}>
                  {row.before ? (
                    <>
                      <strong>{row.before.title}</strong>
                      <span>{row.before.distanceKm} km</span>
                    </>
                  ) : (
                    "Rest"
                  )}
                </td>
                <td
                  className={row.after === null ? "is-changed" : "is-changed"}
                >
                  {row.after ? (
                    <>
                      <strong>{row.after.title}</strong>
                      <span>{row.after.distanceKm} km</span>
                    </>
                  ) : (
                    "Rest"
                  )}
                  <small>{changedFields(row)}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adaptation-comparison__caption">
        This preview does not change your Training Plan.
      </p>
    </section>
  );
}

function AdaptationOptionContent({
  option,
  selected,
  role,
  plannedWorkouts,
  onSelect,
}: {
  option: AdaptationOption;
  selected: boolean;
  role: "recommendation" | "alternative";
  plannedWorkouts: PlannedWorkout[];
  onSelect: () => void;
}) {
  const prefix =
    role === "recommendation" ? "Coach's recommendation" : "Alternative";
  const rows = buildReviewPreview(plannedWorkouts, option);
  return (
    <article
      className={`adaptation-option adaptation-option--${role} ${selected ? "adaptation-option--selected" : ""}`}
    >
      <button
        className="adaptation-option__select"
        type="button"
        role="radio"
        aria-checked={selected}
        aria-pressed={selected}
        aria-label={`${prefix} — ${option.label}`}
        onClick={onSelect}
      >
        <span className="adaptation-option__radio" aria-hidden="true" />
        <span>
          <span className="eyebrow">{prefix}</span>
          <strong>{option.label}</strong>
        </span>
      </button>
      <p>{option.summary}</p>
      <p className="adaptation-option__tradeoff">
        <strong>Trade-off</strong> {option.tradeoff}
      </p>
      <AdaptationComparison
        rows={rows}
        titleId={`comparison-title-${option.optionId}`}
      />
    </article>
  );
}

function AdaptationUnavailable({
  onBack,
  message = "This proposal is no longer available in the current Training Plan.",
}: {
  onBack: () => void;
  message?: string;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <main
      className="adaptation-screen adaptation-screen--unavailable"
      aria-label="Workout Adaptation unavailable"
    >
      <header className="adaptation-screen__header">
        <button
          className="adaptation-screen__back"
          type="button"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span> Back to Coaching
        </button>
        <span className="adaptation-screen__eyebrow">Workout Adaptation</span>
      </header>
      <section
        className="adaptation-unavailable"
        aria-labelledby="adaptation-unavailable-title"
      >
        <span className="eyebrow">Workout Adaptation</span>
        <h1 id="adaptation-unavailable-title" ref={titleRef} tabIndex={-1}>
          Adaptation unavailable
        </h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function DeclinedAdaptationScreen({
  decision,
  context,
  plannedWorkouts,
  onBack,
}: {
  decision: DeclinedPlanAdaptation;
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onBack: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <main
      className="adaptation-screen adaptation-screen--record"
      aria-label="Workout Adaptation record"
    >
      <header className="adaptation-screen__header">
        <button
          className="adaptation-screen__back"
          type="button"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span> Back to Coaching
        </button>
        <span className="adaptation-screen__eyebrow">Workout Adaptation</span>
        <span className="adaptation-screen__status">KEPT BY YOU</span>
      </header>
      <article className="adaptation-record">
        <span className="eyebrow">Workout Adaptation record</span>
        <h1 ref={titleRef} tabIndex={-1}>
          Current plan kept
        </h1>
        <p className="adaptation-record__lede">
          {decision.recommendation.label} ·{" "}
          {formatDate(decision.declinedAt.slice(0, 10))}
        </p>
        <dl className="adaptation-record__facts">
          <div>
            <dt>Plan version</dt>
            <dd>{decision.planVersion}</dd>
          </div>
          <div>
            <dt>Decision</dt>
            <dd>Keep current plan</dd>
          </div>
        </dl>
        <p>{decision.recommendation.summary}</p>
        <p className="adaptation-record__provenance">
          Based on:{" "}
          {evidenceSummary(decision.evidenceRefs, context, plannedWorkouts)}
        </p>
      </article>
    </main>
  );
}

function ApprovedAdaptationScreen({
  receipt,
  context,
  plannedWorkouts,
  onBack,
}: {
  receipt: AppliedPlanAdaptation;
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onBack: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <main
      className="adaptation-screen adaptation-screen--record"
      aria-label="Workout Adaptation record"
    >
      <header className="adaptation-screen__header">
        <button
          className="adaptation-screen__back"
          type="button"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span> Back to Coaching
        </button>
        <span className="adaptation-screen__eyebrow">Workout Adaptation</span>
        <span className="adaptation-screen__status">APPROVED BY YOU</span>
      </header>
      <article className="adaptation-record">
        <span className="eyebrow">Workout Adaptation record</span>
        <h1 ref={titleRef} tabIndex={-1}>
          Adaptation approved
        </h1>
        <p className="adaptation-record__lede">
          {receipt.selectedOption.label} ·{" "}
          {formatDate(receipt.appliedAt.slice(0, 10))}
        </p>
        <dl className="adaptation-record__facts">
          <div>
            <dt>Plan version</dt>
            <dd>
              {receipt.planVersionBefore} → {receipt.planVersionAfter}
            </dd>
          </div>
          <div>
            <dt>Selected</dt>
            <dd>{receipt.selectedOption.label}</dd>
          </div>
        </dl>
        <section aria-labelledby="record-changes-title">
          <span className="eyebrow">Exact application receipt</span>
          <h2 id="record-changes-title">Changed workouts</h2>
          <ul className="adaptation-record__changes">
            {receipt.affectedWorkouts.map(({ workoutId, before, after }) => (
              <li key={workoutId}>
                <strong>{after?.title ?? before?.title ?? workoutId}</strong>
                <span>
                  {before?.distanceKm ?? "Rest"} → {after?.distanceKm ?? "Rest"}
                  {after ? " km" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <p className="adaptation-record__provenance">
          Based on:{" "}
          {[
            ...new Set(
              receipt.evidenceRefs.map((ref) =>
                sourceLabelForEvidenceRef(ref, context, plannedWorkouts),
              ),
            ),
          ].join(" · ")}
        </p>
      </article>
    </main>
  );
}

export function AdaptationScreen({
  application,
  coordinator,
  reviewId,
  onBack,
  onDecided,
  backLabel = "Back",
}: {
  application: WorkspaceApplication;
  coordinator: ReviewCoordinator;
  reviewId: string;
  onBack: () => void;
  onDecided: (result: unknown) => void;
  backLabel?: string;
}) {
  const workspace = useSyncExternalStore(
    application.subscribe,
    application.getState,
    application.getState,
  );
  const coordinatorState = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getState,
    coordinator.getState,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const record = application.getAdaptationRecord(reviewId);
  const pending = record.status === "pending" ? record.pending : null;
  const review =
    coordinatorState.status === "reviewing" &&
    coordinatorState.proposal.reviewId === reviewId
      ? coordinatorState
      : null;
  const proposal: ReviewProposal | null =
    pending?.proposal ?? review?.proposal ?? null;
  const selectedOptionId =
    pending?.selectedOptionId ?? review?.selectedOptionId ?? null;
  const selectedOption = proposal
    ? [proposal.recommended, proposal.alternative].find(
        ({ optionId }) => optionId === selectedOptionId,
      )
    : undefined;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBack();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onBack]);

  useEffect(() => {
    if (pending && coordinatorState.status === "idle") {
      coordinator.open(pending.proposal, pending.delivery);
    }
  }, [coordinator, coordinatorState.status, pending]);

  if (record.status === "approved") {
    return (
      <ApprovedAdaptationScreen
        receipt={record.receipt}
        context={selectAthleteContextForScreen(application)}
        plannedWorkouts={workspace.trainingPlan.plannedWorkouts}
        onBack={onBack}
      />
    );
  }
  if (record.status === "declined") {
    return (
      <DeclinedAdaptationScreen
        decision={record.decision}
        context={selectAthleteContextForScreen(application)}
        plannedWorkouts={workspace.trainingPlan.plannedWorkouts}
        onBack={onBack}
      />
    );
  }
  if (record.status === "stale") {
    return (
      <AdaptationUnavailable
        onBack={onBack}
        message="This proposal is no longer available because your Training Plan changed."
      />
    );
  }
  if (!proposal) return <AdaptationUnavailable onBack={onBack} />;

  const recommendationRows = buildReviewPreview(
    workspace.trainingPlan.plannedWorkouts,
    proposal.recommended,
  );
  const generation = review?.generation;
  const busy = review?.applying || review?.settling;
  const approve = async () => {
    if (!generation || !selectedOptionId) return;
    const result = await coordinator.approve(generation);
    if (
      typeof result === "object" &&
      result !== null &&
      "status" in result &&
      result.status === "approved"
    ) {
      onDecided(result);
    }
  };
  const decline = async () => {
    const result = await coordinator.decline(generation);
    if (
      typeof result === "object" &&
      result !== null &&
      "status" in result &&
      result.status === "declined"
    ) {
      onDecided(result);
    }
  };

  return (
    <main className="adaptation-screen" aria-label="Workout Adaptation review">
      <header className="adaptation-screen__header">
        <button
          className="adaptation-screen__back"
          type="button"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span> {backLabel}
        </button>
        <span className="adaptation-screen__eyebrow">Workout Adaptation</span>
        <span className="adaptation-screen__status">AWAITING YOUR REVIEW</span>
      </header>
      <article className="adaptation-content">
        <header className="adaptation-content__hero">
          <span className="eyebrow">Coach Recommendation</span>
          <h1 ref={titleRef} tabIndex={-1}>
            Workout Adaptation
          </h1>
          <p className="adaptation-content__lede">
            {proposal.rationale.summary}
          </p>
          <p className="adaptation-content__meta">
            Proposed{" "}
            {formatClock(
              pending?.openedAt ?? workspace.clock.now,
              workspace.clock.timeZone,
            )}{" "}
            · Coach Agent
          </p>
          <p className="adaptation-content__provenance">
            Based on:{" "}
            {[
              ...new Set(
                proposal.evidenceRefs.map((ref) =>
                  sourceLabelForEvidenceRef(
                    ref,
                    selectAthleteContextForScreen(application),
                    workspace.trainingPlan.plannedWorkouts,
                  ),
                ),
              ),
            ].join(" · ")}
          </p>
        </header>
        <section
          className="adaptation-rationale"
          aria-labelledby="rationale-title"
        >
          <div>
            <span className="eyebrow">Reasoning</span>
            <h2 id="rationale-title">Why this is on the table</h2>
          </div>
          <p>{proposal.rationale.counterEvidence}</p>
          <p className="adaptation-rationale__confidence">
            {formatClassification(proposal.rationale.confidence)} confidence
          </p>
          <ul>
            {proposal.rationale.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
        <section
          className="adaptation-options"
          role="radiogroup"
          aria-labelledby="options-title"
        >
          <div className="section-heading section-heading--small">
            <div>
              <span className="eyebrow">Choose deliberately</span>
              <h2 id="options-title">Two ways forward</h2>
            </div>
            <span className="adaptation-options__hint">
              Nothing is selected yet
            </span>
          </div>
          <article
            className={`adaptation-option adaptation-option--recommendation ${selectedOptionId === proposal.recommended.optionId ? "adaptation-option--selected" : ""}`}
          >
            <button
              className="adaptation-option__select"
              type="button"
              role="radio"
              aria-checked={selectedOptionId === proposal.recommended.optionId}
              aria-pressed={selectedOptionId === proposal.recommended.optionId}
              aria-label={`Coach's recommendation — ${proposal.recommended.label}`}
              onClick={() =>
                coordinator.select(proposal!.recommended.optionId, generation)
              }
            >
              <span className="adaptation-option__radio" aria-hidden="true" />
              <span>
                <span className="eyebrow">Coach's recommendation</span>
                <strong>{proposal.recommended.label}</strong>
              </span>
            </button>
            <p>{proposal.recommended.summary}</p>
            <p className="adaptation-option__tradeoff">
              <strong>Trade-off</strong> {proposal.recommended.tradeoff}
            </p>
            <AdaptationComparison rows={recommendationRows} />
          </article>
          <details className="adaptation-alternative">
            <summary>
              <span className="eyebrow">Alternative</span>
              <strong>{proposal.alternative.label}</strong>
            </summary>
            <AdaptationOptionContent
              option={proposal.alternative}
              role="alternative"
              selected={selectedOptionId === proposal.alternative.optionId}
              plannedWorkouts={workspace.trainingPlan.plannedWorkouts}
              onSelect={() =>
                coordinator.select(proposal!.alternative.optionId, generation)
              }
            />
          </details>
        </section>
        {selectedOption && (
          <p className="adaptation-selection-note" role="status">
            Previewing {selectedOption.label}. Your Training Plan has not
            changed.
          </p>
        )}
      </article>
      <footer className="adaptation-actions" aria-label="Adaptation decision">
        <div className="adaptation-actions__state" role="status">
          {selectedOption
            ? `Previewing ${selectedOption.label}. Your Training Plan has not changed.`
            : "Choose an option to preview it before adapting your plan."}
        </div>
        <div className="adaptation-actions__buttons">
          <button
            className="button button--quiet adaptation-actions__decline"
            type="button"
            disabled={Boolean(busy)}
            onClick={decline}
          >
            Keep current plan
          </button>
          <button
            className="button button--primary adaptation-actions__approve"
            type="button"
            disabled={!selectedOptionId || Boolean(busy)}
            aria-label={`Adapt my plan: ${selectedOption?.label ?? proposal.recommended.label}`}
            onClick={approve}
          >
            {busy ? "Saving…" : "Adapt my plan"}
          </button>
        </div>
      </footer>
    </main>
  );
}

function selectAthleteContextForScreen(
  application: WorkspaceApplication,
): AthleteContextData {
  return application.query({ type: "get_athlete_context" }).data;
}

export function WorkspaceApp({
  application,
  paneNavigation,
  reviewCoordinator,
  initialNotice,
  initialDurability,
  coachAgentConnection,
  demoGuidePreference,
  toolActivityStore,
}: WorkspaceAppProps) {
  const state = useSyncExternalStore(
    application.subscribe,
    application.getState,
    application.getState,
  );
  const reviewState = useSyncExternalStore(
    reviewCoordinator.subscribe,
    reviewCoordinator.getState,
    reviewCoordinator.getState,
  );
  const [view, setView] = useState<PlanView>("week");
  const [resetOpen, setResetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() =>
    demoGuidePreference.shouldOpen(),
  );
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [durability, setDurability] = useState(initialDurability);
  useEffect(() => {
    const syncDurability = () => setDurability(application.getDurability());
    syncDurability();
    return application.subscribe(syncDurability);
  }, [application]);
  const latestToolActivity = useSyncExternalStore(
    toolActivityStore.subscribe,
    toolActivityStore.getSnapshot,
    toolActivityStore.getSnapshot,
  );
  const selectedPane = useSyncExternalStore(
    paneNavigation.subscribe,
    paneNavigation.getSelectedPane,
    paneNavigation.getSelectedPane,
  );
  const activeRoute = useSyncExternalStore(
    paneNavigation.subscribe,
    paneNavigation.getRoute,
    paneNavigation.getRoute,
  );
  const panesRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<Record<PaneId, HTMLElement | null>>({
    today: null,
    trends: null,
    coaching: null,
  });
  const scrollFrameRef = useRef<number | null>(null);
  const restorationFrameRef = useRef<number | null>(null);
  const pendingOriginRef = useRef<PaneOriginReceipt | null>(null);
  const workoutScreenRef = useRef<HTMLElement | null>(null);
  const pendingWorkoutOriginRef = useRef<WorkoutOriginReceipt | null>(null);
  const restoredOriginRef = useRef<PaneOriginReceipt | null>(null);
  const pendingTimelineFocusRef = useRef<string | null>(null);
  const appMenuRef = useRef<HTMLDivElement>(null);
  const appMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const appMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const replacePaneHash = useCallback((pane: PaneId) => {
    const nextHash = workspaceRouteHash({ kind: "pane", pane });
    if (window.location.hash === nextHash) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`,
    );
  }, []);

  const revealMobilePane = useCallback((behavior: ScrollBehavior) => {
    const container = panesRef.current;
    if (!container) return;
    const paneTop = container.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY <= paneTop) return;
    window.scrollTo({ top: paneTop, behavior });
  }, []);

  const moveToPane = useCallback(
    (pane: PaneId, forceInstant = false) => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const behavior: ScrollBehavior =
        forceInstant || reduceMotion ? "auto" : "smooth";
      if (window.matchMedia("(max-width: 760px)").matches) {
        const container = panesRef.current;
        if (!container) return;
        container.scrollTo({
          left: PANE_IDS.indexOf(pane) * container.clientWidth,
          behavior,
        });
        revealMobilePane(behavior);
        return;
      }
      paneRefs.current[pane]?.scrollIntoView({ behavior, block: "start" });
    },
    [revealMobilePane],
  );

  const selectPane = useCallback(
    (pane: PaneId, forceInstant = false) => {
      paneNavigation.selectPane(pane);
      replacePaneHash(pane);
      moveToPane(pane, forceInstant);
    },
    [moveToPane, paneNavigation, replacePaneHash],
  );

  const viewAdaptation = useCallback(
    (adaptationId: string) => {
      selectPane("coaching");
      window.requestAnimationFrame(() => {
        const target = document.getElementById(
          `coaching-entry-approved-adaptation-${adaptationId}`,
        );
        target?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "center",
        });
        target?.focus({ preventScroll: true });
      });
    },
    [selectPane],
  );

  const restoreFromLocation = useCallback(
    (restoreCoordinates: boolean) => {
      const parsed = workspaceRouteFromHash(window.location.hash);
      if (parsed?.kind === "adaptation") {
        const origin = paneOriginFromHistoryState(window.history.state);
        paneNavigation.restorePane(origin?.pane ?? "coaching");
        paneNavigation.restoreRoute(parsed);
        return;
      }
      if (
        parsed === null &&
        window.location.hash.toLowerCase().startsWith("#adaptation")
      ) {
        const fallbackRoute: WorkspaceRoute = {
          kind: "adaptation",
          reviewId: "__unavailable__",
        };
        const origin = paneOriginFromHistoryState(window.history.state);
        paneNavigation.restorePane(origin?.pane ?? "coaching");
        paneNavigation.restoreRoute(fallbackRoute);
        return;
      }
      if (parsed?.kind === "workout") {
        const workout = application.query({
          type: "get_workout_context",
          workoutId: parsed.workoutId,
        });
        if (workout.status === "ok") {
          const origin = paneOriginFromHistoryState(window.history.state);
          const workoutFocus = workoutFocusFromHistoryState(
            window.history.state,
          );
          const previousRoute = paneNavigation.getRoute();
          const shouldRestoreWorkoutFocus =
            restoreCoordinates &&
            previousRoute.kind === "workout" &&
            previousRoute.workoutId !== parsed.workoutId &&
            workoutFocus?.workoutId === parsed.workoutId;
          if (origin) paneNavigation.restorePane(origin.pane);
          pendingWorkoutOriginRef.current = shouldRestoreWorkoutFocus
            ? workoutFocus
            : null;
          paneNavigation.restoreRoute(parsed);
          return;
        }
      } else if (parsed?.kind === "pane") {
        pendingWorkoutOriginRef.current = null;
        if (restoreCoordinates) {
          const origin = paneOriginFromHistoryState(window.history.state);
          pendingOriginRef.current =
            origin?.pane === parsed.pane ? origin : null;
        }
        paneNavigation.restoreRoute(parsed);
        moveToPane(parsed.pane, true);
        return;
      }

      const today: WorkspaceRoute = { kind: "pane", pane: "today" };
      window.history.replaceState(
        historyStateWithoutOrigin(),
        "",
        `${window.location.pathname}${window.location.search}${workspaceRouteHash(today)}`,
      );
      pendingOriginRef.current = null;
      pendingWorkoutOriginRef.current = null;
      paneNavigation.restoreRoute(today);
      moveToPane("today", true);
    },
    [application, moveToPane, paneNavigation],
  );

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    restoreFromLocation(false);

    const onPopState = () => restoreFromLocation(true);
    const onHashChange = () => {
      const currentHash = workspaceRouteHash(paneNavigation.getRoute());
      if (window.location.hash === currentHash) return;
      if (paneNavigation.getRoute().kind === "adaptation") {
        const origin = paneOriginFromHistoryState(window.history.state);
        if (
          origin &&
          window.location.hash ===
            workspaceRouteHash({ kind: "pane", pane: origin.pane })
        ) {
          return;
        }
      }
      restoreFromLocation(false);
    };
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const onBreakpointChange = () =>
      moveToPane(paneNavigation.getSelectedPane(), true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    mobileQuery.addEventListener("change", onBreakpointChange);
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
      mobileQuery.removeEventListener("change", onBreakpointChange);
    };
  }, [moveToPane, paneNavigation, restoreFromLocation]);

  useEffect(() => {
    if (activeRoute.kind !== "pane") return;
    const origin = pendingOriginRef.current;
    const timelineFocusId = pendingTimelineFocusRef.current;
    if (
      (!origin || origin.pane !== activeRoute.pane) &&
      timelineFocusId === null
    )
      return;
    pendingOriginRef.current = null;
    pendingTimelineFocusRef.current = null;
    restorationFrameRef.current = window.requestAnimationFrame(() => {
      restorationFrameRef.current = null;
      if (origin && origin.pane === activeRoute.pane) {
        panesRef.current?.scrollTo({
          left: origin.paneScrollLeft,
          behavior: "auto",
        });
        window.scrollTo({ top: origin.windowScrollY, behavior: "auto" });
        document.getElementById(origin.invokerId)?.focus();
        restoredOriginRef.current = origin;
      }
      if (timelineFocusId) {
        const target = document.getElementById(timelineFocusId);
        target?.scrollIntoView({
          behavior: "auto",
          block: "center",
        });
        target?.focus({ preventScroll: true });
        if (activeRoute.pane === "coaching") {
          document
            .getElementById("coaching-pane-title")
            ?.scrollIntoView({ behavior: "auto", block: "start" });
        }
      }
    });
    return () => {
      if (restorationFrameRef.current !== null) {
        window.cancelAnimationFrame(restorationFrameRef.current);
        restorationFrameRef.current = null;
      }
    };
  }, [activeRoute]);

  useEffect(() => {
    if (activeRoute.kind !== "workout") return;
    const origin = pendingWorkoutOriginRef.current;
    if (!origin || origin.workoutId !== activeRoute.workoutId) return;
    pendingWorkoutOriginRef.current = null;
    restorationFrameRef.current = window.requestAnimationFrame(() => {
      restorationFrameRef.current = null;
      document.getElementById(origin.invokerId)?.focus({ preventScroll: true });
      if (workoutScreenRef.current) {
        workoutScreenRef.current.scrollTop = origin.workoutScrollTop;
      }
    });
    return () => {
      if (restorationFrameRef.current !== null) {
        window.cancelAnimationFrame(restorationFrameRef.current);
        restorationFrameRef.current = null;
      }
    };
  }, [activeRoute]);

  useEffect(() => {
    const updateFromGeometry = () => {
      scrollFrameRef.current = null;
      if (paneNavigation.getRoute().kind !== "pane") return;
      if (pendingOriginRef.current) return;
      if (restoredOriginRef.current) {
        if (window.scrollY === restoredOriginRef.current.windowScrollY) {
          paneNavigation.restorePane(restoredOriginRef.current.pane);
          replacePaneHash(restoredOriginRef.current.pane);
          return;
        }
        restoredOriginRef.current = null;
      }
      let pane: PaneId;
      if (window.matchMedia("(max-width: 760px)").matches) {
        const container = panesRef.current;
        if (!container || container.clientWidth === 0) return;
        const index = Math.max(
          0,
          Math.min(
            PANE_IDS.length - 1,
            Math.round(container.scrollLeft / container.clientWidth),
          ),
        );
        pane = PANE_IDS[index];
      } else {
        const readingLine = 150;
        pane = "today";
        let closestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of PANE_IDS) {
          const section = paneRefs.current[candidate];
          if (section) {
            const distance = Math.abs(
              section.getBoundingClientRect().top - readingLine,
            );
            if (distance < closestDistance) {
              closestDistance = distance;
              pane = candidate;
            }
          }
        }
      }
      const previousPane = paneNavigation.getSelectedPane();
      paneNavigation.restorePane(pane);
      replacePaneHash(pane);
      if (
        pane !== previousPane &&
        window.matchMedia("(max-width: 760px)").matches
      ) {
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth";
        revealMobilePane(behavior);
      }
    };
    const scheduleUpdate = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateFromGeometry);
    };
    const container = panesRef.current;
    container?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      container?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [paneNavigation, replacePaneHash, revealMobilePane]);
  useEffect(() => {
    if (reviewState.status !== "reviewing") return;
    setGuideOpen(false);
  }, [reviewState.status]);
  const openAdaptationRoute = useCallback(
    (reviewId: string, invoker?: HTMLElement) => {
      const currentRoute = paneNavigation.getRoute();
      if (
        currentRoute.kind === "adaptation" &&
        currentRoute.reviewId === reviewId
      )
        return;
      const pane = paneNavigation.getSelectedPane();
      const origin: PaneOriginReceipt = {
        version: 1,
        kind: "pane-origin",
        pane,
        windowScrollY: window.scrollY,
        paneScrollLeft: panesRef.current?.scrollLeft ?? 0,
        invokerId: invoker?.id || "coaching-timeline-title",
      };
      const stateWithOrigin = historyStateWithOrigin(origin);
      window.history.replaceState(
        stateWithOrigin,
        "",
        `${window.location.pathname}${window.location.search}${workspaceRouteHash({ kind: "pane", pane })}`,
      );
      const adaptationRoute: WorkspaceRoute = {
        kind: "adaptation",
        reviewId,
      };
      window.history.pushState(
        stateWithOrigin,
        "",
        `${window.location.pathname}${window.location.search}${workspaceRouteHash(adaptationRoute)}`,
      );
      paneNavigation.pushAdaptation(reviewId);
    },
    [paneNavigation],
  );
  useEffect(() => {
    if (reviewState.status !== "reviewing") return;
    openAdaptationRoute(reviewState.proposal.reviewId);
  }, [openAdaptationRoute, reviewState]);
  useEffect(() => {
    if (!appMenuOpen) return;
    appMenuItemRefs.current[0]?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !appMenuRef.current?.contains(target)) {
        setAppMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [appMenuOpen]);
  const focusAppMenuTrigger = () => {
    appMenuTriggerRef.current?.focus();
  };
  const openGuideFromMenu = () => {
    setAppMenuOpen(false);
    focusAppMenuTrigger();
    setGuideOpen(true);
  };
  const openResetFromMenu = () => {
    setAppMenuOpen(false);
    focusAppMenuTrigger();
    setResetOpen(true);
  };
  const handleAppMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = appMenuItemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null,
    );
    if (event.key === "Escape") {
      event.preventDefault();
      setAppMenuOpen(false);
      focusAppMenuTrigger();
      return;
    }
    if (event.key === "Tab") {
      setAppMenuOpen(false);
      return;
    }
    if (items.length === 0) return;
    const currentIndex = Math.max(
      0,
      items.indexOf(document.activeElement as HTMLButtonElement),
    );
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      items[(currentIndex + delta + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };
  const latestAdaptation = state.adaptationReceipts.at(-1);
  const adaptedWorkoutIds = new Set(
    latestAdaptation?.affectedWorkouts
      .filter(({ after }) => after !== null)
      .map(({ workoutId }) => workoutId) ?? [],
  );
  const week = application.query({
    type: "get_week_training_plan",
    weekStart: "2026-08-24",
  });
  const month = application.query({
    type: "get_month_training_plan",
    month: "2026-08",
  });
  const athleteContext = application.query({ type: "get_athlete_context" });
  const selectedContext =
    activeRoute.kind === "workout"
      ? application.query({
          type: "get_workout_context",
          workoutId: activeRoute.workoutId,
        })
      : null;
  const connectionLabel =
    coachAgentConnection.status === "connected"
      ? "connected"
      : coachAgentConnection.status === "error"
        ? "error"
        : "unavailable";

  const openWorkout: WorkoutSelect = (workout, invoker) => {
    if (activeRoute.kind === "workout") {
      const origin: WorkoutOriginReceipt = {
        version: 1,
        kind: "workout-origin",
        workoutId: activeRoute.workoutId,
        workoutScrollTop: workoutScreenRef.current?.scrollTop ?? 0,
        invokerId: invoker.id,
      };
      const stateWithFocus = historyStateWithFocus(origin);
      window.history.replaceState(
        stateWithFocus,
        "",
        `${window.location.pathname}${window.location.search}${workspaceRouteHash(activeRoute)}`,
      );
      const workoutRoute: WorkspaceRoute = {
        kind: "workout",
        workoutId: workout.id,
      };
      const stateWithOrigin = historyStateWithOrigin(origin);
      window.history.pushState(
        stateWithOrigin,
        "",
        `${window.location.pathname}${window.location.search}${workspaceRouteHash(workoutRoute)}`,
      );
      paneNavigation.pushWorkout(workout.id);
      return;
    }

    const pane =
      invoker.closest<HTMLElement>("#trends") !== null
        ? "trends"
        : paneNavigation.getSelectedPane();
    const origin: PaneOriginReceipt = {
      version: 1,
      kind: "pane-origin",
      pane,
      windowScrollY: window.scrollY,
      paneScrollLeft: panesRef.current?.scrollLeft ?? 0,
      invokerId: invoker.id,
    };
    const stateWithOrigin = historyStateWithOrigin(origin);
    window.history.replaceState(
      stateWithOrigin,
      "",
      `${window.location.pathname}${window.location.search}${workspaceRouteHash({ kind: "pane", pane: origin.pane })}`,
    );
    const workoutRoute: WorkspaceRoute = {
      kind: "workout",
      workoutId: workout.id,
    };
    window.history.pushState(
      stateWithOrigin,
      "",
      `${window.location.pathname}${window.location.search}${workspaceRouteHash(workoutRoute)}`,
    );
    paneNavigation.pushWorkout(workout.id);
  };

  const closeAdaptation = () => {
    const origin = paneOriginFromHistoryState(window.history.state);
    if (origin) {
      window.history.back();
      return;
    }
    const coaching: WorkspaceRoute = { kind: "pane", pane: "coaching" };
    window.history.replaceState(
      historyStateWithoutOrigin(),
      "",
      `${window.location.pathname}${window.location.search}${workspaceRouteHash(coaching)}`,
    );
    paneNavigation.restoreRoute(coaching);
    moveToPane("coaching", true);
  };

  const handleAdaptationDecided = (result: unknown) => {
    const routeReviewId =
      activeRoute.kind === "adaptation" ? activeRoute.reviewId : null;
    const resultReviewId =
      typeof result === "object" &&
      result !== null &&
      "reviewId" in result &&
      typeof result.reviewId === "string"
        ? result.reviewId
        : routeReviewId;
    if (!resultReviewId) return;
    const resultStatus =
      typeof result === "object" &&
      result !== null &&
      "status" in result &&
      typeof result.status === "string"
        ? result.status
        : null;
    const entryKind =
      resultStatus === "approved"
        ? "approved-adaptation"
        : resultStatus === "declined"
          ? "declined-adaptation"
          : null;
    if (entryKind) {
      pendingTimelineFocusRef.current = coachingEntryId(
        entryKind,
        resultReviewId,
      );
    }
    const coaching: WorkspaceRoute = { kind: "pane", pane: "coaching" };
    window.history.replaceState(
      historyStateWithoutOrigin(),
      "",
      `${window.location.pathname}${window.location.search}${workspaceRouteHash(coaching)}`,
    );
    paneNavigation.restoreRoute(coaching);
    moveToPane("coaching", true);
  };

  const closeWorkout = () => {
    const origin =
      workoutOriginFromHistoryState(window.history.state) ??
      paneOriginFromHistoryState(window.history.state);
    if (origin) {
      window.history.back();
      return;
    }
    const today: WorkspaceRoute = { kind: "pane", pane: "today" };
    window.history.replaceState(
      historyStateWithoutOrigin(),
      "",
      `${window.location.pathname}${window.location.search}${workspaceRouteHash(today)}`,
    );
    paneNavigation.restoreRoute(today);
    moveToPane("today", true);
  };

  const resetDemo = async () => {
    await Promise.resolve(reviewCoordinator.reset());
    const outcome = await application.command({ type: "reset_demo" });
    const today: WorkspaceRoute = { kind: "pane", pane: "today" };
    window.history.replaceState(
      historyStateWithoutOrigin(),
      "",
      `${window.location.pathname}${window.location.search}${workspaceRouteHash(today)}`,
    );
    pendingOriginRef.current = null;
    pendingTimelineFocusRef.current = null;
    paneNavigation.restoreRoute(today);
    moveToPane("today", true);
    setDurability(outcome.durability);
    setView("week");
    setResetOpen(false);
    demoGuidePreference.reset();
    toolActivityStore.clear();
    setGuideOpen(true);
    setNotice("Demo restored to its starting Training Plan.");
  };

  const continueToWorkspace = () => {
    demoGuidePreference.markSeen();
    setGuideOpen(false);
  };

  const workoutScreenActive =
    !resetOpen &&
    activeRoute.kind === "workout" &&
    selectedContext?.status === "ok";
  const paneOrigin = paneOriginFromHistoryState(window.history.state);
  const workoutOrigin = workoutOriginFromHistoryState(window.history.state);
  const workoutOriginContext = workoutOrigin
    ? application.query({
        type: "get_workout_context",
        workoutId: workoutOrigin.workoutId,
      })
    : null;
  const backLabel =
    workoutOrigin && workoutOriginContext?.status === "ok"
      ? `Back to ${workoutOriginContext.data.plannedWorkout.title}`
      : `Back to ${PANE_LABELS[paneOrigin?.pane ?? paneNavigation.getSelectedPane()]}`;
  const adaptationScreenActive =
    !resetOpen && activeRoute.kind === "adaptation";
  const pushedScreenActive = workoutScreenActive || adaptationScreenActive;

  return (
    <div className="app-shell">
      <div
        className="app-underlay"
        inert={pushedScreenActive ? true : undefined}
        aria-hidden={pushedScreenActive ? true : undefined}
      >
        <header className="topbar">
          <a
            className="brand"
            href="#today"
            aria-label="Your Last Coach home"
            onClick={(event) => {
              event.preventDefault();
              selectPane("today");
            }}
          >
            <span className="brand-mark" aria-hidden="true">
              Y
            </span>
            <span>Your Last Coach</span>
          </a>
          <div className="topbar-actions">
            <div className="status-wrap">
              <span
                className="status-indicator"
                role="status"
                aria-label={`Coach Agent connection: ${connectionLabel}`}
              >
                <span
                  className={`status-dot status-dot--${coachAgentConnection.status}`}
                />
                Coach Agent {connectionLabel}
              </span>
            </div>
            <div className="app-menu" ref={appMenuRef}>
              <button
                ref={appMenuTriggerRef}
                className="app-menu__trigger"
                type="button"
                aria-label="Open app menu"
                aria-haspopup="menu"
                aria-expanded={appMenuOpen}
                aria-controls="app-menu"
                onClick={() => setAppMenuOpen((open) => !open)}
              >
                <span aria-hidden="true">⋯</span>
              </button>
              {appMenuOpen && (
                <div
                  id="app-menu"
                  className="app-menu__list"
                  role="menu"
                  aria-label="App menu"
                  onKeyDown={handleAppMenuKeyDown}
                >
                  <button
                    ref={(element) => {
                      appMenuItemRefs.current[0] = element;
                    }}
                    className="app-menu__item"
                    type="button"
                    role="menuitem"
                    tabIndex={0}
                    onClick={openGuideFromMenu}
                  >
                    Demo Guide
                  </button>
                  <button
                    ref={(element) => {
                      appMenuItemRefs.current[1] = element;
                    }}
                    className="app-menu__item"
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={openResetFromMenu}
                  >
                    Reset demo
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {durability === "memory_only" && (
          <div className="notice notice--warning" role="status">
            Browser storage is unavailable. Changes will last only until this
            page is reloaded.
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}

        <main className="workspace-shell" id="training-plan">
          <nav className="pane-nav" aria-label="Workspace sections">
            {PANE_IDS.map((pane) => (
              <button
                key={pane}
                className="pane-nav__button"
                aria-label={`Show ${PANE_LABELS[pane]} pane`}
                aria-current={selectedPane === pane ? "page" : undefined}
                onClick={() => selectPane(pane)}
              >
                <span className="pane-nav__dot" aria-hidden="true" />
                <span className="pane-nav__label">{PANE_LABELS[pane]}</span>
              </button>
            ))}
          </nav>

          <div
            ref={panesRef}
            className="workspace-panes"
            role="group"
            aria-label="Workspace panes"
            tabIndex={0}
          >
            <section
              ref={(element) => {
                paneRefs.current.today = element;
              }}
              className="workspace-pane"
              id="today"
              aria-label="Today"
            >
              <div className="workspace workspace--today">
                <section className="plan-column">
                  <header className="plan-hero">
                    <div>
                      <span className="eyebrow">
                        Shared Coaching Workspace · {state.athlete.displayName}
                      </span>
                      <h1>Your Training Plan</h1>
                      <p>
                        Build aerobic strength, absorb the work, and arrive
                        ready for {state.targetRace.name}.
                      </p>
                    </div>
                    <div className="hero-meta">
                      <span>{state.trainingPhase.name}</span>
                      <strong>
                        {formatClock(state.clock.now, state.clock.timeZone)}
                      </strong>
                      <small>
                        Plan version {state.trainingPlan.planVersion}
                      </small>
                    </div>
                  </header>

                  <nav className="view-switch" aria-label="Training Plan view">
                    {(["week", "month"] as const).map((planView) => (
                      <button
                        key={planView}
                        aria-pressed={view === planView}
                        onClick={() => setView(planView)}
                      >
                        {planView === "week" ? "Week" : "Month"}
                      </button>
                    ))}
                  </nav>

                  {view === "week" ? (
                    <WeekPlan
                      workouts={week.plannedWorkouts}
                      currentDate={state.clock.now.slice(0, 10)}
                      onSelect={openWorkout}
                      adaptedWorkoutIds={adaptedWorkoutIds}
                    />
                  ) : (
                    <MonthPlan
                      workouts={month.plannedWorkouts}
                      onSelect={openWorkout}
                      adaptedWorkoutIds={adaptedWorkoutIds}
                    />
                  )}
                </section>
                <ContextRail
                  context={athleteContext.data}
                  plannedWorkouts={month.plannedWorkouts}
                  surface="today"
                />
              </div>
            </section>

            <section
              ref={(element) => {
                paneRefs.current.trends = element;
              }}
              className="workspace-pane"
              id="trends"
              aria-label="Trends"
            >
              <div className="pane-heading">
                <span className="eyebrow">Shared Coaching Workspace</span>
                <h2>Trends</h2>
                <p>Recent Coaching Evidence from the current training build.</p>
              </div>
              <div className="workspace workspace--single">
                <ContextRail
                  context={athleteContext.data}
                  plannedWorkouts={month.plannedWorkouts}
                  surface="trends"
                  state={state}
                  onSelectWorkout={openWorkout}
                  onViewAdaptation={viewAdaptation}
                />
              </div>
            </section>

            <section
              ref={(element) => {
                paneRefs.current.coaching = element;
              }}
              className="workspace-pane"
              id="coaching"
              aria-label="Coaching"
            >
              <div className="pane-heading">
                <span className="eyebrow">Shared Coaching Workspace</span>
                <h2 id="coaching-pane-title">Coaching</h2>
                <p>
                  A readable account of Athlete Feedback, Workout Results, and
                  approved Plan Adaptations.
                </p>
              </div>
              <div className="workspace workspace--single">
                <ContextRail
                  context={athleteContext.data}
                  plannedWorkouts={month.plannedWorkouts}
                  surface="coaching"
                  pending={state.pendingAdaptationProposal}
                  declinedAdaptations={state.declinedAdaptations}
                  onReview={openAdaptationRoute}
                  onSelectWorkout={openWorkout}
                />
              </div>
            </section>
          </div>
        </main>
      </div>

      {workoutScreenActive && selectedContext?.status === "ok" && (
        <WorkoutDetailScreen
          key={
            activeRoute.kind === "workout" ? activeRoute.workoutId : "workout"
          }
          context={selectedContext.data}
          application={application}
          onDurability={setDurability}
          onSelectWorkout={openWorkout}
          screenRef={workoutScreenRef}
          backLabel={backLabel}
          onBack={closeWorkout}
        />
      )}
      {resetOpen ? (
        <ResetDialog onCancel={() => setResetOpen(false)} onReset={resetDemo} />
      ) : adaptationScreenActive && activeRoute.kind === "adaptation" ? (
        <AdaptationScreen
          application={application}
          coordinator={reviewCoordinator}
          reviewId={activeRoute.reviewId}
          backLabel={`Back to ${PANE_LABELS[paneOriginFromHistoryState(window.history.state)?.pane ?? "coaching"]}`}
          onBack={closeAdaptation}
          onDecided={handleAdaptationDecided}
        />
      ) : !workoutScreenActive && guideOpen ? (
        <DemoGuide
          connection={coachAgentConnection}
          latestActivity={latestToolActivity}
          onContinue={continueToWorkspace}
          onReset={() => setResetOpen(true)}
        />
      ) : null}
    </div>
  );
}
