import {
  useCallback,
  useEffect,
  useId,
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
  DEMO_ADAPTATION_HISTORY,
  DEMO_WEEKLY_PROGRESS_REVIEWS,
  type CoachingNotebookReview,
  type SeededAdaptationHistoryEntry,
} from "../demo/demoCoachingNotebook";
import { selectTodayPane } from "../application/today";
import type { TrendsRange } from "../application/trends";
import { projectWorkoutResultMetrics } from "../application/workoutResultMetrics";
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
import { BrandMark } from "./BrandMark";
import { ResultDetailChart } from "./charts/ResultDetailChart";
import { normalizeResultLaps } from "./charts/resultDetailMath";
import {
  formatDistanceKm,
  formatDurationSeconds,
  formatHeartRateBpm,
  formatPacePerKm,
  formatPaceSeconds,
} from "./metricFormatters";
import { TrendsPane, TrendsRangeControl } from "./charts/TrendsPane";
import { TodayPane } from "./TodayPane";

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

const PANE_LABELS: Record<PaneId, string> = {
  today: "Overview",
  trends: "Trends",
  coaching: "Coaching",
};

/**
 * Below this width the workspace keeps the horizontal scroll-snap panes with
 * pagination dots. At and above it, panes are switched: the selected pane fills
 * the content region and the others are `hidden`.
 */
const COMPACT_LAYOUT_QUERY = "(max-width: 760px)";

function compactLayoutMatches() {
  return window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
}

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

function formatDemoDate(now: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(now));
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

