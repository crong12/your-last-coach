import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { Durability } from "../application/ports";
import type { WorkspaceApplication } from "../application/createWorkspaceApplication";
import type {
  PlannedWorkout,
  WorkoutResult,
  WorkspaceState,
} from "../domain/types";

interface WorkspaceAppProps {
  application: WorkspaceApplication;
  initialNotice: string | null;
  initialDurability: Durability;
}

type PlanView = "week" | "month";

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

function workoutTone(workout: PlannedWorkout) {
  if (workout.id === "planned-2026-08-26-threshold") return "incomplete";
  return workout.type;
}

function WorkoutButton({
  workout,
  onSelect,
  compact = false,
}: {
  workout: PlannedWorkout;
  onSelect: (workout: PlannedWorkout) => void;
  compact?: boolean;
}) {
  return (
    <button
      className={`workout-card workout-card--${workoutTone(workout)} ${compact ? "workout-card--compact" : ""}`}
      onClick={() => onSelect(workout)}
      aria-label={`${workout.title}, ${workout.date}, ${workout.distanceKm} kilometres, open details`}
    >
      <span className="workout-card__type">
        {workoutTone(workout) === "incomplete"
          ? "Partial result"
          : workout.type.replace("_", " ")}
      </span>
      <strong>{workout.title}</strong>
      {!compact && <span>{workout.purpose}</span>}
    </button>
  );
}

