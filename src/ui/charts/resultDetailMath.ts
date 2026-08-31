import { scaleLinear } from "d3-scale";
import type { ScaleLinear } from "d3-scale";
import { curveLinear, line } from "d3-shape";

import type { WorkoutLap } from "../../domain/types";
import { formatPaceSeconds } from "../metricFormatters";

export interface ResultDetailLap {
  id: string;
  label: string;
  distanceKm: number;
  paceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
  maximumHeartRateBpm: number | null;
}

export type LapScale = (index: number) => number;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function recordedValues(
  laps: readonly ResultDetailLap[],
  read: (lap: ResultDetailLap) => number | null,
) {
  return laps.map(read).filter(finite);
}

function paddedDomain(values: readonly number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum;
  const padding = Math.max(span * 0.05, 1);
  return [minimum - padding, maximum + padding];
}

/** Maps lower (faster) pace values nearer the top of the plot. */
export function createPaceScale(
  laps: readonly ResultDetailLap[],
  range: readonly [number, number],
): ScaleLinear<number, number> {
  return scaleLinear<number, number>()
    .domain(
      paddedDomain(
        recordedValues(laps, ({ paceSecondsPerKm }) => paceSecondsPerKm),
      ),
    )
    .nice(3)
    .range(range);
}

export function createHeartRateScale(
  laps: readonly ResultDetailLap[],
  range: readonly [number, number],
): ScaleLinear<number, number> {
  return scaleLinear<number, number>()
    .domain(
      paddedDomain(
        recordedValues(laps, ({ averageHeartRateBpm }) => averageHeartRateBpm),
      ),
    )
    .nice(3)
    .range(range);
}

export function createLapXScale(
  count: number,
  range: readonly [number, number],
): LapScale {
  const [start, end] = range;
  if (count <= 1) return () => (start + end) / 2;
  return (index) => start + ((end - start) * index) / (count - 1);
}

export function paceBarHeight(
  paceSecondsPerKm: number,
  paceScale: ScaleLinear<number, number>,
  baseline: number,
): number {
  return Math.max(0, baseline - paceScale(paceSecondsPerKm));
}

export function createHeartRatePath(
  laps: readonly ResultDetailLap[],
  xScale: LapScale,
  heartRateScale: ScaleLinear<number, number>,
): string {
  const path = line<ResultDetailLap>()
    .defined(({ averageHeartRateBpm }) => finite(averageHeartRateBpm))
    .x((_lap, index) => xScale(index))
    .y(({ averageHeartRateBpm }) => heartRateScale(averageHeartRateBpm ?? 0))
    .curve(curveLinear);
  return path(laps) ?? "";
}

export function getLapCoverage(laps: readonly ResultDetailLap[]) {
  return {
    pace: {
      observed: laps.filter(({ paceSecondsPerKm }) => finite(paceSecondsPerKm))
        .length,
      expected: laps.length,
    },
    heartRate: {
      observed: laps.filter(({ averageHeartRateBpm }) =>
        finite(averageHeartRateBpm),
      ).length,
      expected: laps.length,
    },
    maximumHeartRate: {
      observed: laps.filter(({ maximumHeartRateBpm }) =>
        finite(maximumHeartRateBpm),
      ).length,
      expected: laps.length,
    },
  };
}

export function summarizeLaps(laps: readonly ResultDetailLap[]): string {
  if (laps.length === 0) return "No lap data recorded.";
  const coverage = getLapCoverage(laps);
  const paceValues = recordedValues(
    laps,
    ({ paceSecondsPerKm }) => paceSecondsPerKm,
  );
  const heartRateValues = recordedValues(
    laps,
    ({ averageHeartRateBpm }) => averageHeartRateBpm,
  );
  const paceSummary =
    paceValues.length === 0
      ? "no recorded pace"
      : `${coverage.pace.observed} of ${coverage.pace.expected} with pace, fastest ${formatPaceSeconds(Math.min(...paceValues))}/km, slowest ${formatPaceSeconds(Math.max(...paceValues))}/km`;
  const heartRateSummary =
    heartRateValues.length === 0
      ? `no recorded average heart rate`
      : `${coverage.heartRate.observed} of ${coverage.heartRate.expected} with average heart rate from ${Math.min(...heartRateValues)}–${Math.max(...heartRateValues)} bpm`;
  return `${laps.length} laps, ${paceSummary}, ${heartRateSummary}.`;
}

export function normalizeResultLaps(
  laps: readonly WorkoutLap[],
): ResultDetailLap[] {
  return laps.map((lap, index) => ({
    id: lap.id,
    label: `Lap ${index + 1}`,
    distanceKm: lap.distanceKm,
    paceSecondsPerKm: finite(lap.paceSecondsPerKm)
      ? lap.paceSecondsPerKm
      : null,
    averageHeartRateBpm: finite(lap.averageHeartRateBpm)
      ? lap.averageHeartRateBpm
      : null,
    maximumHeartRateBpm: null,
  }));
}
