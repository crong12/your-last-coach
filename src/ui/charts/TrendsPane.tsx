import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type { PlannedWorkout, WorkspaceState } from "../../domain/types";
import {
  deriveChartAnnotations,
  projectPaceHeartRate,
  projectReadinessSeries,
  projectWeeklyVolumeLoad,
  resolveTrendsRange,
  type TrendsRange,
  type WeeklyVolumeLoadProjection,
} from "../../application/trends";
import { ChartCard } from "./ChartCard";
import { ChartPlot } from "./ChartPlot";
import {
  createLinearScale,
  createTimeScale,
  parseChartDate,
  weeklyTickDates,
} from "./chartMath";
import { ChartHitColumns } from "./ChartHitColumns";
import { HrvChart } from "./HrvChart";
import { sleepStageSegments } from "./sleepStages";
import {
  CHART_PLOT,
  CHART_VIEWBOX,
  READINESS_PLOT,
  READINESS_VIEWBOX,
  type ChartAnnotation,
  type ChartTooltip,
} from "./chartTypes";
import {
  formatMinutesClock,
  formatPacePerKm,
  formatPaceSeconds,
} from "../metricFormatters";

const TRENDS_SOURCE = "Source: synthetic health data";

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
    return { label: "No trend available" };
  }
  if (current > average) return { label: "Up versus recorded nights" };
  if (current < average) return { label: "Down versus recorded nights" };
  return { label: "Flat versus recorded nights" };
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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
  const baseline = projection.baseline;
  const baselineDelta =
    current === null || baseline === null
      ? null
      : Math.round(current - baseline.mean);
  const baselineTrend =
    baselineDelta === null
      ? undefined
      : baselineDelta === 0
        ? "at baseline"
        : `${baselineDelta > 0 ? "+" : "−"}${Math.abs(baselineDelta)}m vs baseline`;
  const description = `Sleep duration. Current: ${current === null ? "—" : formatDuration(current)}. Direction: ${trend.label}.${
    baseline
      ? ` 28-day average (recorded nights): ${formatDuration(baseline.mean)}.`
      : ""
  } Coverage: ${projection.coverage.observed} of ${projection.coverage.expected} nights recorded.`;
  const hasObserved = projection.coverage.observed > 0;
  const plot = hasObserved ? (
    (() => {
      const xScale = createTimeScale(
        [
          displayFrom ?? projection.points[0]?.date,
          ...projection.points.map(({ date }) => date),
          displayTo ?? projection.points.at(-1)?.date,
        ].filter((date): date is string => date !== undefined),
        [READINESS_PLOT.left, READINESS_PLOT.right],
      );
      const yScale = createLinearScale(
        [
          ...projection.points.map(({ value }) => value),
          baseline?.mean ?? null,
        ],
        [READINESS_PLOT.bottom, READINESS_PLOT.top],
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
          return 9;
        }
        return Math.max(
          6,
          Math.min(20, (xScale(nextDate) - xScale(currentDate)) * 0.62),
        );
      };
      const stageStyles = {
        deep: {
          fill: "var(--series-1)",
          fillOpacity: 1,
          stroke: undefined as string | undefined,
        },
        light: {
          fill: "var(--series-2)",
          fillOpacity: 0.85,
          stroke: undefined,
        },
        rem: { fill: "var(--series-2)", fillOpacity: 0.4, stroke: undefined },
        awake: { fill: "var(--paper)", fillOpacity: 1, stroke: "var(--line)" },
      } as const;
      const stageSegments = (index: number) => {
        const segments = sleepStageSegments(
          projection.records[index]?.sleep?.stages,
        );
        if (!segments) return null;
        return segments.map((segment) => ({
          ...segment,
          ...stageStyles[segment.key],
        }));
      };
      const hoverPoint =
        hoverIndex === null ? null : projection.points[hoverIndex];
      const hoverParsed = hoverPoint ? parseChartDate(hoverPoint.date) : null;
      const tooltip: ChartTooltip | null =
        hoverPoint && hoverParsed
          ? {
              x: xScale(hoverParsed),
              y:
                hoverPoint.value === null
                  ? READINESS_PLOT.bottom
                  : yScale(hoverPoint.value),
              text: `${formatShortDate(hoverPoint.date)} · ${
                hoverPoint.value === null
                  ? "No recording"
                  : formatDuration(hoverPoint.value)
              }`,
            }
          : null;
      return (
        <ChartPlot
          id="sleep"
          title="Sleep duration trend"
          description={description}
          points={projection.points}
          xScale={xScale}
          yScale={yScale}
          annotations={[]}
          viewBox={READINESS_VIEWBOX}
          plotBounds={READINESS_PLOT}
          xTickDates={weeklyTickDates(
            projection.points.map(({ date }) => date),
          )}
          yTickValues={(() => {
            const [domainMin, domainMax] = yScale.domain();
            const marks: number[] = [];
            for (
              let hour = Math.ceil(domainMin / 60);
              hour <= Math.floor(domainMax / 60);
              hour += 1
            ) {
              marks.push(hour * 60);
            }
            return marks.length > 0 ? marks : undefined;
          })()}
          yTickFormat={formatMinutesClock}
          tooltip={tooltip}
          onSelectAnnotation={() => undefined}
        >
          <g data-chart-marks aria-hidden="true" pointerEvents="none">
            {projection.points.map((point, index) => {
              const parsedDate = parseChartDate(point.date);
              if (!parsedDate) return null;
              const x = xScale(parsedDate);
              const value = point.value;
              if (value === null) {
                return (
                  <line
                    key={point.date}
                    data-sleep-missing
                    x1={x - 6}
                    x2={x + 6}
                    y1={READINESS_PLOT.bottom}
                    y2={READINESS_PLOT.bottom}
                    stroke="var(--line)"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                );
              }
              const y = yScale(value);
              const barWidth = widthForBar(index);
              const barHeight = READINESS_PLOT.bottom - y;
              const segments = stageSegments(index);
              return (
                <g
                  key={point.date}
                  data-sleep-bar
                  className={
                    selectedDate === point.date
                      ? "chart-bar--selected"
                      : undefined
                  }
                >
                  {segments ? (
                    (() => {
                      let cursor = READINESS_PLOT.bottom;
                      return segments.map((segment) => {
                        const segmentHeight = barHeight * segment.share;
                        cursor -= segmentHeight;
                        return (
                          <rect
                            key={segment.key}
                            data-sleep-stage={segment.key}
                            x={x - barWidth / 2}
                            y={cursor}
                            width={barWidth}
                            height={segmentHeight}
                            fill={segment.fill}
                            fillOpacity={segment.fillOpacity}
                            stroke={segment.stroke}
                            strokeWidth={segment.stroke ? 1 : undefined}
                          />
                        );
                      });
                    })()
                  ) : (
                    <rect
                      x={x - barWidth / 2}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      fill="var(--series-2)"
                    />
                  )}
                </g>
              );
            })}
            {baseline && (
              <g data-sleep-average-line>
                <line
                  x1={READINESS_PLOT.left}
                  x2={READINESS_PLOT.right}
                  y1={yScale(baseline.mean)}
                  y2={yScale(baseline.mean)}
                  stroke="var(--series-1)"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  opacity="0.75"
                />
              </g>
            )}
          </g>
          <ChartHitColumns
            points={projection.points}
            xScale={xScale}
            plotBounds={READINESS_PLOT}
            selectedDate={selectedDate}
            dataAttribute="data-sleep-night"
            label={(point) =>
              `Inspect Sleep for ${formatDate(point.date)}, ${
                point.value === null
                  ? "no recording"
                  : formatDuration(point.value)
              }`
            }
            onActivate={(index) =>
              setSelectedDate(projection.points[index].date)
            }
            onHover={setHoverIndex}
          />
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
          ? "28d baseline —"
          : `28d baseline ${formatDuration(baseline?.mean ?? null)}`
      }
      trendLabel={
        projection.status === "unavailable" ? undefined : baselineTrend
      }
      directionHint="h:mm · deep · light · rem · awake"
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
        .filter((annotation) => annotation.kind !== "phase")
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
                <text
                  data-chart-annotation-label
                  className="chart-annotation__label chart-annotation__label--phase"
                  x={x + 12}
                  y={35}
                >
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
                stroke="var(--ochre)"
                strokeDasharray="2 3"
                data-chart-race-line
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
                className="chart-annotation__label"
                x={x + 5}
                y={56}
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
  const [hoverWeek, setHoverWeek] = useState<string | null>(null);
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
      const description = `Weekly Volume and Training Load. Current: ${volumeCurrent} km distance; Training Load ${loadCurrent}. Direction: Neutral direction. Coverage: ${projection.coverage.availableLoads} of ${projection.coverage.results} Workout Results with available load.`;
      const hoveredWeek = projection.weeks.find(
        ({ weekStart }) => weekStart === hoverWeek,
      );
      const hoveredParsed = hoveredWeek
        ? parseChartDate(hoveredWeek.weekStart)
        : null;
      const tooltip: ChartTooltip | null =
        hoveredWeek && hoveredParsed
          ? {
              x: xScale(hoveredParsed),
              y: distanceScale(hoveredWeek.distanceKm),
              text: `${formatShortDate(hoveredWeek.weekStart)} week · ${hoveredWeek.distanceKm.toFixed(1)} km · Load ${
                hoveredWeek.trainingLoad === null
                  ? "unavailable"
                  : hoveredWeek.trainingLoad
              }`,
            }
          : null;
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
              Weekly Volume and Training Load
            </title>
            <desc id="volume-load-description">{description}</desc>
            <g data-chart-grid aria-hidden="true">
              {distanceScale
                .ticks(3)
                .filter((tick) => tick > 0)
                .map((tick) => {
                  const y = distanceScale(tick);
                  if (y < 42) return null;
                  return (
                    <g key={`distance-${tick}`}>
                      <text
                        data-chart-y-label
                        className="chart-axis-label"
                        x={CHART_PLOT.left - 8}
                        y={y - 5}
                        textAnchor="end"
                      >
                        {tick}
                      </text>
                    </g>
                  );
                })}
              {loadScale
                .ticks(3)
                .filter((tick) => tick > 0)
                .map((tick) => {
                  const y = loadScale(tick);
                  if (y < 242) return null;
                  return (
                    <g key={`load-${tick}`}>
                      <text
                        data-chart-y-label
                        className="chart-axis-label"
                        x={CHART_PLOT.left - 8}
                        y={y - 5}
                        textAnchor="end"
                      >
                        {tick}
                      </text>
                    </g>
                  );
                })}
              {[170, 372].map((y) => (
                <line
                  key={`baseline-${y}`}
                  data-chart-baseline
                  x1={CHART_PLOT.left}
                  x2={CHART_PLOT.right}
                  y1={y}
                  y2={y}
                  stroke="var(--line)"
                  strokeWidth="1"
                  shapeRendering="crispEdges"
                />
              ))}
              <text
                data-chart-y-label
                className="chart-axis-label"
                x="64"
                y="18"
              >
                Distance km
              </text>
              <text
                data-chart-y-label
                className="chart-axis-label"
                x="64"
                y="236"
              >
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
                    onPointerEnter={() => setHoverWeek(week.weekStart)}
                    onPointerLeave={() => setHoverWeek(null)}
                    onFocus={() => setHoverWeek(week.weekStart)}
                    onBlur={() => setHoverWeek(null)}
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
                    <text
                      data-volume-bar-value
                      className="chart-axis-label"
                      x={x}
                      y={y - 6}
                      textAnchor="middle"
                    >
                      {week.distanceKm.toFixed(1)}
                    </text>
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
            </g>
            <g data-chart-x-labels aria-hidden="true">
              {projection.weeks.map((week, index) => {
                const parsed = parseChartDate(week.weekStart);
                if (!parsed) return null;
                return (
                  <text
                    key={week.weekStart}
                    data-chart-x-label
                    className="chart-axis-label"
                    x={xScale(parsed)}
                    y="408"
                    textAnchor={
                      index === 0
                        ? "start"
                        : index === projection.weeks.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {formatShortDate(week.weekStart)}
                  </text>
                );
              })}
            </g>
          </svg>
          {tooltip && (
            <div
              className="chart-plot__tooltip"
              data-chart-tooltip
              aria-hidden="true"
              style={{
                left: `clamp(56px, ${(tooltip.x / 720) * 100}%, calc(100% - 56px))`,
                top: `${(tooltip.y / 420) * 100}%`,
              }}
            >
              {tooltip.text}
            </div>
          )}
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
      metric="Weekly Volume + Training Load"
      currentValue={projection.status === "unavailable" ? "—" : volumeCurrent}
      unit="km"
      directionHint="weekly km · training load"
      readout={fixedReadout}
      plot={plot}
      coverage=""
    />
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
  const [hoverId, setHoverId] = useState<string | null>(null);
  const selected =
    projection.points.find(
      ({ workoutResultId }) => workoutResultId === selectedId,
    ) ?? projection.selected;
  const readout = selected
    ? `${formatShortDate(selected.date)} · ${selected.title}${
        selected.workoutType ? ` · ${selected.workoutType}` : ""
      } · ${formatPace(selected.paceSecondsPerKm)} · ${selected.heartRateBpm} bpm`
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
      const fit = projection.fit;
      const [fitPaceStart, fitPaceEnd] = [paceMax, paceMin];
      const fitHeartRates = fit
        ? [
            fit.slope * fitPaceStart + fit.intercept,
            fit.slope * fitPaceEnd + fit.intercept,
          ]
        : [];
      const yScale = createLinearScale(
        [
          ...projection.points.map(({ heartRateBpm }) => heartRateBpm),
          ...fitHeartRates,
        ],
        [CHART_PLOT.bottom, CHART_PLOT.top],
      );
      const chronological = [...projection.points].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      );
      const recencyRank = new Map(
        chronological.map(({ workoutResultId }, index) => [
          workoutResultId,
          index,
        ]),
      );
      const opacityFor = (workoutResultId: string) => {
        if (chronological.length < 2) return 1;
        const rank = recencyRank.get(workoutResultId) ?? 0;
        return 0.35 + 0.65 * (rank / (chronological.length - 1));
      };
      const hovered =
        projection.points.find(
          ({ workoutResultId }) => workoutResultId === hoverId,
        ) ?? null;
      const tooltip: ChartTooltip | null = hovered
        ? {
            x: xScale(hovered.paceSecondsPerKm),
            y: yScale(hovered.heartRateBpm),
            text: `${formatShortDate(hovered.date)} · ${formatPace(hovered.paceSecondsPerKm)} · ${hovered.heartRateBpm} bpm`,
          }
        : null;
      const fitSummary = fit
        ? ` Dashed line: fit across ${fit.pointCount} runs — heart rate ${
            fit.slope > 0 ? "rises" : "falls"
          } about ${Math.abs(fit.slope * 10).toFixed(1)} bpm per 10 seconds-per-km slower pace.`
        : "";
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
            <title id="pace-heart-rate-title">Pace versus Heart Rate</title>
            <desc id="pace-heart-rate-description">
              Derived from your runs. Current:{" "}
              {selected ? formatPace(selected.paceSecondsPerKm) : "—"}.
              {fitSummary || " Direction: No fitted trend."} Newer runs render
              more solid than older runs. Coverage: {projection.points.length}{" "}
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
                    <text
                      data-chart-y-label
                      className="chart-axis-label"
                      x={CHART_PLOT.left - 8}
                      y={y - 5}
                      textAnchor="end"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
            </g>
            <g data-chart-x-ticks aria-hidden="true">
              {xScale.ticks(4).map((tick) => {
                const x = xScale(tick);
                if (x < CHART_PLOT.left || x > CHART_PLOT.right) return null;
                return (
                  <g key={tick}>
                    <line
                      data-chart-pace-tick
                      x1={x}
                      x2={x}
                      y1={CHART_PLOT.bottom}
                      y2={CHART_PLOT.bottom + 6}
                      stroke="var(--line)"
                      strokeWidth="1"
                      shapeRendering="crispEdges"
                    />
                    <text
                      data-chart-pace-tick-label
                      className="chart-axis-label"
                      x={x}
                      y={CHART_PLOT.bottom + 20}
                      textAnchor="middle"
                    >
                      {formatPaceSeconds(tick)}
                    </text>
                  </g>
                );
              })}
            </g>
            {fit && (
              <line
                data-pace-fit-line
                aria-hidden="true"
                x1={xScale(fitPaceStart)}
                y1={yScale(fit.slope * fitPaceStart + fit.intercept)}
                x2={xScale(fitPaceEnd)}
                y2={yScale(fit.slope * fitPaceEnd + fit.intercept)}
                stroke="var(--series-2)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            )}
            <g data-chart-series data-chart-series-kind="pace-heart-rate">
              {projection.points.map((point) => {
                const x = xScale(point.paceSecondsPerKm);
                const y = yScale(point.heartRateBpm);
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
                    onPointerEnter={() => setHoverId(point.workoutResultId)}
                    onPointerLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(point.workoutResultId)}
                    onBlur={() => setHoverId(null)}
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
                    <circle
                      data-pace-point-visible
                      cx={x}
                      cy={y}
                      r="5"
                      fill="var(--series-1)"
                      fillOpacity={opacityFor(point.workoutResultId)}
                    />
                  </g>
                );
              })}
            </g>
            <text
              data-pace-axis-label
              className="chart-axis-label"
              x="360"
              y="272"
              textAnchor="middle"
            >
              Average pace (faster →)
            </text>
            <text
              data-hr-axis-label
              className="chart-axis-label"
              x="14"
              y="130"
              transform="rotate(-90 14 130)"
              textAnchor="middle"
            >
              Average heart rate (bpm)
            </text>
          </svg>
          {tooltip && (
            <div
              className="chart-plot__tooltip"
              data-chart-tooltip
              aria-hidden="true"
              style={{
                left: `clamp(56px, ${(tooltip.x / CHART_VIEWBOX.width) * 100}%, calc(100% - 56px))`,
                top: `${(tooltip.y / CHART_VIEWBOX.height) * 100}%`,
              }}
            >
              {tooltip.text}
            </div>
          )}
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
      metric="Pace vs Heart Rate"
      currentValue={
        projection.status === "unavailable" || !selected
          ? "—"
          : formatPace(selected.paceSecondsPerKm)
      }
      unit=""
      directionHint="min/km · newer runs render solid · dashed = fit across runs"
      readout={
        <>
          {readout}
          {action}
        </>
      }
      plot={plot}
      coverage=""
    />
  );
}

const TRENDS_RANGE_OPTIONS = ["4w"] as const;

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
          {option}
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
            <h3 id="readiness-group-title">Readiness</h3>
          </div>
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
          rollingAverage={hrv.rollingAverage}
          baseline={hrv.baseline}
          baselineDelta={hrv.baselineDelta}
          baselineStatus={hrv.baselineStatus}
          polarity="higher"
          displayFrom={rangeWindow.from}
          displayTo={rangeWindow.to}
          onViewAdaptation={onViewAdaptation}
        />
        <HrvChart
          points={restingHeartRate.points}
          annotations={annotations}
          status={restingHeartRate.status}
          metric="Resting Heart Rate"
          unit="bpm"
          chartId="resting-heart-rate"
          seriesId="resting-heart-rate"
          average={restingHeartRate.average}
          rollingAverage={restingHeartRate.rollingAverage}
          baseline={restingHeartRate.baseline}
          baselineDelta={restingHeartRate.baselineDelta}
          baselineStatus={restingHeartRate.baselineStatus}
          polarity="lower"
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
            <h3 id="performance-group-title">Training Performance</h3>
          </div>
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
      </section>
      <p className="trends-provenance">{TRENDS_SOURCE}</p>
    </div>
  );
}
