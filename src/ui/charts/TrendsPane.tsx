import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type {
  PlannedWorkout,
  ReadinessHistoryRecord,
  WorkspaceState,
} from "../../domain/types";
import {
  deriveChartAnnotations,
  projectPaceHeartRate,
  projectReadinessSeries,
  projectRepeatedSessions,
  projectWeeklyVolumeLoad,
  resolveTrendsRange,
  type PaceHeartRatePoint,
  type RepeatedSessionGroup,
  type TrendsRange,
  type WeeklyVolumeLoadProjection,
} from "../../application/trends";
import { ChartCard } from "./ChartCard";
import { ChartPlot } from "./ChartPlot";
import {
  createLinePath,
  createLinearScale,
  createTimeScale,
  parseChartDate,
} from "./chartMath";
import { HrvChart } from "./HrvChart";
import { CHART_PLOT, CHART_VIEWBOX, type ChartAnnotation } from "./chartTypes";
import { formatPacePerKm } from "../metricFormatters";

export const TRENDS_SOURCE =
  "Source: seeded synthetic COROS-shaped observations";

export type TrendsWorkoutSelect = (
  workout: PlannedWorkout,
  invoker: HTMLElement,
) => void;

interface TrendsPaneProps {
  state: WorkspaceState;
  range: TrendsRange;
  /**
   * Supplied only by the scroll-snap layout, where the toggle stays inside the
   * pane body so it can remain pinned while the charts scroll. The switched
   * view renders it in the pane title row instead.
   */
  onRangeChange?: (range: TrendsRange) => void;
  onSelectWorkout?: TrendsWorkoutSelect;
  onViewAdaptation?: (adaptationId: string) => void;
}

function formatDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m`;
}

function formatPace(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return formatPacePerKm(seconds);
}

function formatDate(date: string) {
  const parsed = parseChartDate(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatShortDate(date: string) {
  const parsed = parseChartDate(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function trendFor(current: number | null, average: number | null) {
  if (current === null || average === null) {
    return { glyph: "—", label: "No trend available" };
  }
  if (current > average)
    return { glyph: "↑", label: "Up versus recorded nights" };
  if (current < average)
    return { glyph: "↓", label: "Down versus recorded nights" };
  return { glyph: "→", label: "Flat versus recorded nights" };
}

function SleepChart({
  projection,
  source,
  displayFrom,
  displayTo,
}: {
  projection: ReturnType<typeof projectReadinessSeries>;
  source?: string;
  displayFrom?: string;
  displayTo?: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(
    projection.latest?.date ?? projection.points[0]?.date ?? null,
  );
  useEffect(() => {
    setSelectedDate((current) => {
      if (current && projection.points.some(({ date }) => date === current)) {
        return current;
      }
      return projection.latest?.date ?? projection.points[0]?.date ?? null;
    });
  }, [projection.latest?.date, projection.points]);

  const selectedIndex = projection.points.findIndex(
    ({ date }) => date === selectedDate,
  );
  const selectedPoint =
    selectedIndex >= 0 ? projection.points[selectedIndex] : projection.latest;
  const selectedRecord =
    selectedIndex >= 0 ? projection.records[selectedIndex] : undefined;
  const stages = selectedRecord?.sleep?.stages;
  const stageText = stages
    ? Object.entries({
        Deep: stages.deepRatio,
        Light: stages.lightRatio,
        REM: stages.remRatio,
        Awake: stages.awakeRatio,
      })
        .filter(
          ([, value]) => typeof value === "number" && Number.isFinite(value),
        )
        .map(
          ([label, value]) =>
            `${label} ${Math.round((value as number) * 100)}%`,
        )
        .join(" · ")
    : "";
  const readout = selectedPoint
    ? `${formatShortDate(selectedPoint.date)} · ${
        selectedPoint.value === null
          ? "No recording"
          : formatDuration(selectedPoint.value)
      }${stageText ? ` · ${stageText}` : ""}`
    : "No recorded nights in this range";
  const average = projection.average;
  const current = projection.latest?.value ?? null;
  const trend = trendFor(current, average);
  const description = `Sleep duration. Current: ${current === null ? "—" : formatDuration(current)}. Direction: ${trend.label}. Coverage: ${projection.coverage.observed} of ${projection.coverage.expected} nights recorded.`;
  const hasObserved = projection.coverage.observed > 0;
  const plot = hasObserved ? (
    (() => {
      const xScale = createTimeScale(
        [
          displayFrom ?? projection.points[0]?.date,
          ...projection.points.map(({ date }) => date),
          displayTo ?? projection.points.at(-1)?.date,
        ].filter((date): date is string => date !== undefined),
        [CHART_PLOT.left, CHART_PLOT.right],
      );
      const yScale = createLinearScale(
        projection.points.map(({ value }) => value),
        [CHART_PLOT.bottom, CHART_PLOT.top],
      );
      const widthForBar = (index: number) => {
        const currentDate = parseChartDate(projection.points[index].date);
        const nextDate = parseChartDate(
          projection.points[Math.min(index + 1, projection.points.length - 1)]
            .date,
        );
        if (
          !currentDate ||
          !nextDate ||
          index === projection.points.length - 1
        ) {
          return 14;
        }
        return Math.max(
          10,
          Math.min(28, (xScale(nextDate) - xScale(currentDate)) * 0.58),
        );
      };
      return (
        <ChartPlot
          id="sleep"
          title="Sleep duration trend"
          description={description}
          points={projection.points}
          xScale={xScale}
          yScale={yScale}
          annotations={[]}
          onSelectAnnotation={() => undefined}
        >
          {projection.points.map((point, index) => {
            const parsedDate = parseChartDate(point.date);
            if (!parsedDate) return null;
            const x = xScale(parsedDate);
            const value = point.value;
            const y = value === null ? CHART_PLOT.bottom : yScale(value);
            const barWidth = widthForBar(index);
            const label = `Inspect Sleep for ${formatDate(point.date)}, ${
              value === null ? "no recording" : formatDuration(value)
            }`;
            return (
              <g
                key={point.date}
                role="button"
                tabIndex={0}
                aria-label={label}
                data-sleep-night
                data-chart-date={point.date}
                onClick={() => setSelectedDate(point.date)}
                onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedDate(point.date);
                }}
              >
                <rect
                  data-chart-hit-area
                  x={x - 22}
                  y={CHART_PLOT.top}
                  width="44"
                  height={CHART_PLOT.bottom - CHART_PLOT.top}
                  fill="var(--paper)"
                  fillOpacity="0.001"
                  pointerEvents="all"
                />
                {value === null ? (
                  <line
                    data-sleep-missing
                    x1={x - 8}
                    x2={x + 8}
                    y1={CHART_PLOT.bottom}
                    y2={CHART_PLOT.bottom}
                    stroke="var(--line)"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                ) : (
                  <rect
                    data-sleep-bar
                    x={x - barWidth / 2}
                    y={y}
                    width={barWidth}
                    height={CHART_PLOT.bottom - y}
                    fill="var(--series-2)"
                    className={
                      selectedDate === point.date
                        ? "chart-bar--selected"
                        : undefined
                    }
                  />
                )}
              </g>
            );
          })}
        </ChartPlot>
      );
    })()
  ) : (
    <p className="chart-card__empty">
      {projection.status === "unavailable"
        ? "Sleep data unavailable"
        : "No recorded nights in this range"}
    </p>
  );
  return (
    <ChartCard
      id="sleep"
      metric="Sleep"
      currentValue={
        projection.status === "unavailable" ? "—" : formatDuration(current)
      }
      unit=""
      averageLabel={
        projection.status === "unavailable"
          ? "7-night avg —"
          : `7-night avg ${formatDuration(average)}`
      }
      averageBasis="recorded nights"
      trendGlyph={projection.status === "unavailable" ? "—" : trend.glyph}
      trendLabel={
        projection.status === "unavailable" ? "No trend available" : trend.label
      }
      readout={readout}
      plot={plot}
      coverage={
        projection.status === "unavailable"
          ? "Data unavailable"
          : `${projection.coverage.observed} of ${projection.coverage.expected} nights recorded`
      }
      source={source}
    />
  );
}

function annotationIsInRange(
  annotation: ChartAnnotation,
  from: string,
  to: string,
) {
  return annotation.date >= from && annotation.date <= to;
}

function VolumeAnnotations({
  annotations,
  xScale,
  onSelect,
}: {
  annotations: readonly ChartAnnotation[];
  xScale: ReturnType<typeof createTimeScale>;
  onSelect: (annotation: ChartAnnotation) => void;
}) {
  const [from, to] = xScale
    .domain()
    .map((date) => date.toISOString().slice(0, 10));
  return (
    <g data-chart-annotations data-chart-annotation-layer="volume-annotations">
      {annotations
        .filter((annotation) => annotationIsInRange(annotation, from, to))
        .map((annotation) => {
          const parsed = parseChartDate(annotation.date);
          if (!parsed) return null;
          const x = xScale(parsed);
          if (annotation.kind === "adaptation") {
            return (
              <g
                key={`${annotation.kind}-${annotation.date}-${annotation.label}`}
                role="button"
                tabIndex={0}
                aria-label={`Inspect approved adaptation ${annotation.label}`}
                data-chart-annotation
                data-chart-annotation-kind="adaptation"
                data-chart-date={annotation.date}
                onClick={() => onSelect(annotation)}
                onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(annotation);
                }}
              >
                <rect
                  data-chart-adaptation-hit-area
                  x={x - 22}
                  y={8}
                  width="44"
                  height="44"
                  fill="var(--paper)"
                  fillOpacity="0.001"
                />
                <polygon
                  data-chart-adaptation-diamond
                  points={`${x},23 ${x + 8},31 ${x},39 ${x - 8},31`}
                  fill="var(--track)"
                />
                <text data-chart-annotation-label x={x + 12} y={35}>
                  {annotation.label}
                </text>
              </g>
            );
          }
          return (
            <g
              key={`${annotation.kind}-${annotation.date}-${annotation.label}`}
              data-chart-annotation
              data-chart-annotation-kind={annotation.kind}
              data-chart-date={annotation.date}
              pointerEvents="none"
            >
              <line
                x1={x}
                x2={x}
                y1={CHART_PLOT.top}
                y2={372}
                stroke={
                  annotation.kind === "race" ? "var(--ochre)" : "var(--line)"
                }
                strokeDasharray={annotation.kind === "race" ? "2 3" : "3 4"}
                data-chart-phase-line={
                  annotation.kind === "phase" ? true : undefined
                }
                data-chart-race-line={
                  annotation.kind === "race" ? true : undefined
                }
              />
              {annotation.kind === "race" && (
                <path
                  data-chart-race-flag
                  d={`M ${x} ${CHART_PLOT.top} h 22 l -5 6 l 5 6 h -22 z`}
                  fill="var(--ochre)"
                />
              )}
              <text
                data-chart-annotation-label
                x={x + 5}
                y={annotation.kind === "race" ? 56 : 40}
              >
                {annotation.label}
              </text>
            </g>
          );
        })}
    </g>
  );
}

function VolumeLoadChart({
  projection,
  annotations,
  rangeFrom,
  rangeTo,
  onViewAdaptation = () => undefined,
}: {
  projection: WeeklyVolumeLoadProjection;
  annotations: readonly ChartAnnotation[];
  rangeFrom: string;
  rangeTo: string;
  onViewAdaptation?: (adaptationId: string) => void;
}) {
  const [selection, setSelection] = useState<{
    kind: "week" | "annotation";
    value: string;
  }>({ kind: "week", value: projection.weeks.at(-1)?.weekStart ?? "" });
  useEffect(() => {
    setSelection((current) => {
      if (
        current.kind === "week" &&
        projection.weeks.some(({ weekStart }) => weekStart === current.value)
      ) {
        return current;
      }
      if (
        current.kind === "annotation" &&
        annotations.some(
          (annotation) =>
            `${annotation.kind}-${annotation.date}-${annotation.label}` ===
            current.value,
        )
      ) {
        return current;
      }
      return {
        kind: "week",
        value: projection.weeks.at(-1)?.weekStart ?? "",
      };
    });
  }, [annotations, projection.weeks]);
  const selectedWeek = projection.weeks.find(
    ({ weekStart }) => weekStart === selection.value,
  );
  const selectedAnnotation =
    selection.kind === "annotation"
      ? annotations.find(
          (annotation) =>
            `${annotation.kind}-${annotation.date}-${annotation.label}` ===
            selection.value,
        )
      : null;
  const readout =
    projection.status === "empty"
      ? "No Workout Results in this range"
      : selectedAnnotation
        ? `${formatShortDate(selectedAnnotation.date)} · ${
            selectedAnnotation.kind === "adaptation"
              ? `Approved adaptation: ${selectedAnnotation.label}`
              : selectedAnnotation.kind === "phase"
                ? `Phase: ${selectedAnnotation.label}`
                : `Race day: ${selectedAnnotation.label}`
          }`
        : selectedWeek
          ? `${formatShortDate(selectedWeek.weekStart)} week · ${selectedWeek.distanceKm.toFixed(1)} km · Training Load ${selectedWeek.trainingLoad === null ? "unavailable" : selectedWeek.trainingLoad}`
          : projection.status === "unavailable"
            ? "Training history unavailable"
            : "No Workout Results in this range";
  const lastWeek = projection.weeks.at(-1);
  const volumeCurrent = lastWeek ? lastWeek.distanceKm.toFixed(1) : "—";
  const loadCurrent =
    lastWeek?.trainingLoad === undefined || lastWeek?.trainingLoad === null
      ? "—"
      : String(lastWeek.trainingLoad);
  const hasWeeks =
    projection.weeks.length > 0 && projection.status !== "unavailable";
  const plot = hasWeeks ? (
    (() => {
      const xScale = createTimeScale(
        [
          rangeFrom,
          ...projection.weeks.map(({ weekStart }) => weekStart),
          rangeTo,
        ],
        [CHART_PLOT.left, CHART_PLOT.right],
      );
      const distanceScale = createLinearScale(
        projection.weeks.map(({ distanceKm }) => distanceKm),
        [170, 42],
      );
      const maximumDistance = Math.max(
        ...projection.weeks.map(({ distanceKm }) => distanceKm),
        0,
      );
      distanceScale.domain([
        0,
        maximumDistance === 0 ? 1 : maximumDistance * 1.1,
      ]);
      const loadScale = createLinearScale(
        projection.weeks.map(({ trainingLoad }) => trainingLoad),
        [372, 242],
      );
      const maximumLoad = Math.max(
        ...projection.weeks.map(({ trainingLoad }) => trainingLoad ?? 0),
        0,
      );
      loadScale.domain([0, maximumLoad === 0 ? 1 : maximumLoad * 1.1]);
      const averagePath = createLinePath(
        projection.weeks.map(({ weekStart, fourWeekAverageLoad }) => ({
          date: weekStart,
          value: fourWeekAverageLoad,
        })),
        xScale,
        loadScale,
      );
      const passiveLabels = annotations
        .filter(
          (annotation) =>
            annotation.kind !== "adaptation" &&
            annotationIsInRange(annotation, rangeFrom, rangeTo),
        )
        .map(({ label }) => label);
      const description = `Weekly volume and Training Load. Current: ${volumeCurrent} km distance; Training Load ${loadCurrent}. Direction: Neutral direction. Coverage: ${projection.coverage.availableLoads} of ${projection.coverage.results} Workout Results with available load.${passiveLabels.length ? ` Passive annotations: ${passiveLabels.join(", ")}.` : ""}`;
      return (
        <div className="chart-card__plot chart-card__plot--volume-load">
          <svg
            className="chart-plot chart-plot--volume-load"
            data-chart="volume-load"
            viewBox="0 0 720 420"
            width="100%"
            role="img"
            aria-labelledby="volume-load-title volume-load-description"
          >
            <title id="volume-load-title">
              Weekly volume and Training Load
            </title>
            <desc id="volume-load-description">{description}</desc>
            <g data-chart-grid aria-hidden="true">
              {[42, 106, 170, 242, 307, 372].map((y) => (
                <line
                  key={y}
                  data-chart-gridline
                  x1={CHART_PLOT.left}
                  x2={CHART_PLOT.right}
                  y1={y}
                  y2={y}
                  stroke="var(--line)"
                  strokeWidth="1"
                  shapeRendering="crispEdges"
                />
              ))}
              <text data-chart-y-label x="64" y="18">
                Distance km
              </text>
              <text data-chart-y-label x="64" y="236">
                Training Load
              </text>
            </g>
            <VolumeAnnotations
              annotations={annotations}
              xScale={xScale}
              onSelect={(annotation) =>
                setSelection({
                  kind: "annotation",
                  value: `${annotation.kind}-${annotation.date}-${annotation.label}`,
                })
              }
            />
            <g data-chart-series data-chart-series-kind="volume">
              {projection.weeks.map((week) => {
                const parsed = parseChartDate(week.weekStart);
                if (!parsed) return null;
                const x = xScale(parsed);
                const y = distanceScale(week.distanceKm);
                const next = projection.weeks.find(
                  ({ weekStart }) => weekStart > week.weekStart,
                );
                const nextX = next
                  ? xScale(parseChartDate(next.weekStart) ?? parsed)
                  : x + 40;
                const width = Math.max(16, Math.min(42, (nextX - x) * 0.55));
                return (
                  <g
                    key={`volume-${week.weekStart}`}
                    role="button"
                    tabIndex={0}
                    data-volume-week
                    data-chart-week={week.weekStart}
                    aria-label={`Inspect training volume beginning ${formatDate(week.weekStart)}, ${week.distanceKm.toFixed(1)} kilometres and ${week.trainingLoad === null ? "unavailable" : `${week.trainingLoad} Training Load`}`}
                    onClick={() =>
                      setSelection({ kind: "week", value: week.weekStart })
                    }
                    onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelection({ kind: "week", value: week.weekStart });
                    }}
                  >
                    <rect
                      data-chart-hit-area
                      x={x - 22}
                      y={42}
                      width="44"
                      height="330"
                      fill="var(--paper)"
                      fillOpacity="0.001"
                    />
                    <rect
                      data-volume-bar
                      data-chart-week={week.weekStart}
                      x={x - width / 2}
                      y={y}
                      width={width}
                      height={170 - y}
                      fill="var(--series-1)"
                    />
                  </g>
                );
              })}
            </g>
            <g data-chart-series data-chart-series-kind="training-load">
              {projection.weeks.map((week) => {
                const parsed = parseChartDate(week.weekStart);
                if (!parsed) return null;
                const x = xScale(parsed);
                if (week.trainingLoad === null) {
                  return (
                    <line
                      key={`load-missing-${week.weekStart}`}
                      data-missing-load
                      data-chart-week={week.weekStart}
                      x1={x - 8}
                      x2={x + 8}
                      y1="372"
                      y2="372"
                      stroke="var(--line)"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  );
                }
                const y = loadScale(week.trainingLoad);
                const next = projection.weeks.find(
                  ({ weekStart }) => weekStart > week.weekStart,
                );
                const nextX = next
                  ? xScale(parseChartDate(next.weekStart) ?? parsed)
                  : x + 40;
                const width = Math.max(16, Math.min(42, (nextX - x) * 0.55));
                return (
                  <rect
                    key={`load-${week.weekStart}`}
                    data-load-bar
                    data-chart-week={week.weekStart}
                    x={x - width / 2}
                    y={y}
                    width={width}
                    height={372 - y}
                    fill="var(--series-2)"
                  />
                );
              })}
              {averagePath && (
                <path
                  data-load-average-line
                  d={averagePath}
                  fill="none"
                  stroke="var(--track)"
                  strokeWidth="2"
                />
              )}
            </g>
            <g data-chart-x-labels aria-hidden="true">
              {projection.weeks
                .filter(
                  (_, index) =>
                    index === 0 || index === projection.weeks.length - 1,
                )
                .map((week, index) => {
                  const parsed = parseChartDate(week.weekStart);
                  if (!parsed) return null;
                  return (
                    <text
                      key={week.weekStart}
                      data-chart-x-label
                      x={xScale(parsed)}
                      y="408"
                      textAnchor={index === 0 ? "start" : "end"}
                    >
                      {formatShortDate(week.weekStart)}
                    </text>
                  );
                })}
            </g>
          </svg>
        </div>
      );
    })()
  ) : (
    <p className="chart-card__empty">Training history unavailable</p>
  );
  const selectedAdaptation =
    selectedAnnotation?.kind === "adaptation" ? selectedAnnotation : null;
  const fixedReadout = selectedAdaptation ? (
    <>
      <span>
        {formatShortDate(selectedAdaptation.date)} · Approved adaptation:{" "}
        {selectedAdaptation.label}
      </span>{" "}
      <button
        type="button"
        className="button button--quiet chart-card__readout-action"
        onClick={() => onViewAdaptation(selectedAdaptation.adaptationId)}
      >
        View adaptation
      </button>
    </>
  ) : (
    readout
  );
  return (
    <ChartCard
      id="volume-load"
      metric="Weekly volume + Training Load"
      currentValue={projection.status === "unavailable" ? "—" : volumeCurrent}
      unit="km"
      averageLabel={`Load ${loadCurrent}`}
      averageBasis="latest week · sourced per Workout Result"
      trendGlyph="—"
      trendLabel="Neutral direction"
      readout={fixedReadout}
      plot={plot}
      coverage={
        projection.status === "unavailable"
          ? "Training history unavailable"
          : `${projection.coverage.availableLoads} of ${projection.coverage.results} Workout Results with available load`
      }
    >
      <div className="chart-card__secondary-metrics" data-volume-summary>
        <span>
          Distance <strong data-volume-current>{volumeCurrent} km</strong>
        </span>
        <span>
          Training Load <strong data-load-current>{loadCurrent}</strong>
        </span>
        <span>4-week average uses available loads only</span>
      </div>
    </ChartCard>
  );
}

function PaceHeartRateChart({
  projection,
  state,
  onSelectWorkout,
}: {
  projection: ReturnType<typeof projectPaceHeartRate>;
  state: WorkspaceState;
  onSelectWorkout?: TrendsWorkoutSelect;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    projection.selected?.workoutResultId ?? null,
  );
  useEffect(() => {
    setSelectedId((current) =>
      projection.points.some(
        ({ workoutResultId }) => workoutResultId === current,
      )
        ? current
        : (projection.selected?.workoutResultId ?? null),
    );
  }, [projection.points, projection.selected?.workoutResultId]);
  const selected =
    projection.points.find(
      ({ workoutResultId }) => workoutResultId === selectedId,
    ) ?? projection.selected;
  const readout = selected
    ? `${formatShortDate(selected.date)} · ${selected.title} · ${formatPace(selected.paceSecondsPerKm)} · ${selected.heartRateBpm} bpm`
    : projection.status === "unavailable"
      ? "Run comparison data unavailable"
      : "No comparable runs in this range";
  const selectedWorkout = selected?.plannedWorkoutId
    ? state.trainingPlan.plannedWorkouts.find(
        ({ id }) => id === selected.plannedWorkoutId,
      )
    : undefined;
  const hasPoints =
    projection.points.length > 0 && projection.status !== "unavailable";
  const plot = hasPoints ? (
    (() => {
      const xScale = createLinearScale(
        projection.points.map(({ paceSecondsPerKm }) => paceSecondsPerKm),
        [CHART_PLOT.left, CHART_PLOT.right],
      );
      const paceValues = projection.points.map(
        ({ paceSecondsPerKm }) => paceSecondsPerKm,
      );
      const paceMin = Math.min(...paceValues);
      const paceMax = Math.max(...paceValues);
      xScale.domain([
        paceMax + Math.max(1, (paceMax - paceMin) * 0.05),
        paceMin - Math.max(1, (paceMax - paceMin) * 0.05),
      ]);
      const yScale = createLinearScale(
        projection.points.map(({ heartRateBpm }) => heartRateBpm),
        [CHART_PLOT.bottom, CHART_PLOT.top],
      );
      return (
        <div className="chart-card__plot">
          <svg
            className="chart-plot chart-plot--pace-heart-rate"
            data-chart="pace-heart-rate"
            viewBox={`0 0 ${CHART_VIEWBOX.width} ${CHART_VIEWBOX.height}`}
            width="100%"
            role="img"
            aria-labelledby="pace-heart-rate-title pace-heart-rate-description"
          >
            <title id="pace-heart-rate-title">Pace versus heart rate</title>
            <desc id="pace-heart-rate-description">
              Derived from your runs. Current:{" "}
              {selected ? formatPace(selected.paceSecondsPerKm) : "—"}.
              Direction: No fitted trend. Coverage: {projection.points.length}{" "}
              eligible Outdoor Run pairs
              {projection.excludedOutdoorRuns
                ? `, ${projection.excludedOutdoorRuns} missing a measure.`
                : "."}{" "}
              Faster pace is to the right.
            </desc>
            <g data-chart-grid aria-hidden="true">
              {yScale.ticks(3).map((tick) => {
                const y = yScale(tick);
                return (
                  <g key={tick}>
                    <line
                      data-chart-gridline
                      x1={CHART_PLOT.left}
                      x2={CHART_PLOT.right}
                      y1={y}
                      y2={y}
                      stroke="var(--line)"
                      strokeWidth="1"
                      shapeRendering="crispEdges"
                    />
                    <text data-chart-y-label x={CHART_PLOT.left + 4} y={y - 5}>
                      {tick}
                    </text>
                  </g>
                );
              })}
            </g>
            <g data-chart-series data-chart-series-kind="pace-heart-rate">
              {projection.points.map((point) => {
                const x = xScale(point.paceSecondsPerKm);
                const y = yScale(point.heartRateBpm);
                const selectedPoint = selectedId === point.workoutResultId;
                return (
                  <g
                    key={point.workoutResultId}
                    role="button"
                    tabIndex={0}
                    data-pace-heart-rate-point
                    data-workout-result-id={point.workoutResultId}
                    aria-label={`Inspect recorded run on ${formatDate(point.date)}, ${formatPace(point.paceSecondsPerKm)}, ${point.heartRateBpm} bpm`}
                    onClick={() => setSelectedId(point.workoutResultId)}
                    onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedId(point.workoutResultId);
                    }}
                  >
                    <rect
                      data-chart-hit-area
                      x={x - 22}
                      y={y - 22}
                      width="44"
                      height="44"
                      fill="var(--paper)"
                      fillOpacity="0.001"
                    />
                    {selectedPoint && (
                      <circle
                        data-pace-point-selection
                        cx={x}
                        cy={y}
                        r="9"
                        fill="none"
                        stroke="var(--series-1)"
                        strokeWidth="2"
                      />
                    )}
                    <circle
                      data-pace-point-visible
                      cx={x}
                      cy={y}
                      r="5"
                      fill="var(--series-1)"
                    />
                  </g>
                );
              })}
            </g>
            <text data-pace-axis-label x="360" y="268" textAnchor="middle">
              Average pace (faster →)
            </text>
            <text
              data-hr-axis-label
              x="14"
              y="130"
              transform="rotate(-90 14 130)"
              textAnchor="middle"
            >
              Average heart rate (bpm)
            </text>
          </svg>
        </div>
      );
    })()
  ) : (
    <p className="chart-card__empty">
      {projection.status === "unavailable"
        ? "Run comparison data unavailable"
        : "No comparable runs in this range"}
    </p>
  );
  const action =
    selectedWorkout && selected ? (
      <button
        type="button"
        className="button button--quiet chart-card__readout-action"
        id={`pace-view-workout-${selected.workoutResultId}`}
        data-pace-view-workout
        onClick={(event) =>
          onSelectWorkout?.(selectedWorkout, event.currentTarget)
        }
      >
        View workout
      </button>
    ) : null;
  return (
    <ChartCard
      id="pace-heart-rate"
      metric="Pace vs heart rate"
      currentValue={
        projection.status === "unavailable" || !selected
          ? "—"
          : formatPace(selected.paceSecondsPerKm)
      }
      unit=""
      averageLabel={
        projection.status === "unavailable" || !selected
          ? "Average HR —"
          : `Average HR ${selected.heartRateBpm} bpm`
      }
      averageBasis="Derived from your runs"
      trendGlyph="—"
      trendLabel="No fitted trend"
      readout={
        <>
          {readout}
          {action}
        </>
      }
      plot={plot}
      coverage={
        projection.status === "unavailable"
          ? "Run comparison data unavailable"
          : `${projection.points.length} eligible Outdoor Run pairs${projection.excludedOutdoorRuns ? ` · ${projection.excludedOutdoorRuns} missing a measure` : ""}`
      }
      source="Derived from your runs"
    />
  );
}

function repeatedSummaryText(group: RepeatedSessionGroup) {
  const summary = group.latestSummary;
  return `${summary.distanceKm === null ? "—" : `${summary.distanceKm} km`} · ${summary.durationSeconds === null ? "—" : `${Math.round(summary.durationSeconds / 60)} min`} · Load ${summary.trainingLoad === null ? "—" : summary.trainingLoad}`;
}

function RepeatedSessionsCard({
  projection,
  state,
  onSelectWorkout,
}: {
  projection: ReturnType<typeof projectRepeatedSessions>;
  state: WorkspaceState;
  onSelectWorkout?: TrendsWorkoutSelect;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    projection.groups[0]?.key ?? null,
  );
  useEffect(() => {
    setSelectedKey((current) =>
      projection.groups.some(({ key }) => key === current)
        ? current
        : (projection.groups[0]?.key ?? null),
    );
  }, [projection.groups]);
  const selected = projection.groups.find(({ key }) => key === selectedKey);
  const planned = selected
    ? state.trainingPlan.plannedWorkouts.find(
        ({ id }) =>
          id ===
          (selected.latestResult.plannedWorkoutId ?? selected.plannedWorkoutId),
      )
    : undefined;
  return (
    <section
      className="repeated-sessions-card"
      data-repeated-sessions
      aria-labelledby="repeated-sessions-title"
    >
      <header className="section-heading section-heading--small">
        <div>
          <h3 id="repeated-sessions-title">Repeated sessions</h3>
        </div>
        <span className="repeated-sessions-card__basis">
          Structured repeat prescriptions
        </span>
      </header>
      {projection.status === "unavailable" ? (
        <p className="chart-card__empty">Repeated sessions unavailable</p>
      ) : projection.groups.length === 0 ? (
        <p className="chart-card__empty">No repeated sessions in this range</p>
      ) : (
        <>
          <div
            className="repeated-session-options"
            role="group"
            aria-label="Comparable repeated sessions"
          >
            {projection.groups.map((group) => (
              <button
                type="button"
                key={group.key}
                className={`repeated-session-option ${group.key === selectedKey ? "repeated-session-option--selected" : ""}`}
                aria-pressed={group.key === selectedKey}
                data-repeated-session-option
                data-group-key={group.key}
                onClick={() => setSelectedKey(group.key)}
              >
                <strong>{group.label}</strong>
                <span>
                  {group.attemptCount} attempts · last{" "}
                  {formatShortDate(group.latestResult.startedAt.slice(0, 10))}
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <div
              className="repeated-session-summary"
              data-repeated-session-summary
              aria-live="polite"
            >
              <span className="eyebrow">Latest supported summary</span>
              <p>
                {formatDate(selected.latestResult.startedAt.slice(0, 10))} ·{" "}
                {repeatedSummaryText(selected)}
              </p>
              {selected.degraded && (
                <small>
                  Some optional Workout Result aggregates are unavailable.
                </small>
              )}
              {planned && (
                <button
                  type="button"
                  className="button button--quiet"
                  id={`repeated-view-workout-${planned.id}`}
                  data-repeated-view-workout
                  onClick={(event) =>
                    onSelectWorkout?.(planned, event.currentTarget)
                  }
                >
                  View latest Workout Result
                </button>
              )}
            </div>
          )}
        </>
      )}
      <footer className="chart-card__footer">
        <span className="chart-card__coverage">
          {projection.status === "unavailable"
            ? "Repeated sessions unavailable"
            : projection.status === "empty"
              ? "No repeated sessions in this range"
              : `${projection.groups.length} comparable group${projection.groups.length === 1 ? "" : "s"}`}
        </span>
        <span className="chart-card__source">Aggregate-only comparison</span>
      </footer>
    </section>
  );
}

const TRENDS_RANGE_OPTIONS = ["4w", "12w", "build"] as const;

/**
 * The range toggle is rendered by the pane title row, not by the pane body, so
 * that it has a home in the frame instead of being pinned over the content.
 */
export function TrendsRangeControl({
  range,
  onRangeChange,
}: {
  range: TrendsRange;
  onRangeChange: (range: TrendsRange) => void;
}) {
  return (
    <div
      className="trends-range-control"
      role="group"
      aria-label="Trends range"
    >
      {TRENDS_RANGE_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={range === option}
          data-trends-range-option={option}
          onClick={() => onRangeChange(option)}
        >
          {option === "build" ? "Build" : option}
        </button>
      ))}
    </div>
  );
}

export function TrendsPane({
  state,
  range,
  onRangeChange,
  onSelectWorkout,
  onViewAdaptation = () => undefined,
}: TrendsPaneProps) {
  const rangeWindow = useMemo(
    () => resolveTrendsRange(state, range),
    [range, state],
  );
  const annotations = useMemo(
    () => deriveChartAnnotations(state, range),
    [range, state],
  );
  const hrv = useMemo(
    () => projectReadinessSeries(state, "hrv", range),
    [range, state],
  );
  const restingHeartRate = useMemo(
    () => projectReadinessSeries(state, "restingHeartRate", range),
    [range, state],
  );
  const sleep = useMemo(
    () => projectReadinessSeries(state, "sleep", range),
    [range, state],
  );
  const volumeLoad = useMemo(
    () => projectWeeklyVolumeLoad(state, range),
    [range, state],
  );
  const paceHeartRate = useMemo(
    () => projectPaceHeartRate(state, range),
    [range, state],
  );
  const repeatedSessions = useMemo(
    () => projectRepeatedSessions(state, range),
    [range, state],
  );
  return (
    <div className="trends-pane" data-trends-range={range}>
      {onRangeChange && (
        <TrendsRangeControl range={range} onRangeChange={onRangeChange} />
      )}
      <section
        className="trends-group"
        data-trends-group="readiness"
        aria-labelledby="readiness-group-title"
      >
        <div className="section-heading section-heading--small">
          <div>
            <span className="eyebrow">Shared Coaching Evidence</span>
            <h3 id="readiness-group-title">Readiness</h3>
          </div>
          <p>
            {range === "build"
              ? "Build to Target Race"
              : `${range === "4w" ? "28" : "84"} wake-up days`}
          </p>
        </div>
        <HrvChart
          points={hrv.points}
          annotations={annotations}
          status={hrv.status}
          metric="HRV"
          unit="ms"
          chartId="hrv"
          seriesId="hrv"
          average={hrv.average}
          displayFrom={rangeWindow.from}
          displayTo={rangeWindow.to}
          onViewAdaptation={onViewAdaptation}
        />
        <HrvChart
          points={restingHeartRate.points}
          annotations={annotations}
          status={restingHeartRate.status}
          metric="Resting heart rate"
          unit="bpm"
          chartId="resting-heart-rate"
          seriesId="resting-heart-rate"
          average={restingHeartRate.average}
          displayFrom={rangeWindow.from}
          displayTo={rangeWindow.to}
          onViewAdaptation={onViewAdaptation}
        />
        <SleepChart
          projection={sleep}
          displayFrom={rangeWindow.from}
          displayTo={rangeWindow.to}
        />
      </section>
      <section
        className="trends-group"
        data-trends-group="performance"
        aria-labelledby="performance-group-title"
      >
        <div className="section-heading section-heading--small">
          <div>
            <span className="eyebrow">Training evidence</span>
            <h3 id="performance-group-title">Performance</h3>
          </div>
          <p>Workout Result aggregates</p>
        </div>
        <VolumeLoadChart
          projection={volumeLoad}
          annotations={annotations}
          rangeFrom={rangeWindow.from}
          rangeTo={rangeWindow.to}
          onViewAdaptation={onViewAdaptation}
        />
        <PaceHeartRateChart
          projection={paceHeartRate}
          state={state}
          onSelectWorkout={onSelectWorkout}
        />
        <RepeatedSessionsCard
          projection={repeatedSessions}
          state={state}
          onSelectWorkout={onSelectWorkout}
        />
      </section>
      <p className="trends-provenance">{TRENDS_SOURCE}</p>
    </div>
  );
}
