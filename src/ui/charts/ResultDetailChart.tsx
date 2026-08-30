import { useId, useState, type KeyboardEvent } from "react";

import {
  createHeartRatePath,
  createHeartRateScale,
  createLapXScale,
  createPaceScale,
  formatPaceSeconds,
  getLapCoverage,
  paceBarHeight,
  summarizeLaps,
  type ResultDetailLap,
} from "./resultDetailMath";

const VIEWBOX = { width: 300, height: 270 } as const;
const PLOT = { left: 26, right: 274, top: 28, bottom: 214 } as const;

function formatDistance(distanceKm: number) {
  return `${Number.isInteger(distanceKm) ? distanceKm : distanceKm.toFixed(2)} km`;
}

function formatHeartRate(value: number | null) {
  return value === null ? "No HR recorded" : `${value} bpm`;
}

function formatReadout(lap: ResultDetailLap) {
  return `${lap.label} · ${formatDistance(lap.distanceKm)} · ${
    lap.paceSecondsPerKm === null
      ? "No pace recorded"
      : `${formatPaceSeconds(lap.paceSecondsPerKm)}/km`
  } · Avg HR ${formatHeartRate(lap.averageHeartRateBpm)} · Max HR ${
    lap.maximumHeartRateBpm === null
      ? "No max HR recorded"
      : `${lap.maximumHeartRateBpm} bpm`
  }`;
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

export interface ResultDetailChartProps {
  laps: readonly ResultDetailLap[];
}

export function ResultDetailChart({ laps }: ResultDetailChartProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const generatedId = useId().replaceAll(":", "");
  const titleId = `result-detail-chart-${generatedId}-title`;
  const descriptionId = `result-detail-chart-${generatedId}-description`;
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
  const xScale = createLapXScale(laps.length, [PLOT.left, PLOT.right]);
  const heartRatePath = createHeartRatePath(laps, xScale, heartRateScale);
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
      <div className="result-detail-chart__plot">
        <svg
          data-result-detail-chart
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          width="100%"
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <title id={titleId}>Per-lap pace and average heart rate</title>
          <desc id={descriptionId}>{summary}</desc>
          <g data-result-chart-grid aria-hidden="true">
            <line
              x1={PLOT.left}
              x2={PLOT.right}
              y1={PLOT.bottom}
              y2={PLOT.bottom}
              stroke="var(--line)"
              strokeWidth="1"
            />
            {coverage.pace.observed > 0 && (
              <text
                data-result-chart-axis-label
                x={PLOT.left}
                y={PLOT.top - 8}
                fill="var(--muted)"
              >
                pace · faster ↑
              </text>
            )}
          </g>
          {heartRatePath !== "" && (
            <path
              data-result-lap-hr-path
              d={heartRatePath}
              fill="none"
              stroke="var(--series-2)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <g data-result-lap-series>
            {laps.map((lap, index) => {
              const x = xScale(index);
              const pace = lap.paceSecondsPerKm;
              const paceRecorded = pace !== null;
              const paceY = paceRecorded ? paceScale(pace) : PLOT.bottom;
              const barHeight = paceRecorded
                ? paceBarHeight(pace, paceScale, PLOT.bottom)
                : 0;
              const averageHeartRate = lap.averageHeartRateBpm;
              const heartRateRecorded = averageHeartRate !== null;
              const targetLabel = `Inspect ${formatReadout(lap)}`;
              return (
                <g
                  key={lap.id}
                  role="button"
                  tabIndex={0}
                  aria-label={targetLabel}
                  data-result-lap-target
                  data-result-lap-id={lap.id}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) =>
                    handleTargetKeyDown(event, () => setSelectedIndex(index))
                  }
                >
                  <rect
                    data-result-lap-hit-area
                    x={x - 22}
                    y={PLOT.bottom - 22}
                    width="44"
                    height="44"
                    fill="var(--paper)"
                    fillOpacity="0.001"
                    stroke="none"
                  />
                  {paceRecorded ? (
                    <rect
                      data-result-lap-bar
                      x={x - 12}
                      y={paceY}
                      width="24"
                      height={barHeight}
                      rx="4"
                      fill="var(--series-1)"
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
                  )}
                  {heartRateRecorded && (
                    <circle
                      data-result-lap-hr-dot
                      cx={x}
                      cy={heartRateScale(averageHeartRate)}
                      r="5"
                      fill="var(--series-2)"
                      stroke="var(--paper)"
                      strokeWidth="2"
                    />
                  )}
                  <text
                    data-result-lap-label
                    x={x}
                    y={VIEWBOX.height - 25}
                    fill="var(--muted)"
                    textAnchor="middle"
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
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
