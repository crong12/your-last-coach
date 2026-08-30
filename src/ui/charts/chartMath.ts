import { scaleLinear, scaleUtc } from "d3-scale";
import type { ScaleLinear, ScaleTime } from "d3-scale";
import { curveLinear, line } from "d3-shape";

import type { ChartPoint } from "./chartTypes";

export function parseChartDate(value: string): Date | null {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function createTimeScale(
  dates: readonly string[],
  range: readonly [number, number],
): ScaleTime<number, number> {
  const parsedDates = dates
    .map(parseChartDate)
    .filter((date): date is Date => date !== null);
  const fallback = new Date("1970-01-01T12:00:00.000Z");
  let start = parsedDates[0] ?? fallback;
  let end = parsedDates.at(-1) ?? fallback;

  if (start.getTime() > end.getTime()) [start, end] = [end, start];
  if (start.getTime() === end.getTime()) {
    const day = 24 * 60 * 60 * 1000;
    start = new Date(start.getTime() - day);
    end = new Date(end.getTime() + day);
  }

  return scaleUtc<number, number>().domain([start, end]).range(range);
}

function finiteValues(values: readonly (number | null)[]): number[] {
  return values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
}

function boundedSum(value: number, delta: number): number {
  const result = value + delta;
  if (Number.isFinite(result)) return result;
  return delta < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
}

export function createLinearScale(
  values: readonly (number | null)[],
  range: readonly [number, number],
): ScaleLinear<number, number> {
  const finite = finiteValues(values);
  if (finite.length === 0) {
    return scaleLinear<number, number>().domain([0, 1]).range(range);
  }

  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  const uniqueValues = new Set(finite);
  const span = maximum - minimum;
  const rawPadding =
    uniqueValues.size === 1
      ? Math.max(Math.abs(minimum) * 0.05, 1)
      : span * 0.05;
  const padding = Number.isFinite(rawPadding)
    ? rawPadding
    : Number.MAX_VALUE * 0.05;
  const lower = boundedSum(minimum, -padding);
  const upper = boundedSum(maximum, padding);

  return scaleLinear<number, number>()
    .domain([lower, upper])
    .nice(3)
    .range(range);
}

export function createLinePath(
  points: readonly ChartPoint[],
  xScale: ScaleTime<number, number>,
  yScale: ScaleLinear<number, number>,
): string {
  const path = line<ChartPoint>()
    .defined(({ date, value }) => {
      const parsedDate = parseChartDate(date);
      return (
        parsedDate !== null &&
        value !== null &&
        Number.isFinite(value) &&
        Number.isFinite(xScale(parsedDate)) &&
        Number.isFinite(yScale(value))
      );
    })
    .x(({ date }) => xScale(parseChartDate(date) ?? new Date(0)))
    .y(({ value }) => yScale(value ?? 0))
    .curve(curveLinear);

  return path(points) ?? "";
}

export function getCoverage(points: readonly ChartPoint[]): {
  observed: number;
  expected: number;
} {
  return {
    observed: points.filter(
      ({ value }) => value !== null && Number.isFinite(value),
    ).length,
    expected: points.length,
  };
}
