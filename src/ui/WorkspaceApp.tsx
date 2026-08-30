import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
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
  PANE_IDS,
  type PaneNavigation,
  type PaneId,
  type WorkspaceRoute,
  workspaceRouteFromHash,
  workspaceRouteHash,
} from "../application/createPaneNavigation";
import type { PlannedWorkout } from "../domain/types";
import { useModalFocus } from "./useModalFocus";

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

const NAVIGATION_STATE_KEY = "yourLastCoachNavigation";

interface PaneOriginReceipt {
  version: 1;
  kind: "pane-origin";
  pane: PaneId;
  windowScrollY: number;
  paneScrollLeft: number;
  invokerId: string;
}

function paneOriginFromHistoryState(value: unknown): PaneOriginReceipt | null {
  if (typeof value !== "object" || value === null) return null;
  const receipt = (value as Record<string, unknown>)[NAVIGATION_STATE_KEY];
  if (typeof receipt !== "object" || receipt === null) return null;
  const candidate = receipt as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    candidate.kind !== "pane-origin" ||
    !PANE_IDS.includes(candidate.pane as PaneId) ||
    typeof candidate.windowScrollY !== "number" ||
    !Number.isFinite(candidate.windowScrollY) ||
    typeof candidate.paneScrollLeft !== "number" ||
    !Number.isFinite(candidate.paneScrollLeft) ||
    typeof candidate.invokerId !== "string"
  )
    return null;
  return candidate as unknown as PaneOriginReceipt;
}

function historyStateWithOrigin(origin: PaneOriginReceipt) {
  const current = window.history.state;
  return {
    ...(typeof current === "object" && current !== null ? current : {}),
    [NAVIGATION_STATE_KEY]: origin,
  };
}

