import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ChartCard } from "./ChartCard";
import { ChartHitColumns } from "./ChartHitColumns";
import { ChartPlot } from "./ChartPlot";
import {
  createLinePath,
  createLinearScale,
  createTimeScale,
  getCoverage,
  parseChartDate,
  weeklyTickDates,
} from "./chartMath";
import {
  READINESS_PLOT,
  READINESS_VIEWBOX,
  type ChartAnnotation,
  type ChartPoint,
  type ChartTooltip,
} from "./chartTypes";

export interface ReadinessBandProps {
  mean: number;
  low: number;
  high: number;
  sampleCount: number;
}

const HRV_DEMO_DATES = [
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
] as const;

/** Presentation-only foundation fixture used when the chart is rendered alone. */
export function createDemoHrvPoints(currentValue = 55): readonly ChartPoint[] {
  return HRV_DEMO_DATES.map((date) => ({
    date,
    value: date === "2026-08-26" ? currentValue : null,
  }));
}

type PointSelection = { kind: "point"; date: string };
type AnnotationSelection = { kind: "annotation"; annotation: ChartAnnotation };
type Selection = PointSelection | AnnotationSelection | null;

export interface HrvChartProps {
  currentValue?: number;
  points?: readonly ChartPoint[];
  annotations?: readonly ChartAnnotation[];
  onViewAdaptation?: (adaptationId: string) => void;
  metric?: string;
  unit?: string;
  chartId?: string;
  seriesId?: string;
  status?: "ready" | "partial" | "empty" | "unavailable";
  unavailableMessage?: string;
  source?: string;
  displayFrom?: string;
  displayTo?: string;
  average?: number | null;
  /** 7-day rolling average series; when provided it becomes the primary line. */
  rollingAverage?: readonly ChartPoint[];
  /** Personal 28-day baseline band; when provided the header shows the delta. */
  baseline?: ReadinessBandProps | null;
  baselineDelta?: number | null;
  baselineStatus?: "within" | "above" | "below" | null;
  /** Which direction is good for this metric. Default "higher" (HRV). */
  polarity?: "higher" | "lower";
}

function finiteValue(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : null;
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

function formatLongDate(date: string) {
  const parsed = parseChartDate(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
}

function currentPoint(points: readonly ChartPoint[]) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = finiteValue(points[index].value);
    if (value !== null) return { ...points[index], value };
  }
  return null;
}

function trendFor(current: number | null, average: number | null) {
  if (current === null || average === null) {
    return { label: "No trend available" };
  }
  if (current > average) return { label: "Up versus recorded nights" };
  if (current < average) return { label: "Down versus recorded nights" };
  return { label: "Flat versus recorded nights" };
}

function readoutForPoint(point: ChartPoint | null, unit: string): ReactNode {
  if (!point) return "No recorded nights in this range";
  return `${formatShortDate(point.date)} · ${
    point.value === null ? "No recording" : `${point.value} ${unit}`
  }`;
}

function annotationReadout(annotation: ChartAnnotation) {
  if (annotation.kind === "adaptation") {
    return `${formatShortDate(annotation.date)} · Approved adaptation: ${annotation.label}`;
  }
  if (annotation.kind === "phase") {
    return `${formatShortDate(annotation.date)} · Phase: ${annotation.label}`;
  }
  return `${formatShortDate(annotation.date)} · Race day: ${annotation.label}`;
}

function annotationIsVisible(
  annotation: ChartAnnotation,
  points: readonly ChartPoint[],
) {
  const first = points[0]?.date;
  const last = points.at(-1)?.date;
  return Boolean(
    first && last && annotation.date >= first && annotation.date <= last,
  );
}

function passiveAnnotationLabels(
  annotations: readonly ChartAnnotation[],
  from: string | undefined,
  to: string | undefined,
) {
  return annotations
    .filter(
      (annotation) =>
        annotation.kind !== "adaptation" &&
        (!from || annotation.date >= from) &&
        (!to || annotation.date <= to),
    )
    .map(({ label }) => label);
}