function WeekPlan({
  workouts,
  onSelect,
}: {
  workouts: PlannedWorkout[];
  onSelect: (workout: PlannedWorkout) => void;
}) {
  return (
    <section className="plan-panel" aria-labelledby="week-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">This week</span>
          <h2 id="week-title">24–30 August</h2>
        </div>
        <p>32 km remain after Wednesday’s partial session.</p>
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
                <WorkoutButton workout={workout} onSelect={onSelect} />
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
}: {
  workouts: PlannedWorkout[];
  onSelect: (workout: PlannedWorkout) => void;
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

function WorkoutDetails({
  workout,
  result,
  onClose,
}: {
  workout: PlannedWorkout;
  result?: WorkoutResult;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close workout details"
        >
          ×
        </button>
        <span className="eyebrow">Planned Workout · {workout.date}</span>
        <h2 id="workout-title">{workout.title}</h2>
        <p className="detail-purpose">{workout.purpose}</p>
        <div className="detail-grid">
          <section>
            <h3>Planned prescription</h3>
            <ol className="prescription-list">
              {workout.prescription.blocks.map((block, index) => (
                <li key={`${block.kind}-${index}`}>
                  <strong>
                    {block.kind === "repeat"
                      ? `${block.repetitions} × ${block.workDistanceKm} km`
                      : `${block.distanceKm} km`}
                  </strong>
                  <span>
                    {block.kind === "repeat"
                      ? `${formatPace(block.targetPaceSecondsPerKm.min)}–${formatPace(block.targetPaceSecondsPerKm.max)}/km · ${block.recoverySeconds}s jog`
                      : block.kind}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="result-panel">
            <h3>Workout Result</h3>
            {result ? (
              <>
                <div className="result-score">
                  <strong>
                    {result.summary.completedWorkRepetitions ?? "Complete"}
                  </strong>
                  <span>
                    {result.summary.plannedWorkRepetitions
                      ? `of ${result.summary.plannedWorkRepetitions} work repetitions`
                      : "recorded"}
                  </span>
                </div>
                <ul className="lap-list">
                  {result.laps
                    .filter((lap) => lap.kind === "work")
                    .map((lap, index) => (
                      <li key={lap.id}>
                        <span>Rep {index + 1}</span>
                        <strong>
                          {formatPace(lap.paceSecondsPerKm ?? 0)}/km ·{" "}
                          {lap.averageHeartRateBpm} bpm
                        </strong>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p>No Workout Result yet.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function ResetDialog({
  onCancel,
  onReset,
}: {
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
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
          <button className="button button--quiet" onClick={onCancel}>
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

function ContextRail({ state }: { state: WorkspaceState }) {
  return (
    <aside className="context-rail" aria-label="Shared coaching context">
      <section className="race-card">
        <span className="eyebrow">Target Race</span>
        <h2>{state.targetRace.name}</h2>
        <p>4 April 2027</p>
        <div className="race-objective">
          <span>Objective</span>
          <strong>3:40</strong>
        </div>
      </section>
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
            <dd>46%</dd>
            <small>Partially recovered</small>
          </div>
          <div>
            <dt>Load ratio</dt>
            <dd>1.33</dd>
            <small>68 short / 51 long</small>
          </div>
          <div>
            <dt>Sleep</dt>
            <dd>7h 22</dd>
            <small>Score 81</small>
          </div>
          <div>
            <dt>HRV</dt>
            <dd>55 ms</dd>
            <small>Usual 49–63 ms</small>
          </div>
        </dl>
        <p className="evidence-balance">
          Load and recovery support caution. Sleep, HRV, resting heart rate, and
          stress remain within the seeded normal context.
        </p>
      </section>
    </aside>
  );
}

export function WorkspaceApp({
  application,
  initialNotice,
  initialDurability,
}: WorkspaceAppProps) {
  const state = useSyncExternalStore(
    application.subscribe,
    application.getState,
    application.getState,
  );
  const [view, setView] = useState<PlanView>("week");
  const [selectedWorkout, setSelectedWorkout] = useState<PlannedWorkout | null>(
    null,
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [durability, setDurability] = useState(initialDurability);
  const week = application.query({
    type: "get_week_training_plan",
    weekStart: "2026-08-24",
  });
  const month = application.query({
    type: "get_month_training_plan",
    month: "2026-08",
  });
  const selectedResult = useMemo(
    () =>
      state.workoutResults.find(
        (result) => result.plannedWorkoutId === selectedWorkout?.id,
      ),
    [selectedWorkout, state.workoutResults],
  );

  const resetDemo = async () => {
    const outcome = await application.command({ type: "reset_demo" });
    setDurability(outcome.durability);
    setView("week");
    setSelectedWorkout(null);
    setResetOpen(false);
    setNotice("Demo restored to its starting Training Plan.");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#training-plan"
          aria-label="Your Last Coach home"
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
              aria-label="Coach Agent connection: unavailable"
              aria-expanded={statusOpen}
              onClick={() => setStatusOpen((open) => !open)}
            >
              <span className="status-dot" />
              Coach Agent unavailable
            </button>
            {statusOpen && (
              <section className="status-popover">
                <strong>Human workspace ready</strong>
                <p>
                  Coach Agent tools are unavailable in this build. Every
                  Training Plan view remains available.
                </p>
                <small>
                  Seeded synthetic COROS-shaped observations; no authenticated
                  COROS sync.
                </small>
              </section>
            )}
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
          Browser storage is unavailable. Changes will last only until this page
          is reloaded.
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <main className="workspace" id="training-plan">
        <section className="plan-column">
          <header className="plan-hero">
            <div>
              <span className="eyebrow">
                Shared Coaching Workspace · {state.athlete.displayName}
              </span>
              <h1>Your Training Plan</h1>
              <p>
                Build aerobic strength, absorb the work, and arrive ready for
                Brighton.
              </p>
            </div>
            <div className="hero-meta">
              <span>{state.trainingPhase.name}</span>
              <strong>26 August 2026 · 20:15</strong>
              <small>Plan version {state.trainingPlan.planVersion}</small>
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
              onSelect={setSelectedWorkout}
            />
          ) : (
            <MonthPlan
              workouts={month.plannedWorkouts}
              onSelect={setSelectedWorkout}
            />
          )}
        </section>
        <ContextRail state={state} />
      </main>

      {selectedWorkout && (
        <WorkoutDetails
          workout={selectedWorkout}
          result={selectedResult}
          onClose={() => setSelectedWorkout(null)}
        />
      )}
      {resetOpen && (
        <ResetDialog onCancel={() => setResetOpen(false)} onReset={resetDemo} />
      )}
    </div>
  );
}