type WorkoutSelect = (workout: PlannedWorkout, invoker: HTMLElement) => void;

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
  const metrics = projectWorkoutResultMetrics(result);
  return (
    <section className="workout-result-section" aria-labelledby="stats-title">
      <h2 id="stats-title">Workout Result</h2>
      <dl className="workout-stats">
        <WorkoutStat
          label="Distance"
          value={formatDistanceKm(metrics.distanceKm)}
        />
        <WorkoutStat
          label="Time"
          value={
            metrics.durationSeconds === null
              ? "No duration recorded"
              : formatDurationSeconds(metrics.durationSeconds)
          }
        />
        <WorkoutStat
          label="Average pace"
          value={
            metrics.averagePaceSecondsPerKm === null
              ? "No average pace recorded"
              : formatPacePerKm(metrics.averagePaceSecondsPerKm)
          }
          basis={metrics.averagePaceBasis === "derived" ? "Derived" : undefined}
        />
        <WorkoutStat
          label="Average HR"
          value={
            metrics.averageHeartRateBpm === null
              ? "No average HR recorded"
              : formatHeartRateBpm(metrics.averageHeartRateBpm)
          }
        />
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
      <h2 id="plan-actual-title">Plan versus actual</h2>
      <dl className="plan-actual-list">
        <div>
          <dt>Distance</dt>
          <dd className="plan-actual-list__values">
            <span>
              <small>Planned</small>
              <strong>{formatDistanceKm(workout.distanceKm)}</strong>
            </span>
            <span>
              <small>Actual</small>
              <strong>{formatDistanceKm(result.summary.distanceKm)}</strong>
            </span>
            <span>
              <small>Difference</small>
              <strong>
                {formatDelta(
                  result.summary.distanceKm - workout.distanceKm,
                  "km",
                )}
              </strong>
            </span>
          </dd>
        </div>
        {repeatBlock?.kind === "repeat" && (
          <div>
            <dt>Work repetitions</dt>
            <dd className="plan-actual-list__values">
              <span>
                <small>Planned</small>
                <strong>{repeatBlock.repetitions} repetitions</strong>
              </span>
              <span>
                <small>Actual</small>
                <strong>
                  {result.summary.completedWorkRepetitions === undefined
                    ? "Not recorded"
                    : `${result.summary.completedWorkRepetitions} repetitions`}
                </strong>
              </span>
              <span>
                <small>Difference</small>
                <strong>
                  {result.summary.completedWorkRepetitions === undefined
                    ? "Not available"
                    : formatDelta(
                        result.summary.completedWorkRepetitions -
                          repeatBlock.repetitions,
                        "repetitions",
                      )}
                </strong>
              </span>
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
                <td>{formatDistanceKm(lap.distanceKm)}</td>
                <td>
                  {lap.paceSecondsPerKm === null
                    ? "Not recorded"
                    : formatPacePerKm(lap.paceSecondsPerKm)}
                </td>
                <td>
                  {lap.averageHeartRateBpm === null
                    ? "Not recorded"
                    : formatHeartRateBpm(lap.averageHeartRateBpm)}
                </td>
                <td>
                  {lap.maximumHeartRateBpm === null
                    ? "Not recorded"
                    : formatHeartRateBpm(lap.maximumHeartRateBpm)}
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
      <h2 id="previous-attempts-title">Previous attempts</h2>
      <ol className="previous-attempts-list">
        {context.previousAttempts.map(({ plannedWorkout, workoutResult }) => {
          const metrics = projectWorkoutResultMetrics(workoutResult);
          const date = formatDate(workoutResult.startedAt.slice(0, 10));
          const label = `View previous attempt ${date} · ${formatDistanceKm(workoutResult.summary.distanceKm)}`;
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
                      {formatDistanceKm(workoutResult.summary.distanceKm)}
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
                      {formatDistanceKm(workoutResult.summary.distanceKm)}
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
                  <dd>
                    {metrics.averagePaceSecondsPerKm === null
                      ? "Not recorded"
                      : formatPacePerKm(metrics.averagePaceSecondsPerKm)}
                  </dd>
                </div>
                <div>
                  <dt>Average HR</dt>
                  <dd>
                    {metrics.averageHeartRateBpm === null
                      ? "Not recorded"
                      : formatHeartRateBpm(metrics.averageHeartRateBpm)}
                  </dd>
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

function WorkoutStructure({ workout }: { workout: PlannedWorkout }) {
  return (
    <section aria-labelledby="structure-title">
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
              ? `${block.repetitions} × ${block.workDistanceKm} km at ${formatPaceSeconds(block.targetPaceSecondsPerKm.min)}–${formatPaceSeconds(block.targetPaceSecondsPerKm.max)}/km · ${block.recoverySeconds} seconds easy jog`
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
  );
}

function CoachIntentSection({ workout }: { workout: PlannedWorkout }) {
  return (
    <section className="workout-detail__intent" aria-labelledby="intent-title">
      <h2 id="intent-title">Intent</h2>
      <p>{workout.purpose}</p>
    </section>
  );
}

function PlannedPrescriptionSections({ workout }: { workout: PlannedWorkout }) {
  const repeatBlock = workout.prescription.blocks.find(
    (block) => block.kind === "repeat",
  );
  const targets = workout.targets;
  const paceRange =
    targets?.paceSecondsPerKm ??
    (repeatBlock?.kind === "repeat"
      ? repeatBlock.targetPaceSecondsPerKm
      : undefined);
  const recoveryProtocol =
    targets?.recoveryProtocol ??
    (repeatBlock?.kind === "repeat"
      ? `${repeatBlock.recoverySeconds} seconds easy jog between repetitions`
      : undefined);
  return (
    <>
      <WorkoutStructure workout={workout} />

      <section aria-labelledby="targets-title">
        <h2 id="targets-title">Targets</h2>
        <table className="workout-targets">
          <tbody>
            <tr>
              <th scope="row">Target pace</th>
              <td>
                {paceRange
                  ? `${formatPaceSeconds(paceRange.min)}–${formatPaceSeconds(paceRange.max)}/km`
                  : "No pace target recorded"}
              </td>
            </tr>
            <tr>
              <th scope="row">Effort / heart-rate guidance</th>
              <td>{targets?.effortGuidance ?? "No guidance recorded"}</td>
            </tr>
            <tr>
              <th scope="row">Planned distance</th>
              <td>{formatDistanceKm(workout.distanceKm)}</td>
            </tr>
            <tr>
              <th scope="row">Planned duration</th>
              <td>
                {targets?.durationSeconds
                  ? `${formatDurationSeconds(targets.durationSeconds.min)}–${formatDurationSeconds(targets.durationSeconds.max)}`
                  : "No duration recorded"}
              </td>
            </tr>
            <tr>
              <th scope="row">Recovery protocol</th>
              <td>{recoveryProtocol ?? "No recovery protocol recorded"}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}

function WorkoutResultSections({
  workout,
  result,
}: {
  workout: PlannedWorkout;
  result: WorkoutResult | null;
}) {
  if (!result) {
    return (
      <section className="workout-result-section" aria-labelledby="stats-title">
        <h2 id="stats-title">Workout Result</h2>
        <p className="workout-result__empty">
          Not completed yet — distance, time, pace, heart rate, and the plan
          versus actual comparison will appear here once this workout is
          recorded.
        </p>
      </section>
    );
  }
  const laps = normalizeResultLaps(result.laps);
  return (
    <>
      <WorkoutStats result={result} />
      <PlanVersusActual workout={workout} result={result} />
      <section
        className="workout-result-section"
        aria-labelledby="lap-chart-title"
      >
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
        {result?.status !== "partial" && (
          <span className="workout-screen__status">
            {result ? result.status.toUpperCase() : "PLANNED"}
          </span>
        )}
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
        <CoachIntentSection workout={workout} />
        <PlannedPrescriptionSections workout={workout} />
        <WorkoutResultSections workout={workout} result={result} />
        <WorkoutPreviousAttempts
          context={context}
          onSelectWorkout={onSelectWorkout}
        />
        <WorkoutFeedback
          context={context}
          application={application}
          onDurability={onDurability}
        />
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

const DEMO_PROMPTS = [
  {
    id: "analyse",
    stage: "Analyse",
    prompt:
      "Compare today's incomplete threshold workout with my previous threshold session. What do the pace and heart-rate changes suggest? Don't change my plan.",
  },
  {
    id: "record-and-adapt",
    stage: "Record and adapt",
    prompt:
      "My legs felt heavy from the warm-up, the reps felt like 9 out of 10, and I stopped because I couldn't hold the pace. My shin didn't hurt today. Record that, then prepare your recommendation and one meaningful alternative for the rest of this week. Show both options in the workspace before changing my plan.",
  },
  {
    id: "continue",
    stage: "Continue in a fresh conversation",
    prompt:
      "What changed in my latest approved adaptation, and what context from this workspace should influence my next workout?",
  },
] as const;

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
  const [copyNotice, setCopyNotice] = useState<{
    promptId: string;
    message: string;
  } | null>(null);
  const copyPrompt = async (promptId: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyNotice({ promptId, message: "Prompt copied." });
    } catch {
      setCopyNotice({
        promptId,
        message: "Select the prompt and copy it from this guide.",
      });
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

          <div className="guide-prompts" aria-label="Coach Agent demo prompts">
            {DEMO_PROMPTS.map(({ id, stage, prompt }, index) => (
              <section
                key={id}
                className="guide-prompt"
                aria-labelledby={`prompt-title-${id}`}
              >
                <div>
                  <span className="eyebrow">Stage {index + 1}</span>
                  <h3 id={`prompt-title-${id}`}>{stage}</h3>
                </div>
                <blockquote>{prompt}</blockquote>
                <button
                  className="button button--quiet"
                  onClick={() => void copyPrompt(id, prompt)}
                  aria-label={`Copy ${stage} prompt`}
                >
                  Copy prompt
                </button>
                {copyNotice?.promptId === id && (
                  <p className="guide-copy-notice" role="status">
                    {copyNotice.message}
                  </p>
                )}
              </section>
            ))}
          </div>

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
            {formatPaceSeconds(profile.thresholdPaceSecondsPerKm.value)}/km
            threshold
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

function MonitoringCard({ context }: { context: AthleteContextData }) {
  if (context.activeCoachingTopics.length === 0) return null;
  return (
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
  );
}

function RecentTrainingCard({
  context,
  plannedWorkouts,
}: {
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
}) {
  const priorWeekDistanceKm = context.recentTraining
    .filter(({ startedAt }) => {
      const date = startedAt.slice(0, 10);
      return date >= "2026-08-18" && date <= "2026-08-23";
    })
    .reduce((total, result) => total + result.summary.distanceKm, 0);
  return (
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
  );
}

function reviewDateRange(review: CoachingNotebookReview) {
  const start = new Date(`${review.weekStart}T00:00:00Z`);
  const end = new Date(`${review.weekEnd}T00:00:00Z`);
  if (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth()
  ) {
    return `${start.getUTCDate()}–${formatDate(review.weekEnd)}`;
  }
  return `${formatDate(review.weekStart)}–${formatDate(review.weekEnd)}`;
}

function EvidenceReferences({
  evidenceRefs,
  context,
  plannedWorkouts,
  onSelectWorkout,
}: {
  evidenceRefs: string[];
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onSelectWorkout?: WorkoutSelect;
}) {
  const evidenceListId = useId();
  const references = [...new Set(evidenceRefs)].map((ref) => {
    const result = workoutResultForEvidenceRef(ref, context);
    const plannedWorkoutId = ref.startsWith("planned-workout:")
      ? ref.slice("planned-workout:".length)
      : result?.plannedWorkoutId;
    const workout = plannedWorkouts.find(({ id }) => id === plannedWorkoutId);
    return {
      ref,
      label: sourceLabelForEvidenceRef(ref, context, plannedWorkouts),
      workout,
      opensTrends:
        ref.startsWith("observation:") &&
        !sourceLabelForEvidenceRef(ref, context, plannedWorkouts).startsWith(
          "Evidence reference ",
        ),
    };
  });
  if (references.length === 0) {
    return (
      <p className="notebook-empty notebook-empty--inline">
        Evidence unavailable.
      </p>
    );
  }
  return (
    <nav className="evidence-reference-list" aria-label="Supporting evidence">
      {references.map(({ ref, label, workout, opensTrends }, index) => {
        if (!workout && !opensTrends) {
          return (
            <span className="evidence-reference-list__literal" key={ref}>
              {label}
            </span>
          );
        }
        return (
          <a
            id={`${evidenceListId}-evidence-${index}`}
            key={ref}
            href={
              workout
                ? workspaceRouteHash({ kind: "workout", workoutId: workout.id })
                : "#trends"
            }
            onClick={
              workout && onSelectWorkout
                ? (event) => {
                    event.preventDefault();
                    onSelectWorkout(workout, event.currentTarget);
                  }
                : undefined
            }
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

function ReviewSections({
  review,
  headingLevel = 4,
}: {
  review: CoachingNotebookReview;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const sections = [
    { label: "Progress", statements: review.progress },
    { label: "Watch", statements: review.watch },
    { label: "Next focus", statements: review.nextFocus },
  ];
  return (
    <div className="weekly-review-sections">
      {sections.map(({ label, statements }) => (
        <section key={label}>
          <Heading>{label}</Heading>
          {statements.length === 0 ? (
            <p className="weekly-review-sections__quiet">
              Nothing new to flag.
            </p>
          ) : (
            <ul>
              {statements.map((statement) => (
                <li key={statement}>{statement}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function LatestWeeklyReview({
  review,
  context,
  plannedWorkouts,
  onSelectWorkout,
}: {
  review: CoachingNotebookReview | null;
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onSelectWorkout?: WorkoutSelect;
}) {
  return (
    <section
      className="notebook-card latest-weekly-review"
      aria-label="Latest Weekly Progress Review"
    >
      <div className="notebook-card__heading">
        <div>
          <span className="eyebrow">Latest Weekly Progress Review</span>
          <h2>
            {review ? reviewDateRange(review) : "No completed review yet"}
          </h2>
        </div>
        {review && (
          <time dateTime={review.recordedAt}>
            Recorded {formatDate(review.recordedAt.slice(0, 10))}
          </time>
        )}
      </div>
      {review ? (
        <>
          <h3>{review.headline}</h3>
          <p className="latest-weekly-review__assessment">
            {review.assessment}
          </p>
          <ReviewSections review={review} />
          <div className="notebook-provenance">
            <span>Coaching Evidence</span>
            <EvidenceReferences
              evidenceRefs={review.evidenceRefs}
              context={context}
              plannedWorkouts={plannedWorkouts}
              onSelectWorkout={onSelectWorkout}
            />
          </div>
        </>
      ) : (
        <p className="notebook-empty">
          A completed Monday–Sunday review will appear here when one is
          recorded.
        </p>
      )}
    </section>
  );
}

function CoachingTopicsCard({
  context,
  plannedWorkouts,
  onSelectWorkout,
}: {
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onSelectWorkout?: WorkoutSelect;
}) {
  return (
    <section
      className="notebook-card coaching-topics-card"
      aria-label="Coaching Topics"
    >
      <div className="notebook-card__heading">
        <div>
          <span className="eyebrow">Still shaping future coaching</span>
          <h2>Coaching Topics</h2>
        </div>
      </div>
      {context.activeCoachingTopics.length === 0 ? (
        <p className="notebook-empty">No active Coaching Topics.</p>
      ) : (
        <div className="coaching-topic-list">
          {context.activeCoachingTopics.map((topic) => (
            <article className="coaching-topic" key={topic.id}>
              <header>
                <h3>{topic.title}</h3>
                <span>{formatClassification(topic.status)}</span>
              </header>
              <blockquote>{topic.athleteReport}</blockquote>
              <dl>
                <div>
                  <dt>Matters when</dt>
                  <dd>{topic.followUpCondition}</dd>
                </div>
                <div>
                  <dt>Last reported</dt>
                  <dd>
                    <time dateTime={topic.latestReportedAt}>
                      {formatDate(topic.latestReportedAt.slice(0, 10))}
                    </time>
                  </dd>
                </div>
              </dl>
              <EvidenceReferences
                evidenceRefs={topic.evidenceRefs}
                context={context}
                plannedWorkouts={plannedWorkouts}
                onSelectWorkout={onSelectWorkout}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewArchive({
  reviews,
  context,
  plannedWorkouts,
  onSelectWorkout,
}: {
  reviews: CoachingNotebookReview[];
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  onSelectWorkout?: WorkoutSelect;
}) {
  return (
    <section
      className="notebook-card review-archive"
      aria-label="Weekly Progress Review archive"
    >
      <div className="notebook-card__heading">
        <div>
          <span className="eyebrow">Prior assessments</span>
          <h2>Review archive</h2>
        </div>
      </div>
      {reviews.length === 0 ? (
        <p className="notebook-empty">No prior reviews yet.</p>
      ) : (
        <div className="review-archive-list">
          {reviews.map((review) => (
            <details className="review-archive-entry" key={review.id}>
              <summary>
                <span>
                  <time dateTime={review.weekEnd}>
                    {formatDate(review.weekEnd)}
                  </time>
                  <strong>{review.headline}</strong>
                </span>
                <span aria-hidden="true">＋</span>
              </summary>
              <div className="review-archive-entry__body">
                <p>{review.assessment}</p>
                <ReviewSections review={review} headingLevel={3} />
                <EvidenceReferences
                  evidenceRefs={review.evidenceRefs}
                  context={context}
                  plannedWorkouts={plannedWorkouts}
                  onSelectWorkout={onSelectWorkout}
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function AdaptationHistoryCard({
  context,
  seededAdaptations,
  onReview,
}: {
  context: AthleteContextData;
  seededAdaptations: SeededAdaptationHistoryEntry[];
  onReview?: (reviewId: string, invoker: HTMLElement) => void;
}) {
  const adaptations = [
    ...context.recentAdaptationHistory.map((receipt) => ({
      id: receipt.reviewId,
      label: receipt.selectedOption.label,
      appliedAt: receipt.appliedAt,
      affectedWorkoutCount: receipt.affectedWorkouts.length,
      planVersionBefore: receipt.planVersionBefore,
      planVersionAfter: receipt.planVersionAfter,
      reviewId: receipt.reviewId,
    })),
    ...seededAdaptations.map((entry) => ({ ...entry, reviewId: null })),
  ].sort(
    (a, b) =>
      Date.parse(b.appliedAt) - Date.parse(a.appliedAt) ||
      b.id.localeCompare(a.id),
  );
  return (
    <section
      className="notebook-card adaptation-history"
      aria-label="Adaptation History"
    >
      <div className="notebook-card__heading">
        <div>
          <span className="eyebrow">Decisions that changed the plan</span>
          <h2>Adaptation History</h2>
        </div>
      </div>
      {adaptations.length === 0 ? (
        <p className="notebook-empty">No approved adaptations yet.</p>
      ) : (
        <ol className="adaptation-history-list">
          {adaptations.map((adaptation) => (
            <li
              id={coachingEntryId("approved-adaptation", adaptation.id)}
              key={adaptation.id}
              tabIndex={-1}
            >
              <header>
                <h3>{adaptation.label}</h3>
                <time dateTime={adaptation.appliedAt}>
                  {formatDate(adaptation.appliedAt.slice(0, 10))}
                </time>
              </header>
              <p>
                {adaptation.affectedWorkoutCount} workouts · Plan v
                {adaptation.planVersionBefore} → v{adaptation.planVersionAfter}
              </p>
              {adaptation.reviewId && (
                <a
                  href={workspaceRouteHash({
                    kind: "adaptation",
                    reviewId: adaptation.reviewId,
                  })}
                  id={`${coachingEntryId("approved-adaptation", adaptation.id)}-receipt-link`}
                  onClick={(event) => {
                    if (!onReview) return;
                    event.preventDefault();
                    onReview(adaptation.reviewId, event.currentTarget);
                  }}
                >
                  Inspect receipt
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CoachingPane({
  context,
  plannedWorkouts,
  onSelectWorkout,
  onReview,
  reviews = DEMO_WEEKLY_PROGRESS_REVIEWS,
  seededAdaptations = DEMO_ADAPTATION_HISTORY,
}: {
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  pending?: PendingAdaptationProposal | null;
  declinedAdaptations?: DeclinedPlanAdaptation[];
  onReview?: (reviewId: string, invoker: HTMLElement) => void;
  onSelectWorkout?: WorkoutSelect;
  onViewAdaptation?: (reviewId: string) => void;
  reviews?: CoachingNotebookReview[];
  seededAdaptations?: SeededAdaptationHistoryEntry[];
}) {
  const orderedReviews = [...reviews].sort(
    (a, b) =>
      b.weekEnd.localeCompare(a.weekEnd) ||
      Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
      b.id.localeCompare(a.id),
  );
  return (
    <div className="coaching-pane coaching-notebook">
      <LatestWeeklyReview
        review={orderedReviews[0] ?? null}
        context={context}
        plannedWorkouts={plannedWorkouts}
        onSelectWorkout={onSelectWorkout}
      />
      <CoachingTopicsCard
        context={context}
        plannedWorkouts={plannedWorkouts}
        onSelectWorkout={onSelectWorkout}
      />
      <ReviewArchive
        reviews={orderedReviews.slice(1)}
        context={context}
        plannedWorkouts={plannedWorkouts}
        onSelectWorkout={onSelectWorkout}
      />
      <AdaptationHistoryCard
        context={context}
        seededAdaptations={seededAdaptations}
        onReview={onReview}
      />
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
  trendsRange = "4w",
  onTrendsRangeChange,
}: {
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  surface: PaneId;
  trendsRange?: TrendsRange;
  onTrendsRangeChange?: (range: TrendsRange) => void;
  pending?: PendingAdaptationProposal | null;
  declinedAdaptations?: DeclinedPlanAdaptation[];
  onReview?: (reviewId: string, invoker: HTMLElement) => void;
  onSelectWorkout?: WorkoutSelect;
  onViewAdaptation?: (adaptationId: string) => void;
  state?: WorkspaceState;
}) {
  const { observations } = context;
  if (surface === "coaching") {
    return (
      <CoachingPane
        context={context}
        plannedWorkouts={plannedWorkouts}
        pending={pending}
        declinedAdaptations={declinedAdaptations}
        onReview={onReview}
        onSelectWorkout={onSelectWorkout}
        onViewAdaptation={onViewAdaptation}
      />
    );
  }
  return (
    <div className="context-rail">
      {surface === "trends" && state && (
        <TrendsPane
          state={state}
          range={trendsRange}
          onRangeChange={onTrendsRangeChange}
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
  const [compactLayout, setCompactLayout] = useState(compactLayoutMatches);
  const [trendsRange, setTrendsRange] = useState<TrendsRange>("4w");
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

  useEffect(() => {
    const query = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const onChange = () => setCompactLayout(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
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
      if (compactLayoutMatches()) {
        const container = panesRef.current;
        if (!container) return;
        container.scrollTo({
          left: PANE_IDS.indexOf(pane) * container.clientWidth,
          behavior,
        });
        revealMobilePane(behavior);
        return;
      }
      // Switched view: the pane replaces the previous one, so reading starts at
      // its top rather than wherever the outgoing pane was scrolled to.
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [revealMobilePane],
  );

  const selectPane = useCallback(
    (pane: PaneId, forceInstant = false) => {
      restoredOriginRef.current = null;
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
          coachingEntryId("approved-adaptation", adaptationId),
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
    const mobileQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
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
      // Only the scroll-snap layout derives the selected pane from geometry.
      // In the switched view the tabs are the only thing that changes panes.
      if (!compactLayoutMatches()) return;
      const container = panesRef.current;
      if (!container || container.clientWidth === 0) return;
      const index = Math.max(
        0,
        Math.min(
          PANE_IDS.length - 1,
          Math.round(container.scrollLeft / container.clientWidth),
        ),
      );
      const pane = PANE_IDS[index];
      const previousPane = paneNavigation.getSelectedPane();
      paneNavigation.restorePane(pane);
      replacePaneHash(pane);
      if (pane !== previousPane) {
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

  // One nav element, placed by layout: inside the app bar as labelled tabs when
  // panes are switched, and left as the floating dot pill for scroll-snap.
  const paneTabs = (
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
  );

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
            <BrandMark className="brand-mark" />
            <span>Your Last Coach</span>
          </a>
          {paneTabs}
          <div className="topbar-actions">
            <time
              className="demo-date"
              dateTime={state.clock.now}
              title="The demo timeline is frozen"
            >
              Demo date ·{" "}
              {formatDemoDate(state.clock.now, state.clock.timeZone)}
            </time>
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
              aria-label="Overview"
              hidden={!compactLayout && selectedPane !== "today"}
            >
              <div className="workspace workspace--single workspace--today">
                <TodayPane
                  projection={selectTodayPane(state)}
                  onViewPendingProposal={(invoker) => {
                    const pending = state.pendingAdaptationProposal;
                    if (!pending) return;
                    openAdaptationRoute(pending.proposal.reviewId, invoker);
                  }}
                  onSelectWorkout={openWorkout}
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
              hidden={!compactLayout && selectedPane !== "trends"}
            >
              <div className="pane-heading">
                <div className="pane-heading__title">
                  <span className="eyebrow">Shared Coaching Workspace</span>
                  <h2>Trends</h2>
                  <p>
                    Recent Coaching Evidence from the current training build.
                  </p>
                </div>
                {!compactLayout && (
                  <div className="pane-heading__controls">
                    <TrendsRangeControl
                      range={trendsRange}
                      onRangeChange={setTrendsRange}
                    />
                  </div>
                )}
              </div>
              <div className="workspace workspace--single">
                <ContextRail
                  context={athleteContext.data}
                  plannedWorkouts={month.plannedWorkouts}
                  surface="trends"
                  state={state}
                  trendsRange={trendsRange}
                  onTrendsRangeChange={
                    compactLayout ? setTrendsRange : undefined
                  }
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
              hidden={!compactLayout && selectedPane !== "coaching"}
            >
              <div className="pane-heading">
                <div className="pane-heading__title">
                  <span className="eyebrow">Shared Coaching Workspace</span>
                  <h2 id="coaching-pane-title">Coaching</h2>
                  <p>
                    A weekly notebook of what your Coach has learned, what still
                    matters, and the decisions that shaped your plan.
                  </p>
                </div>
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
