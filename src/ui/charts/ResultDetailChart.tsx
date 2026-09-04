import { useId, useState, type KeyboardEvent } from "react";
import type { ScaleLinear } from "d3-scale";

import {
  createHeartRatePath,
  createHeartRateScale,
  createLapXScale,
  createPaceScale,
  getLapCoverage,
  paceBarHeight,
  summarizeLaps,
  type LapScale,
  type ResultDetailLap,
} from "./resultDetailMath";
import {
  formatDistanceKm,
  formatHeartRateBpm,
  formatPacePerKm,
  formatPaceSeconds,
} from "../metricFormatters";

const VIEWBOX = { width: 320, height: 236 } as const;
const PLOT = { left: 38, right: 296, top: 18, bottom: 188 } as const;
// Inset the lap positions from the plot edges so the first and last
// columns (bars, dots, hit areas) never overlap the y-axis or right edge.
const X_INSET = 20;

type FacetKind = "pace" | "heartRate";

interface HoverState {
  facet: FacetKind;
  index: number;
}

function formatHeartRate(value: number | null) {
  return value === null ? "No HR recorded" : formatHeartRateBpm(value);
}

function formatReadout(lap: ResultDetailLap) {
  const maximumHeartRate =
    lap.maximumHeartRateBpm === null
      ? "No max HR recorded"
      : `Max HR ${formatHeartRateBpm(lap.maximumHeartRateBpm)}`;
  return `${lap.label} · ${formatDistanceKm(lap.distanceKm, 2)} · ${
    lap.paceSecondsPerKm === null
      ? "No pace recorded"
      : formatPacePerKm(lap.paceSecondsPerKm)
  } · Avg HR ${formatHeartRate(lap.averageHeartRateBpm)} · ${maximumHeartRate}`;
}

function formatCoverage(
  observed: number,
  expected: number,
  measure: string,
): string {
  return `${observed} of ${expected} laps with ${measure}`;
}

function handleTargetKeyDown(
  event: KeyboardEvent<SVGGElement>,
  onActivate: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onActivate();
}

// Bar with rounded top corners and a square bottom, so bars sit flush on
// the x-axis baseline.
function roundedTopBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 3,
): string {
  const r = Math.max(0, Math.min(radius, height, width / 2));
  return [
    `M${x},${y + r}`,
    `a${r},${r} 0 0 1 ${r},${-r}`,
    `h${width - 2 * r}`,
    `a${r},${r} 0 0 1 ${r},${r}`,
    `v${height - r}`,
    `h${-width}`,
    "z",
  ].join("");
}

function formatFacetTooltip(kind: FacetKind, lap: ResultDetailLap): string {
  if (kind === "pace") {
    const pace =
      lap.paceSecondsPerKm === null
        ? "No pace recorded"
        : formatPacePerKm(lap.paceSecondsPerKm);
    return `${lap.label} · ${pace} · ${formatDistanceKm(lap.distanceKm, 2)}`;
  }
  const average =
    lap.averageHeartRateBpm === null
      ? "No HR recorded"
      : `avg ${formatHeartRateBpm(lap.averageHeartRateBpm)}`;
  const maximum =
    lap.maximumHeartRateBpm === null
      ? ""
      : ` · max ${formatHeartRateBpm(lap.maximumHeartRateBpm)}`;
  return `${lap.label} · ${average}${maximum}`;
}

interface LapFacetProps {
  kind: FacetKind;
  laps: readonly ResultDetailLap[];
  xScale: LapScale;
  yScale: ScaleLinear<number, number>;
  summary: string;
  hover: HoverState | null;
  onHover: (hover: HoverState | null) => void;
  onSelect: (index: number) => void;
}

