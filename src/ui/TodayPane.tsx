import type {
  TodayPaneProjection,
  TodayPlanDay,
  TodayRestWorkout,
  TodayResultWorkout,
  TodayWorkoutPrescription,
} from "../application/today";
import type { PlannedWorkout } from "../domain/types";
import {
  formatDistanceKm,
  formatDurationSeconds,
  formatHeartRateBpm,
  formatPacePerKm,
} from "./metricFormatters";

export type TodayWorkoutSelect = (
  workout: PlannedWorkout,
  invoker: HTMLButtonElement,
) => void;

interface TodayPaneProps {
  projection: TodayPaneProjection;
  onViewPendingProposal: (invoker: HTMLButtonElement) => void;
  onSelectWorkout: TodayWorkoutSelect;
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

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatWorkoutType(type: PlannedWorkout["type"]) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(status: TodayPlanDay["status"]) {
  switch (status) {
    case "today":
      return "Today";
    case "completed":
      return "Completed";
    case "partial":
      return "Partial";
    case "stopped":
      return "Stopped";
    case "missed":
      return "Missed";
    case "upcoming":
      return "Planned";
    case "rest":
      return "Rest";
  }
}

function Unavailable() {
  return (
    <span className="today-unavailable" aria-label="Unavailable">
      —
    </span>
  );
}

function TodayMetric({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="today-workout-stat">
      <dt>{label}</dt>
      <dd>{value === null ? <Unavailable /> : value}</dd>
    </div>
  );
}

function RaceHero({ projection }: { projection: TodayPaneProjection }) {
  const { race } = projection;
  const currentBuildDay = race.elapsedBuildDays + 1;
  const totalBuildDayCount = race.totalBuildDays + 1;
  return (
    <section className="today-hero" aria-labelledby="today-hero-title">
      <div className="today-hero__identity">
        <span className="eyebrow">Target Race</span>
        <h1 id="today-hero-title">{race.name}</h1>
        <time dateTime={race.date}>{formatDate(race.date)}</time>
      </div>
      <div className="today-hero__countdown">
        {race.state === "normal" ? (
          <div className="today-countdown">
            <strong className="today-countdown__number numeric">
              {race.daysRemaining}
            </strong>
            <span className="today-countdown__label">
              {race.daysRemaining === 1 ? "day" : "days"} to go
            </span>
          </div>
        ) : (
          <div className="today-race-message">
            <h2>
              {race.state === "race_week"
                ? "Race week"
                : race.state === "race_day"
                  ? "Race day"
                  : "Race complete"}
            </h2>
            <p>
              {race.state === "race_week"
                ? "Keep the work light. Arrive rested."
                : race.state === "race_day"
                  ? "Your race starts today."
                  : "Ready for the next chapter when you are."}
            </p>
          </div>
        )}
      </div>
      {race.state === "normal" && (
        <div className="today-phase-progress">
          <div
            className="today-phase-progress__track"
            role="progressbar"
            aria-label="Training build progress by day"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(race.progressPercent)}
            aria-valuetext={`Day ${currentBuildDay} of ${totalBuildDayCount}; ${race.activePhaseName}`}
          >
            <span
              className="today-phase-progress__fill"
              style={{ width: `${race.progressPercent}%` }}
            />
          </div>
          <p className="today-phase-progress__caption">{race.phaseCaption}</p>
        </div>
      )}
    </section>
  );
}

