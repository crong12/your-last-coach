import { useId, type KeyboardEvent, type ReactNode } from "react";
import type { ScaleLinear, ScaleTime } from "d3-scale";

import { parseChartDate } from "./chartMath";
import {
  CHART_PLOT,
  CHART_VIEWBOX,
  type ChartAnnotation,
  type ChartPoint,
} from "./chartTypes";

export interface ChartPlotProps {
  id: string;
  title: string;
  description: string;
  points: readonly ChartPoint[];
  xScale: ScaleTime<number, number>;
  yScale: ScaleLinear<number, number>;
  annotations: readonly ChartAnnotation[];
  onSelectAnnotation: (annotation: ChartAnnotation) => void;
  children?: ReactNode;
}

function formatTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatShortDate(value: string) {
  const parsed = parseChartDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function isAnnotation(value: unknown): value is ChartAnnotation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.kind !== "phase" &&
      candidate.kind !== "adaptation" &&
      candidate.kind !== "race") ||
    typeof candidate.date !== "string" ||
    typeof candidate.label !== "string" ||
    candidate.label.trim() === ""
  ) {
    return false;
  }
  if (candidate.kind === "adaptation") {
    return (
      typeof candidate.adaptationId === "string" &&
      candidate.adaptationId.trim() !== ""
    );
  }
  return true;
}

function isInDomain(date: Date, xScale: ScaleTime<number, number>) {
  const [first, second] = xScale.domain();
  const time = date.getTime();
  return (
    time >= Math.min(first.getTime(), second.getTime()) &&
    time <= Math.max(first.getTime(), second.getTime())
  );
}

function annotationKey(annotation: ChartAnnotation) {
  return `${annotation.kind}-${annotation.date}-${annotation.label}`;
}

function AnnotationMark({
  annotation,
  x,
  onSelect,
}: {
  annotation: ChartAnnotation;
  x: number;
  onSelect: () => void;
}) {
  if (annotation.kind === "phase") {
    return (
      <g
        data-chart-annotation
        data-chart-annotation-kind="phase"
        data-chart-date={annotation.date}
      >
        <line
          data-chart-phase-line
          x1={x}
          x2={x}
          y1={CHART_PLOT.top}
          y2={CHART_PLOT.bottom}
          stroke="var(--line)"
          strokeDasharray="3 4"
        />
        <text
          data-chart-annotation-label
          data-chart-phase-label
          x={x + 5}
          y={CHART_PLOT.top + 12}
          className="chart-annotation__label chart-annotation__label--phase"
        >
          {annotation.label}
        </text>
      </g>
    );
  }

  if (annotation.kind === "race") {
    return (
      <g
        data-chart-annotation
        data-chart-annotation-kind="race"
        data-chart-date={annotation.date}
      >
        <line
          data-chart-race-line
          x1={x}
          x2={x}
          y1={CHART_PLOT.top}
          y2={CHART_PLOT.bottom}
          stroke="var(--ochre)"
          strokeDasharray="2 3"
        />
        <path
          data-chart-race-flag
          d={`M ${x} ${CHART_PLOT.top} h 22 l -5 6 l 5 6 h -22 z`}
          fill="var(--ochre)"
        />
        <text
          data-chart-annotation-label
          x={x + 5}
          y={CHART_PLOT.top + 28}
          className="chart-annotation__label"
        >
          {annotation.label}
        </text>
      </g>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  };
  const diamondY = CHART_PLOT.top + 23;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Inspect approved adaptation ${annotation.label}`}
      data-chart-annotation
      data-chart-annotation-kind="adaptation"
      data-chart-date={annotation.date}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <rect
        data-chart-adaptation-hit-area
        x={x - 22}
        y={diamondY - 22}
        width="44"
        height="44"
        fill="var(--paper)"
        fillOpacity="0.001"
        pointerEvents="all"
      />
      <polygon
        data-chart-adaptation-diamond
        points={`${x},${diamondY - 8} ${x + 8},${diamondY} ${x},${diamondY + 8} ${x - 8},${diamondY}`}
        fill="var(--track)"
      />
      <text
        data-chart-annotation-label
        x={x + 12}
        y={diamondY + 4}
        className="chart-annotation__label"
      >
        {annotation.label}
      </text>
    </g>
  );
}

function selectTicks(values: readonly number[]) {
  const finite = values.filter(Number.isFinite);
  if (finite.length <= 4) return finite;
  return [
    finite[0],
    finite[Math.floor((finite.length - 1) / 2)],
    finite.at(-1)!,
  ];
}

export function ChartPlot({
  id,
  title,
  description,
  points,
  xScale,
  yScale,
  annotations,
  onSelectAnnotation,
  children,
}: ChartPlotProps) {
  const generatedId = useId().replaceAll(":", "");
  const titleId = `${id}-${generatedId}-title`;
  const descriptionId = `${id}-${generatedId}-description`;
  const clipId = `${id}-${generatedId}-clip`;
  const ticks = selectTicks(yScale.ticks(3));
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;
  const xLabels =
    firstDate && lastDate && firstDate !== lastDate
      ? [firstDate, lastDate]
      : firstDate
        ? [firstDate]
        : [];
  const renderableAnnotations = annotations.filter((annotation) => {
    if (!isAnnotation(annotation)) return false;
    const date = parseChartDate(annotation.date);
    return date !== null && isInDomain(date, xScale);
  });

  return (
    <div className="chart-card__plot">
      <svg
        className="chart-plot"
        data-chart={id}
        viewBox={`0 0 ${CHART_VIEWBOX.width} ${CHART_VIEWBOX.height}`}
        width="100%"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>{title}</title>
        <desc id={descriptionId}>{description}</desc>
        <defs>
          <clipPath id={clipId}>
            <rect
              x="0"
              y="0"
              width={CHART_VIEWBOX.width}
              height={CHART_VIEWBOX.height}
            />
          </clipPath>
        </defs>
        <g data-chart-grid aria-hidden="true">
          {ticks.map((tick) => {
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
                <text
                  data-chart-y-label
                  x={CHART_PLOT.left + 4}
                  y={y - 5}
                  className="chart-axis-label"
                >
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}
        </g>
        <g data-chart-series clipPath={`url(#${clipId})`}>
          {children}
        </g>
        <g data-chart-annotations aria-label="Chart annotations">
          {renderableAnnotations.map((annotation) => {
            const parsedDate = parseChartDate(annotation.date);
            if (!parsedDate) return null;
            return (
              <AnnotationMark
                key={annotationKey(annotation)}
                annotation={annotation}
                x={xScale(parsedDate)}
                onSelect={() => onSelectAnnotation(annotation)}
              />
            );
          })}
        </g>
        <g data-chart-x-labels aria-hidden="true">
          {xLabels.map((date, index) => {
            const parsedDate = parseChartDate(date);
            if (!parsedDate) return null;
            return (
              <text
                data-chart-x-label
                key={date}
                x={xScale(parsedDate)}
                y={CHART_VIEWBOX.height - 10}
                textAnchor={index === 0 && xLabels.length > 1 ? "start" : "end"}
                className="chart-axis-label"
              >
                {formatShortDate(date)}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