function historyStateWithoutOrigin() {
  const current = window.history.state;
  if (typeof current !== "object" || current === null) return null;
  const next = { ...(current as Record<string, unknown>) };
  delete next[NAVIGATION_STATE_KEY];
  return next;
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

type WorkoutSelect = (
  workout: PlannedWorkout,
  invoker: HTMLButtonElement,
) => void;

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

function PlannedWorkoutScreen({
  context,
  backLabel,
  onBack,
}: {
  context: WorkoutContextData;
  backLabel: string;
  onBack: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const workout = context.plannedWorkout;
  const repeatBlock = workout.prescription.blocks.find(
    (block) => block.kind === "repeat",
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <main className="workout-screen" aria-label="Planned Workout">
      <header className="workout-screen__header">
        <button
          className="workout-screen__back"
          onClick={onBack}
          aria-label={backLabel}
        >
          <span aria-hidden="true">←</span>
          Back
        </button>
        <span className="workout-screen__status">PLANNED</span>
      </header>
      <article className="workout-detail">
        <header className="workout-detail__title">
          <div className="workout-detail__meta">
            <time dateTime={workout.date}>{formatDate(workout.date)}</time>
            <span>{formatClassification(workout.type)}</span>
          </div>
          <h1 ref={titleRef} tabIndex={-1}>
            {workout.title}
          </h1>
        </header>

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
                <td>{workout.distanceKm} km</td>
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

function ContextRail({
  context,
  plannedWorkouts,
  surface,
}: {
  context: AthleteContextData;
  plannedWorkouts: PlannedWorkout[];
  surface: PaneId;
}) {
  const { observations } = context;
  const profile = context.athlete.profile;
  const priorWeekDistanceKm = context.recentTraining
    .filter(({ startedAt }) => {
      const date = startedAt.slice(0, 10);
      return date >= "2026-08-18" && date <= "2026-08-23";
    })
    .reduce((total, result) => total + result.summary.distanceKm, 0);
  return (
    <div className="context-rail">
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
      {surface === "coaching" && (
        <section className="profile-card" aria-labelledby="profile-title">
          <div className="section-heading section-heading--small">
            <div>
              <span className="eyebrow">Shared profile</span>
              <h2 id="profile-title">Athlete Profile</h2>
            </div>
          </div>
          <dl className="profile-list">
            <div>
              <dt>Normal weekly volume</dt>
              <dd>
                {profile.normalWeeklyVolumeKm.value.min}–
                {profile.normalWeeklyVolumeKm.value.max} km
              </dd>
            </div>
            <div>
              <dt>Recent half-marathon</dt>
              <dd>
                {formatObjective(profile.recentHalfMarathonSeconds.value)}
              </dd>
            </div>
            <div>
              <dt>Threshold pace</dt>
              <dd>{formatPace(profile.thresholdPaceSecondsPerKm.value)}/km</dd>
            </div>
            <div>
              <dt>Preferred long run</dt>
              <dd>{profile.preferredLongRunDay.value}</dd>
            </div>
            <div>
              <dt>Maximum weekday session</dt>
              <dd>
                {profile.maximumWeekdayTrainingDurationMinutes.value} minutes
              </dd>
            </div>
          </dl>
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
      {surface === "coaching" && context.recentAthleteFeedback.length > 0 && (
        <section className="feedback-card" aria-labelledby="feedback-title">
          <div className="section-heading section-heading--small">
            <div>
              <span className="eyebrow">What you told me</span>
              <h2 id="feedback-title">Athlete Feedback</h2>
            </div>
          </div>
          <ol className="feedback-list">
            {context.recentAthleteFeedback.map((feedback) => (
              <li key={feedback.id}>
                <blockquote>{feedback.rawText}</blockquote>
                {feedback.reported && (
                  <dl className="feedback-reported">
                    {feedback.reported.sessionRpe !== undefined && (
                      <div>
                        <dt>Effort</dt>
                        <dd>{feedback.reported.sessionRpe}/10 effort</dd>
                      </div>
                    )}
                    {feedback.reported.legFeel !== undefined && (
                      <div>
                        <dt>Legs</dt>
                        <dd>{feedback.reported.legFeel}</dd>
                      </div>
                    )}
                    {feedback.reported.painReported !== undefined && (
                      <div>
                        <dt>Pain</dt>
                        <dd>
                          {feedback.reported.painReported
                            ? "Pain reported"
                            : "No pain reported"}
                        </dd>
                      </div>
                    )}
                    {feedback.reported.stoppedReason !== undefined && (
                      <div>
                        <dt>Why you stopped</dt>
                        <dd>{feedback.reported.stoppedReason}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {surface === "coaching" && context.recentAdaptationHistory.length > 0 && (
        <section
          className="adaptation-history-card"
          aria-labelledby="adaptation-history-title"
        >
          <div className="section-heading section-heading--small">
            <div>
              <span className="eyebrow">App-owned changes</span>
              <h2 id="adaptation-history-title">Recent plan adaptations</h2>
            </div>
          </div>
          <ol className="adaptation-history-list">
            {context.recentAdaptationHistory.map((receipt) => (
              <li key={receipt.reviewId}>
                <strong>{receipt.selectedOption.label}</strong>
                <div className="adaptation-history-meta">
                  <span>
                    Plan {receipt.planVersionBefore} →{" "}
                    {receipt.planVersionAfter}
                  </span>
                  <time dateTime={receipt.appliedAt}>
                    {formatDate(receipt.appliedAt.slice(0, 10))}
                  </time>
                  <span>
                    {receipt.affectedWorkouts.length} workouts affected
                  </span>
                </div>
              </li>
            ))}
          </ol>
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

export function ReviewModal({
  coordinator,
  onApproved,
}: {
  coordinator: ReviewCoordinator;
  onApproved?: (durability: Durability) => void;
}) {
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const review = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getState,
    coordinator.getState,
  );
  const dialogRef = useRef<HTMLElement>(null);
  const dismiss = () => {
    if (review.status === "reviewing")
      void coordinator.dismiss("athlete_dismissed", review.generation);
  };
  useModalFocus(dialogRef, dismiss, review.status === "reviewing");

  if (review.status !== "reviewing") return null;
  const { proposal } = review;
  const approve = async () => {
    setApprovalError(null);
    const result = (await coordinator.approve(review.generation)) as {
      status: string;
      durability?: Durability;
      message?: string;
    };
    if (result.status === "approved" && result.durability) {
      onApproved?.(result.durability);
    } else if (result.status === "error") {
      setApprovalError(result.message ?? "The Training Plan was not changed.");
    }
  };
  const optionButton = (
    option: typeof proposal.recommended,
    role: "recommendation" | "alternative",
  ) => {
    const selected = review.selectedOptionId === option.optionId;
    const prefix =
      role === "recommendation" ? "Coach's recommendation" : "Alternative";
    return (
      <button
        className={`review-option review-option--${role} ${selected ? "review-option--selected" : ""}`}
        aria-pressed={selected}
        aria-label={`${prefix} — ${option.label}`}
        {...(role === "recommendation" ? { "data-initial-focus": true } : {})}
        onClick={() => coordinator.select(option.optionId, review.generation)}
      >
        <span className="eyebrow">{prefix}</span>
        <strong>{option.label}</strong>
        <span>{option.summary}</span>
        <small>{option.tradeoff}</small>
      </button>
    );
  };

  return (
    <div
      className="dialog-backdrop review-backdrop"
      role="presentation"
      onMouseDown={() =>
        void coordinator.dismiss("athlete_dismissed", review.generation)
      }
    >
      <section
        ref={dialogRef}
        className="review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button"
          onClick={() =>
            void coordinator.dismiss("athlete_dismissed", review.generation)
          }
          aria-label="Close adaptation review"
        >
          ×
        </button>
        <span className="eyebrow">Coach Recommendation</span>
        <h2 id="review-title">Review Workout Adaptations</h2>
        <p className="review-summary">{proposal.rationale.summary}</p>
        <div className="review-evidence">
          <strong>
            {formatClassification(proposal.rationale.confidence)} confidence
          </strong>
          <p>{proposal.rationale.counterEvidence}</p>
          <ul>
            {proposal.rationale.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
        <div className="review-options">
          {optionButton(proposal.recommended, "recommendation")}
          {optionButton(proposal.alternative, "alternative")}
        </div>
        {review.preview.length > 0 && (
          <section className="review-preview" aria-labelledby="preview-title">
            <h3 id="preview-title">Calendar preview</h3>
            <p>Selection only. Your Training Plan has not changed.</p>
            <ol>
              {review.preview.map((row) => (
                <li key={`${review.selectedOptionId}-${row.date}`}>
                  <time dateTime={row.date}>{formatShortDate(row.date)}</time>
                  <span>
                    {row.before?.title ?? "Rest"} → {row.after?.title ?? "Rest"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="dialog-actions review-actions">
          <button
            className="button button--quiet"
            disabled={review.applying}
            onClick={() => void coordinator.discussFurther(review.generation)}
          >
            None — discuss further
          </button>
          {review.selectedOptionId && (
            <button
              className="button button--primary"
              disabled={review.applying}
              onClick={approve}
            >
              {review.applying ? "Adapting plan…" : "Adapt my plan"}
            </button>
          )}
        </div>
        {approvalError && <p role="alert">{approvalError}</p>}
      </section>
    </div>
  );
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
  const [notice, setNotice] = useState(initialNotice);
  const [durability, setDurability] = useState(initialDurability);
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

  const restoreFromLocation = useCallback(
    (restoreCoordinates: boolean) => {
      const parsed = workspaceRouteFromHash(window.location.hash);
      if (parsed?.kind === "workout") {
        const workout = application.query({
          type: "get_workout_context",
          workoutId: parsed.workoutId,
        });
        if (workout.status === "ok") {
          const origin = paneOriginFromHistoryState(window.history.state);
          if (origin) paneNavigation.restorePane(origin.pane);
          paneNavigation.restoreRoute(parsed);
          return;
        }
      } else if (parsed?.kind === "pane") {
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
    if (!origin || origin.pane !== activeRoute.pane) return;
    pendingOriginRef.current = null;
    restorationFrameRef.current = window.requestAnimationFrame(() => {
      restorationFrameRef.current = null;
      panesRef.current?.scrollTo({
        left: origin.paneScrollLeft,
        behavior: "auto",
      });
      window.scrollTo({ top: origin.windowScrollY, behavior: "auto" });
      document.getElementById(origin.invokerId)?.focus();
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
      if (paneNavigation.getRoute().kind === "workout") return;
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
    const origin: PaneOriginReceipt = {
      version: 1,
      kind: "pane-origin",
      pane: paneNavigation.getSelectedPane(),
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

  const closeWorkout = () => {
    const origin = paneOriginFromHistoryState(window.history.state);
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
    reviewState.status !== "reviewing" &&
    activeRoute.kind === "workout" &&
    selectedContext?.status === "ok";

  return (
    <div className="app-shell">
      <div
        className="app-underlay"
        inert={workoutScreenActive ? true : undefined}
        aria-hidden={workoutScreenActive ? true : undefined}
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
              <button
                className="status-button"
                aria-label={`Coach Agent connection: ${connectionLabel}`}
                aria-haspopup="dialog"
                onClick={() => setGuideOpen(true)}
              >
                <span
                  className={`status-dot status-dot--${coachAgentConnection.status}`}
                />
                Coach Agent {connectionLabel}
              </button>
            </div>
            <button
              className="button button--quiet"
              onClick={() => setResetOpen(true)}
            >
              Reset demo
            </button>
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
                <h2>Coaching</h2>
                <p>Athlete Profile and the latest shared coaching context.</p>
              </div>
              <div className="workspace workspace--single">
                <ContextRail
                  context={athleteContext.data}
                  plannedWorkouts={month.plannedWorkouts}
                  surface="coaching"
                />
              </div>
            </section>
          </div>
        </main>
      </div>

      {workoutScreenActive && selectedContext?.status === "ok" && (
        <PlannedWorkoutScreen
          context={selectedContext.data}
          backLabel={`Back to ${PANE_LABELS[paneOriginFromHistoryState(window.history.state)?.pane ?? paneNavigation.getSelectedPane()]}`}
          onBack={closeWorkout}
        />
      )}
      {resetOpen ? (
        <ResetDialog onCancel={() => setResetOpen(false)} onReset={resetDemo} />
      ) : reviewState.status === "reviewing" ? (
        <ReviewModal
          coordinator={reviewCoordinator}
          onApproved={setDurability}
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
