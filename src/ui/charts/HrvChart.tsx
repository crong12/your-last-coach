import { useState, type ReactNode } from "react";

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

/**
 * Presentation-only evidence window. The single observed value is the
 * authoritative fixture's sleep HRV reading; unknown nights stay missing.
 */
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

function readoutForPoint(point: ChartPoint | null): ReactNode {
  if (!point) return "No recorded nights in this range";
  return `${formatShortDate(point.date)} · ${
    point.value === null ? "No recording" : `${point.value} ms`
  }`;
}

function trendFor(current: number | null, average: number | null) {
  if (current === null || average === null) {
    return { glyph: "—", label: "No trend available" };
  }
  if (current > average)
    return { glyph: "↑", label: "Up versus recorded nights" };
  if (current < average) {
    return { glyph: "↓", label: "Down versus recorded nights" };
  }
  return { glyph: "→", label: "Flat versus recorded nights" };
}

export function HrvChart({
  currentValue = 55,
  points: suppliedPoints,
  annotations = [],
  onViewAdaptation = () => undefined,
}: HrvChartProps) {
  const points = (suppliedPoints ?? createDemoHrvPoints(currentValue)).map(
    (point) => ({ ...point, value: finiteValue(point.value) }),
  );
  const coverage = getCoverage(points);
  const latestObserved = currentPoint(points);
  const average =
    coverage.observed > 0
      ? Math.round(
          points.reduce((total, point) => total + (point.value ?? 0), 0) /
            coverage.observed,
        )
      : null;
  const trend = trendFor(latestObserved?.value ?? null, average);
  const [selection, setSelection] = useState<Selection>(() =>
    latestObserved
      ? { kind: "point", date: latestObserved.date }
      : points[0]
        ? { kind: "point", date: points[0].date }
        : null,
  );

  const selectedPoint =
    selection?.kind === "point"
      ? (points.find(({ date }) => date === selection.date) ?? null)
      : null;
  const readout =
    selection?.kind === "annotation"
      ? selection.annotation.kind === "adaptation"
        ? `${formatShortDate(selection.annotation.date)} · Approved adaptation: ${selection.annotation.label}`
        : selection.annotation.kind === "phase"
          ? `${formatShortDate(selection.annotation.date)} · Phase: ${selection.annotation.label}`
          : `${formatShortDate(selection.annotation.date)} · Race day: ${selection.annotation.label}`
      : readoutForPoint(selectedPoint ?? latestObserved);
  const currentLabel = latestObserved ? String(latestObserved.value) : "—";
  const averageLabel =
    average === null ? "7-night avg —" : `7-night avg ${average} ms`;
  const summary = latestObserved
    ? `HRV, current value ${latestObserved.value} milliseconds, ${trend.label.toLowerCase()}, ${coverage.observed} of ${coverage.expected} nights recorded.`
    : `HRV, no recorded nights in this range, ${coverage.observed} of ${coverage.expected} nights recorded.`;
  const hasObserved = coverage.observed > 0;

  const plot = hasObserved ? (
    (() => {
      const xScale = createTimeScale(
        points.map(({ date }) => date),
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
          id="hrv"
          title="HRV trend"
          description={summary}
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
              value === null ? "no recording" : `${value} milliseconds`;
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
                    data-series="hrv"
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
                  label={`Inspect HRV for ${formatLongDate(point.date)}, ${accessibleValue}`}
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
    <p className="chart-card__empty">No recorded nights in this range</p>
  );

  const selectedAdaptation =
    selection?.kind === "annotation" &&
    selection.annotation.kind === "adaptation"
      ? selection.annotation
      : null;
  const fixedReadout = selectedAdaptation ? (
    <>
      <span>
        {formatShortDate(selectedAdaptation.date)} · Approved adaptation:{" "}
        {selectedAdaptation.label}
      </span>
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
      id="hrv"
      metric="HRV"
      currentValue={currentLabel}
      unit="ms"
      averageLabel={averageLabel}
      averageBasis="recorded nights"
      trendGlyph={trend.glyph}
      trendLabel={trend.label}
      readout={fixedReadout}
      plot={plot}
      coverage={`${coverage.observed} of ${coverage.expected} nights recorded`}
      source="Source: seeded synthetic COROS-shaped observations"
    />
  );
}
