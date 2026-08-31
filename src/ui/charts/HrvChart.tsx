import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ChartCard } from "./ChartCard";
import { ChartPlot } from "./ChartPlot";
import {
  createLinePath,
  createLinearScale,
  createTimeScale,
  getCoverage,
  parseChartDate,
} from "./chartMath";
import { InspectablePoint } from "./InspectablePoint";
import {
  CHART_PLOT,
  type ChartAnnotation,
  type ChartPoint,
} from "./chartTypes";

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

function readoutForPoint(point: ChartPoint | null, unit: string): ReactNode {
  if (!point) return "No recorded nights in this range";
  return `${formatShortDate(point.date)} · ${
    point.value === null ? "No recording" : `${point.value} ${unit}`
  }`;
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
}: HrvChartProps) {
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
  const trend = trendFor(latestObserved?.value ?? null, average);
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
  const averageLabel =
    average === null ? "7-night avg —" : `7-night avg ${average} ${unit}`;
  const summary = latestObserved
    ? `${metric}. Current: ${latestObserved.value} ${unit}. Direction: ${trend.label}. Coverage: ${coverage.observed} of ${coverage.expected} nights recorded.`
    : `${metric}. Current: —. Direction: No trend available. Coverage: ${coverage.observed} of ${coverage.expected} nights recorded.`;
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
        [CHART_PLOT.left, CHART_PLOT.right],
      );
      const yScale = createLinearScale(
        points.map(({ value }) => value),
        [CHART_PLOT.bottom, CHART_PLOT.top],
      );
      const path =
        coverage.observed > 1 ? createLinePath(points, xScale, yScale) : "";
      return (
        <ChartPlot
          id={chartId}
          title={`${metric} trend`}
          description={summaryWithAnnotations}
          points={points}
          xScale={xScale}
          yScale={yScale}
          annotations={annotations}
          onSelectAnnotation={(annotation) =>
            setSelection({ kind: "annotation", annotation })
          }
        >
          {points.map((point, index) => {
            const parsedDate = parseChartDate(point.date);
            if (!parsedDate) return null;
            const value = finiteValue(point.value);
            const x = xScale(parsedDate);
            const y = value === null ? CHART_PLOT.bottom : yScale(value);
            const accessibleValue =
              value === null ? "no recording" : `${value} ${unit}`;
            return (
              <g key={point.date}>
                {value === null && (
                  <line
                    data-missing-date
                    data-chart-date={point.date}
                    x1={x - 8}
                    x2={x + 8}
                    y1={CHART_PLOT.bottom}
                    y2={CHART_PLOT.bottom}
                    stroke="var(--line)"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                )}
                {index === 0 && path !== "" && (
                  <path
                    data-series={seriesId}
                    d={path}
                    fill="none"
                    stroke="var(--series-1)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <InspectablePoint
                  x={x}
                  y={y}
                  date={point.date}
                  label={`Inspect ${metric} for ${formatLongDate(point.date)}, ${accessibleValue}`}
                  selected={
                    selection?.kind === "point" && selection.date === point.date
                  }
                  missing={value === null}
                  onActivate={() =>
                    setSelection({ kind: "point", date: point.date })
                  }
                />
              </g>
            );
          })}
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
      averageBasis="recorded nights"
      trendGlyph={status === "unavailable" ? "—" : trend.glyph}
      trendLabel={status === "unavailable" ? "No trend available" : trend.label}
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