function LapFacet({
  kind,
  laps,
  xScale,
  yScale,
  summary,
  hover,
  onHover,
  onSelect,
}: LapFacetProps) {
  const isPace = kind === "pace";
  const generatedId = useId().replaceAll(":", "");
  const titleId = `result-facet-${kind}-${generatedId}-title`;
  const descriptionId = `result-facet-${kind}-${generatedId}-description`;
  const ticks = yScale.ticks(4);
  const formatTick = isPace
    ? formatPaceSeconds
    : (value: number) => String(Math.round(value));
  const spacing =
    laps.length > 1 ? Math.abs(xScale(1) - xScale(0)) : PLOT.right - PLOT.left;
  const barWidth = Math.min(26, Math.max(10, spacing - 16));
  // Partition the plot into non-overlapping columns at the midpoints between
  // lap centres so every pointer position resolves to exactly one lap; the
  // first and last columns extend to the plot edges.
  const columnBounds = (index: number): { x: number; width: number } => {
    const centre = xScale(index);
    const left = index === 0 ? PLOT.left : (xScale(index - 1) + centre) / 2;
    const right =
      index === laps.length - 1 ? PLOT.right : (centre + xScale(index + 1)) / 2;
    return { x: left, width: right - left };
  };
  const readValue = (lap: ResultDetailLap) =>
    isPace ? lap.paceSecondsPerKm : lap.averageHeartRateBpm;
  const heartRatePath = isPace ? "" : createHeartRatePath(laps, xScale, yScale);
  const linkedIndex = hover?.index ?? null;
  const hoveredHere = hover?.facet === kind ? hover.index : null;
  const hoveredLap = hoveredHere === null ? null : (laps[hoveredHere] ?? null);
  const hoveredValue = hoveredLap === null ? null : readValue(hoveredLap);
  const tooltip =
    hoveredLap === null
      ? null
      : {
          x: xScale(hoveredHere ?? 0),
          y: hoveredValue === null ? PLOT.bottom : yScale(hoveredValue),
          text: formatFacetTooltip(kind, hoveredLap),
        };
  const seriesColor = isPace ? "var(--series-1)" : "var(--series-2)";

  return (
    <figure className="result-detail-chart__facet" data-result-facet={kind}>
      <figcaption className="result-detail-chart__facet-caption">
        <strong>{isPace ? "Pace" : "Heart rate"}</strong>
        <span>{isPace ? "min/km · faster ↑" : "avg bpm"}</span>
      </figcaption>
      <div className="result-detail-chart__facet-plot">
        <svg
          {...(isPace
            ? { "data-result-detail-chart": "" }
            : { "data-result-detail-hr-chart": "" })}
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          width="100%"
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          onPointerLeave={() => onHover(null)}
        >
          <title id={titleId}>
            {isPace ? "Per-lap pace" : "Per-lap average heart rate"}
          </title>
          <desc id={descriptionId}>{summary}</desc>
          <g data-result-chart-grid aria-hidden="true">
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PLOT.left - 4}
                  x2={PLOT.left}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="var(--ink)"
                  strokeOpacity="0.4"
                  strokeWidth="1"
                />
                <text
                  data-result-axis-tick
                  x={PLOT.left - 8}
                  y={yScale(tick) + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {formatTick(tick)}
                </text>
              </g>
            ))}
            <line
              data-result-axis-y
              x1={PLOT.left}
              x2={PLOT.left}
              y1={PLOT.top - 4}
              y2={PLOT.bottom}
              stroke="var(--ink)"
              strokeOpacity="0.4"
              strokeWidth="1"
            />
            <line
              data-result-axis-x
              x1={PLOT.left}
              x2={PLOT.right}
              y1={PLOT.bottom}
              y2={PLOT.bottom}
              stroke="var(--ink)"
              strokeOpacity="0.4"
              strokeWidth="1"
            />
            <text
              x={(PLOT.left + PLOT.right) / 2}
              y={VIEWBOX.height - 8}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
            >
              lap
            </text>
          </g>
          {heartRatePath !== "" && (
            <path
              data-result-lap-hr-path
              d={heartRatePath}
              fill="none"
              stroke={seriesColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <g data-result-lap-series>
            {laps.map((lap, index) => {
              const x = xScale(index);
              const column = columnBounds(index);
              const value = readValue(lap);
              const recorded = value !== null;
              const emphasized = linkedIndex === index;
              return (
                <g
                  key={lap.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${formatReadout(lap)}`}
                  data-result-lap-target
                  data-result-lap-id={lap.id}
                  onClick={() => onSelect(index)}
                  onKeyDown={(event) =>
                    handleTargetKeyDown(event, () => onSelect(index))
                  }
                  onPointerEnter={() => onHover({ facet: kind, index })}
                  onFocus={() => onHover({ facet: kind, index })}
                  onBlur={() => onHover(null)}
                >
                  <rect
                    data-result-lap-hit-area
                    x={column.x}
                    y={PLOT.top - 6}
                    width={column.width}
                    height={PLOT.bottom - PLOT.top + 34}
                    fill="var(--paper)"
                    fillOpacity="0.001"
                    stroke="none"
                  />
                  {isPace ? (
                    recorded ? (
                      <path
                        data-result-lap-bar
                        d={roundedTopBarPath(
                          x - barWidth / 2,
                          yScale(value),
                          barWidth,
                          paceBarHeight(value, yScale, PLOT.bottom),
                        )}
                        fill={seriesColor}
                        fillOpacity={emphasized ? 1 : 0.78}
                      />
                    ) : (
                      <line
                        data-result-lap-missing-pace
                        x1={x - 10}
                        x2={x + 10}
                        y1={PLOT.bottom}
                        y2={PLOT.bottom}
                        stroke="var(--line)"
                        strokeWidth="3"
                        strokeDasharray="4 3"
                      />
                    )
                  ) : recorded ? (
                    <circle
                      data-result-lap-hr-dot
                      cx={x}
                      cy={yScale(value)}
                      r={emphasized ? 5.5 : 4.5}
                      fill={seriesColor}
                      stroke="var(--paper)"
                      strokeWidth="2"
                    />
                  ) : (
                    <line
                      data-result-lap-missing-hr
                      x1={x - 10}
                      x2={x + 10}
                      y1={PLOT.bottom}
                      y2={PLOT.bottom}
                      stroke="var(--line)"
                      strokeWidth="3"
                      strokeDasharray="4 3"
                    />
                  )}
                  <text
                    data-result-lap-label
                    x={x}
                    y={PLOT.bottom + 16}
                    fontSize="10"
                    fontWeight={emphasized ? 800 : 400}
                    fill={emphasized ? "var(--ink)" : "var(--muted)"}
                    textAnchor="middle"
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {tooltip && (
          <div
            className="result-detail-chart__tooltip"
            data-result-chart-tooltip
            aria-hidden="true"
            style={{
              left: `clamp(64px, ${(tooltip.x / VIEWBOX.width) * 100}%, calc(100% - 64px))`,
              top: `${(tooltip.y / VIEWBOX.height) * 100}%`,
            }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </figure>
  );
}

export interface ResultDetailChartProps {
  laps: readonly ResultDetailLap[];
}

export function ResultDetailChart({ laps }: ResultDetailChartProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  const coverage = getLapCoverage(laps);

  if (laps.length === 0) {
    return (
      <div className="result-detail-chart" data-result-detail-chart-empty>
        <p className="result-detail-chart__empty">No lap data recorded</p>
      </div>
    );
  }

  if (coverage.pace.observed === 0) {
    return (
      <div className="result-detail-chart" data-result-detail-chart-empty>
        <p className="result-detail-chart__empty">No lap pace recorded</p>
      </div>
    );
  }

  const paceScale = createPaceScale(laps, [PLOT.top, PLOT.bottom]);
  const heartRateScale = createHeartRateScale(laps, [PLOT.bottom, PLOT.top]);
  const xScale = createLapXScale(laps.length, [
    PLOT.left + X_INSET,
    PLOT.right - X_INSET,
  ]);
  const summary = summarizeLaps(laps);
  const selectedLap = laps[selectedIndex] ?? laps[0];

  return (
    <div className="result-detail-chart">
      <div
        className="result-detail-chart__readout"
        data-result-chart-readout
        aria-live="polite"
      >
        {formatReadout(selectedLap)}
      </div>
      <p className="result-detail-chart__summary" data-result-chart-summary>
        {summary}
      </p>
      <div className="result-detail-chart__facets">
        <LapFacet
          kind="pace"
          laps={laps}
          xScale={xScale}
          yScale={paceScale}
          summary={summary}
          hover={hover}
          onHover={setHover}
          onSelect={setSelectedIndex}
        />
        {coverage.heartRate.observed > 0 ? (
          <LapFacet
            kind="heartRate"
            laps={laps}
            xScale={xScale}
            yScale={heartRateScale}
            summary={summary}
            hover={hover}
            onHover={setHover}
            onSelect={setSelectedIndex}
          />
        ) : (
          <div
            className="result-detail-chart__facet result-detail-chart__facet--empty"
            data-result-facet="heartRate"
          >
            <p>No lap heart rate recorded</p>
          </div>
        )}
      </div>
      <div className="result-detail-chart__coverage" data-result-chart-coverage>
        <span>
          {formatCoverage(
            coverage.pace.observed,
            coverage.pace.expected,
            "pace",
          )}
        </span>
        <span>
          {coverage.heartRate.observed === 0
            ? "No lap heart rate recorded"
            : formatCoverage(
                coverage.heartRate.observed,
                coverage.heartRate.expected,
                "average HR",
              )}
        </span>
      </div>
    </div>
  );
}