export function HrvChart({
  currentValue = 55,
  points: suppliedPoints,
  annotations = [],
  onViewAdaptation = () => undefined,
  metric = "HRV",
  unit = "ms",
  chartId = "hrv",
  seriesId = "hrv",
  status,
  unavailableMessage,
  source,
  displayFrom,
  displayTo,
  average: suppliedAverage,
  rollingAverage,
  baseline = null,
  baselineDelta = null,
  baselineStatus = null,
  polarity = "higher",
}: HrvChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const points = useMemo(
    () =>
      (suppliedPoints ?? createDemoHrvPoints(currentValue)).map((point) => ({
        ...point,
        value: finiteValue(point.value),
      })),
    [currentValue, suppliedPoints],
  );
  const coverage = getCoverage(points);
  const latestObserved = currentPoint(points);
  const calculatedAverage =
    coverage.observed > 0
      ? Math.round(
          points.reduce((total, point) => total + (point.value ?? 0), 0) /
            coverage.observed,
        )
      : null;
  const average =
    suppliedAverage === undefined ? calculatedAverage : suppliedAverage;
  const [selection, setSelection] = useState<Selection>(() =>
    latestObserved
      ? { kind: "point", date: latestObserved.date }
      : points[0]
        ? { kind: "point", date: points[0].date }
        : null,
  );

  useEffect(() => {
    setSelection((current) => {
      if (current?.kind === "point") {
        const point = points.find(({ date }) => date === current.date);
        if (point) return current;
      }
      if (
        current?.kind === "annotation" &&
        annotationIsVisible(current.annotation, points) &&
        annotations.some(
          (annotation) =>
            annotation.kind === current.annotation.kind &&
            annotation.date === current.annotation.date &&
            annotation.label === current.annotation.label,
        )
      ) {
        return current;
      }
      return latestObserved
        ? { kind: "point", date: latestObserved.date }
        : points[0]
          ? { kind: "point", date: points[0].date }
          : null;
    });
  }, [annotations, latestObserved?.date, points]);

  const selectedPoint =
    selection?.kind === "point"
      ? (points.find(({ date }) => date === selection.date) ?? null)
      : null;
  const readout =
    selection?.kind === "annotation"
      ? annotationReadout(selection.annotation)
      : readoutForPoint(selectedPoint ?? latestObserved, unit);
  const currentLabel = latestObserved ? String(latestObserved.value) : "—";
  const averageLabel = baseline
    ? `28d baseline ${Math.round(baseline.mean)} ${unit}`
    : average === null
      ? "7-night avg —"
      : `7-night avg ${average} ${unit}`;
  const trend = trendFor(latestObserved?.value ?? null, average);
  const outsideBadSide =
    (polarity === "higher" && baselineStatus === "below") ||
    (polarity === "lower" && baselineStatus === "above");
  const roundedDelta =
    baselineDelta === null ? null : Math.round(baselineDelta);
  const deltaTrend =
    baseline && roundedDelta !== null
      ? {
          label:
            roundedDelta === 0
              ? "at baseline"
              : `${roundedDelta > 0 ? "+" : "−"}${Math.abs(roundedDelta)} vs baseline`,
          glyph:
            baselineStatus === "above"
              ? "▲"
              : baselineStatus === "below"
                ? "▼"
                : undefined,
          tone: (outsideBadSide ? "warn" : "neutral") as "warn" | "neutral",
        }
      : null;
  const baselineSummary = baseline
    ? ` Personal baseline (28 days, recorded days): ${Math.round(baseline.low)}–${Math.round(baseline.high)} ${unit}; latest is ${
        baselineStatus === "within"
          ? "within the baseline range"
          : `${baselineStatus} the baseline range`
      }.`
    : "";
  const summary = latestObserved
    ? `${metric}. Current: ${latestObserved.value} ${unit}. Direction: ${trend.label}.${baselineSummary} Coverage: ${coverage.observed} of ${coverage.expected} nights recorded.`
    : `${metric}. Current: —. Direction: ${trend.label}. Coverage: ${coverage.observed} of ${coverage.expected} nights recorded.`;
  const passiveLabels = passiveAnnotationLabels(
    annotations,
    displayFrom ?? points[0]?.date,
    displayTo ?? points.at(-1)?.date,
  );
  const summaryWithAnnotations = passiveLabels.length
    ? `${summary} Passive annotations: ${passiveLabels.join(", ")}.`
    : summary;
  const hasObserved = coverage.observed > 0 && status !== "unavailable";

  const plot = hasObserved ? (
    (() => {
      const xScale = createTimeScale(
        [
          displayFrom ?? points[0]?.date,
          ...points.map(({ date }) => date),
          displayTo ?? points.at(-1)?.date,
        ].filter((date): date is string => date !== undefined),
        [READINESS_PLOT.left, READINESS_PLOT.right],
      );
      const rollingValues = (rollingAverage ?? []).map(({ value }) => value);
      const yScale = createLinearScale(
        [
          ...points.map(({ value }) => value),
          ...rollingValues,
          ...(baseline ? [baseline.low, baseline.high] : []),
        ],
        [READINESS_PLOT.bottom, READINESS_PLOT.top],
      );
      const hasRolling =
        (rollingAverage ?? []).filter(({ value }) => finiteValue(value) !== null)
          .length > 1;
      const dailyPath =
        !hasRolling && coverage.observed > 1
          ? createLinePath(points, xScale, yScale)
          : "";
      const rollingPath = hasRolling
        ? createLinePath(rollingAverage ?? [], xScale, yScale)
        : "";
      const hoverPoint = hoverIndex === null ? null : points[hoverIndex];
      const hoverValue = hoverPoint ? finiteValue(hoverPoint.value) : null;
      const hoverParsed = hoverPoint ? parseChartDate(hoverPoint.date) : null;
      const tooltip: ChartTooltip | null =
        hoverPoint && hoverParsed
          ? {
              x: xScale(hoverParsed),
              y:
                hoverValue === null
                  ? READINESS_PLOT.bottom
                  : yScale(hoverValue),
              text: `${formatShortDate(hoverPoint.date)} · ${
                hoverValue === null ? "No recording" : `${hoverValue} ${unit}`
              }`,
            }
          : null;
      return (
        <ChartPlot
          id={chartId}
          title={`${metric} trend`}
          description={summaryWithAnnotations}
          points={points}
          xScale={xScale}
          yScale={yScale}
          annotations={annotations}
          viewBox={READINESS_VIEWBOX}
          plotBounds={READINESS_PLOT}
          xTickDates={weeklyTickDates(points.map(({ date }) => date))}
          tooltip={tooltip}
          onSelectAnnotation={(annotation) =>
            setSelection({ kind: "annotation", annotation })
          }
        >
          {baseline && (
            <g data-chart-baseline aria-hidden="true">
              <rect
                data-chart-baseline-band
                x={READINESS_PLOT.left}
                y={yScale(baseline.high)}
                width={READINESS_PLOT.right - READINESS_PLOT.left}
                height={Math.max(
                  yScale(baseline.low) - yScale(baseline.high),
                  0,
                )}
                fill="var(--series-2)"
                fillOpacity="0.14"
              />
              <line
                data-chart-baseline-mean
                x1={READINESS_PLOT.left}
                x2={READINESS_PLOT.right}
                y1={yScale(baseline.mean)}
                y2={yScale(baseline.mean)}
                stroke="var(--series-2)"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
            </g>
          )}
          <g data-chart-marks aria-hidden="true" pointerEvents="none">
            {points.map((point) => {
              const parsedDate = parseChartDate(point.date);
              if (!parsedDate) return null;
              const value = finiteValue(point.value);
              const x = xScale(parsedDate);
              if (value === null) {
                return (
                  <line
                    key={point.date}
                    data-missing-date
                    data-chart-date={point.date}
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
              const isSelected =
                selection?.kind === "point" && selection.date === point.date;
              const isHovered = hoverPoint?.date === point.date;
              return (
                <g key={point.date}>
                  {isSelected && (
                    <circle
                      className="chart-point__ring"
                      data-chart-point-selection
                      cx={x}
                      cy={y}
                      r="7.5"
                      fill="none"
                      stroke="var(--series-1)"
                      strokeWidth="2"
                    />
                  )}
                  <circle
                    data-chart-dot
                    data-chart-date={point.date}
                    cx={x}
                    cy={y}
                    r={isHovered || isSelected ? 4 : hasRolling ? 2.5 : 3.5}
                    fill={hasRolling ? "var(--series-2)" : "var(--series-1)"}
                  />
                </g>
              );
            })}
            {dailyPath !== "" && (
              <path
                data-series={seriesId}
                d={dailyPath}
                fill="none"
                stroke="var(--series-1)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {rollingPath !== "" && (
              <path
                data-series={`${seriesId}-rolling`}
                d={rollingPath}
                fill="none"
                stroke="var(--series-1)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
          <ChartHitColumns
            points={points}
            xScale={xScale}
            plotBounds={READINESS_PLOT}
            selectedDate={selection?.kind === "point" ? selection.date : null}
            label={(point) => {
              const value = finiteValue(point.value);
              return `Inspect ${metric} for ${formatLongDate(point.date)}, ${
                value === null ? "no recording" : `${value} ${unit}`
              }`;
            }}
            onActivate={(index) =>
              setSelection({ kind: "point", date: points[index].date })
            }
            onHover={setHoverIndex}
          />
        </ChartPlot>
      );
    })()
  ) : (
    <p className="chart-card__empty">
      {status === "unavailable"
        ? (unavailableMessage ?? `${metric} data unavailable`)
        : "No recorded nights in this range"}
    </p>
  );

  const selectedAdaptation =
    selection?.kind === "annotation" &&
    selection.annotation.kind === "adaptation"
      ? selection.annotation
      : null;
  const fixedReadout = selectedAdaptation ? (
    <>
      <span>{annotationReadout(selectedAdaptation)}</span>{" "}
      <button
        type="button"
        className="button button--quiet chart-card__readout-action"
        data-chart-view-adaptation
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
      id={chartId}
      metric={metric}
      currentValue={status === "unavailable" ? "—" : currentLabel}
      unit={unit}
      averageLabel={status === "unavailable" ? "7-night avg —" : averageLabel}
      averageBasis={baseline ? "recorded days" : "recorded nights"}
      trendLabel={status === "unavailable" ? undefined : deltaTrend?.label}
      trendGlyph={status === "unavailable" ? undefined : deltaTrend?.glyph}
      trendTone={deltaTrend?.tone}
      directionHint={`${unit} · ${
        polarity === "lower" ? "lower is better ↓" : "higher is better ↑"
      }`}
      readout={fixedReadout}
      plot={plot}
      coverage={
        status === "unavailable"
          ? "Data unavailable"
          : `${coverage.observed} of ${coverage.expected} nights recorded`
      }
      source={source}
    />
  );
}