function PendingProposalSignal({
  onViewPendingProposal,
}: {
  onViewPendingProposal: (invoker: HTMLButtonElement) => void;
}) {
  return (
    <button
      id="today-pending-proposal"
      className="today-pending-signal"
      type="button"
      onClick={(event) => onViewPendingProposal(event.currentTarget)}
    >
      <span className="attention-dot" aria-hidden="true" />
      <span>1 proposal awaiting your review</span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

function PlannedTodayCard({
  workout,
  prescription,
  onSelectWorkout,
}: {
  workout: PlannedWorkout;
  prescription: TodayWorkoutPrescription;
  onSelectWorkout: TodayWorkoutSelect;
}) {
  return (
    <>
      <div className="today-workout-card__heading">
        <div>
          <span className="eyebrow">TODAY</span>
          <h2 id="today-workout-title">{workout.title}</h2>
        </div>
        <div className="today-workout-types" aria-label="Workout type">
          {(workout.type === "threshold" || workout.type === "steady") && (
            <span>Quality</span>
          )}
          <span>{formatWorkoutType(workout.type)}</span>
        </div>
      </div>
      <dl className="today-workout-facts">
        {prescription.targetPaceSecondsPerKm && (
          <TodayMetric
            label="Target pace"
            value={`${formatPacePerKm(prescription.targetPaceSecondsPerKm.min)}–${formatPacePerKm(prescription.targetPaceSecondsPerKm.max)}`}
          />
        )}
        {prescription.recoverySeconds !== null && (
          <TodayMetric
            label="Recovery"
            value={`${prescription.recoverySeconds} seconds easy jog`}
          />
        )}
        <TodayMetric
          label="Planned distance"
          value={formatDistanceKm(prescription.distanceKm)}
        />
      </dl>
      <button
        id={`today-workout-details-${workout.id}`}
        className="button button--primary today-workout-action"
        type="button"
        aria-label="View workout details"
        onClick={(event) => onSelectWorkout(workout, event.currentTarget)}
      >
        View workout details
      </button>
    </>
  );
}

function ResultTodayCard({
  workout,
  metrics,
  onSelectWorkout,
}: {
  workout: PlannedWorkout;
  metrics: TodayResultWorkout["metrics"];
  onSelectWorkout: TodayWorkoutSelect;
}) {
  return (
    <>
      <div className="today-workout-card__heading">
        <div>
          <span className="eyebrow">TODAY</span>
          <h2 id="today-workout-title">{workout.title}</h2>
        </div>
      </div>
      <dl className="today-workout-facts today-workout-facts--result">
        <TodayMetric
          label="Distance"
          value={formatDistanceKm(metrics.distanceKm)}
        />
        <TodayMetric
          label="Time"
          value={
            metrics.durationSeconds === null
              ? null
              : formatDurationSeconds(metrics.durationSeconds)
          }
        />
        <TodayMetric
          label="Average pace"
          value={
            metrics.averagePaceSecondsPerKm === null
              ? null
              : formatPacePerKm(metrics.averagePaceSecondsPerKm)
          }
        />
        <TodayMetric
          label="Average heart rate"
          value={
            metrics.averageHeartRateBpm === null
              ? null
              : formatHeartRateBpm(metrics.averageHeartRateBpm)
          }
        />
      </dl>
      <p className="today-workout-acknowledgement">Workout recorded.</p>
      <button
        id={`today-workout-details-${workout.id}`}
        className="button button--primary today-workout-action"
        type="button"
        aria-label="View workout details"
        onClick={(event) => onSelectWorkout(workout, event.currentTarget)}
      >
        View workout details
      </button>
    </>
  );
}

function RestTodayCard({
  nextWorkout,
}: {
  nextWorkout: TodayRestWorkout["nextWorkout"];
}) {
  return (
    <>
      <span className="eyebrow">TODAY</span>
      <h2 id="today-workout-title">Rest day</h2>
      <p className="today-rest-copy">
        {nextWorkout
          ? `Next session: ${nextWorkout.title} on ${formatDate(nextWorkout.date)}.`
          : "No session is planned for tomorrow."}
      </p>
    </>
  );
}

function TodayWorkoutCard({
  projection,
  onSelectWorkout,
}: {
  projection: TodayPaneProjection;
  onSelectWorkout: TodayWorkoutSelect;
}) {
  const workout = projection.todayWorkout;
  return (
    <section
      className="today-workout-card"
      aria-labelledby="today-workout-title"
    >
      {workout.state === "planned" ? (
        <PlannedTodayCard
          workout={workout.workout}
          prescription={workout.prescription}
          onSelectWorkout={onSelectWorkout}
        />
      ) : workout.state === "result" ? (
        <ResultTodayCard
          workout={workout.workout}
          metrics={workout.metrics}
          onSelectWorkout={onSelectWorkout}
        />
      ) : (
        <RestTodayCard nextWorkout={workout.nextWorkout} />
      )}
    </section>
  );
}

function WeekDay({
  day,
  onSelectWorkout,
}: {
  day: TodayPlanDay;
  onSelectWorkout: TodayWorkoutSelect;
}) {
  const label = day.workout
    ? `${day.label}, ${day.workout.title}, ${formatDistanceKm(day.workout.distanceKm)}, ${statusLabel(day.status)}`
    : `${day.label}, Rest`;
  return (
    <li
      className={`today-week-day today-week-day--${day.status} ${day.workout ? "today-week-day--workout" : "today-week-day--rest"}`}
    >
      <div className="today-week-day__date">
        <span>{day.label}</span>
      </div>
      {day.workout ? (
        <button
          className="today-week-day__workout"
          id={`workout-entry-${day.workout.id}`}
          type="button"
          aria-label={label}
          data-workout-id={day.workout.id}
          onClick={(event) =>
            onSelectWorkout(day.workout!, event.currentTarget)
          }
        >
          <strong>{day.workout.title}</strong>
          <span>{formatDistanceKm(day.workout.distanceKm)}</span>
          <small>{statusLabel(day.status)}</small>
        </button>
      ) : (
        <div className="today-week-day__rest" aria-label={label}>
          <strong>Rest</strong>
          <small>Space to recover</small>
        </div>
      )}
    </li>
  );
}

function TodayWeek({
  projection,
  onSelectWorkout,
}: {
  projection: TodayPaneProjection;
  onSelectWorkout: TodayWorkoutSelect;
}) {
  return (
    <section className="today-week" aria-labelledby="today-week-title">
      <header className="today-week__heading">
        <div>
          <span className="eyebrow">Current plan week</span>
          <h2 id="today-week-title">
            {formatDay(projection.plan.weekStart)}–
            {formatDate(projection.plan.weekEnd)}
          </h2>
        </div>
        <p>Monday–Sunday</p>
      </header>
      <ol className="today-week-grid">
        {projection.plan.days.map((day) => (
          <WeekDay key={day.date} day={day} onSelectWorkout={onSelectWorkout} />
        ))}
      </ol>
    </section>
  );
}

export function TodayPane({
  projection,
  onViewPendingProposal,
  onSelectWorkout,
}: TodayPaneProps) {
  return (
    <div className="today-pane">
      <RaceHero projection={projection} />
      {projection.hasPendingProposal && (
        <PendingProposalSignal onViewPendingProposal={onViewPendingProposal} />
      )}
      {!projection.plan.available ? (
        <p className="today-empty-plan">No Training Plan is available yet.</p>
      ) : (
        <>
          <TodayWorkoutCard
            projection={projection}
            onSelectWorkout={onSelectWorkout}
          />
          <TodayWeek
            projection={projection}
            onSelectWorkout={onSelectWorkout}
          />
        </>
      )}
    </div>
  );
}
