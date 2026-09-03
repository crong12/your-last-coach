import { describe, expect, it } from "vitest";

import {
  createLinePath,
  createLinearScale,
  createTimeScale,
  getCoverage,
  weeklyTickDates,
} from "../src/ui/charts/chartMath";
import type { ChartPoint } from "../src/ui/charts/chartTypes";

const dates = [
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
] as const;

function point(date: string, value: number | null): ChartPoint {
  return { date, value };
}

describe("chart math", () => {
  it("keeps a multi-value linear domain bounded around finite observations", () => {
    const scale = createLinearScale([96, 105, 107], [120, 0]);

    expect(scale.domain()).toEqual([95, 110]);
    expect(scale(96)).toBeGreaterThan(0);
    expect(scale(107)).toBeLessThan(120);
  });

  it("uses a finite fallback domain when every value is missing", () => {
    const scale = createLinearScale(
      [null, Number.NaN, Number.POSITIVE_INFINITY],
      [120, 0],
    );

    expect(scale.domain()).toEqual([0, 1]);
    expect(Number.isFinite(scale(0.5))).toBe(true);
  });

  it("pads a single observed value so its plotted coordinate is finite", () => {
    const scale = createLinearScale([100, null], [120, 0]);

    expect(scale.domain()).toEqual([95, 105]);
    expect(Number.isFinite(scale(100))).toBe(true);
  });

  it("expands an empty or one-date time domain by one day on each side", () => {
    const emptyScale = createTimeScale([], [0, 100]);
    const oneDateScale = createTimeScale(["2026-08-26"], [0, 100]);

    expect(Number.isFinite(emptyScale(new Date("2026-08-26T12:00:00Z")))).toBe(
      true,
    );
    expect(oneDateScale.domain()).toEqual([
      new Date("2026-08-25T12:00:00Z"),
      new Date("2026-08-27T12:00:00Z"),
    ]);
  });

  it("breaks a line into separate subpaths around missing observations", () => {
    const points = [
      point(dates[0], 96),
      point(dates[1], 98),
      point(dates[2], null),
      point(dates[3], 102),
      point(dates[4], 104),
    ];
    const xScale = createTimeScale(
      points.map(({ date }) => date),
      [0, 720],
    );
    const yScale = createLinearScale(
      points.map(({ value }) => value),
      [180, 20],
    );

    const path = createLinePath(points, xScale, yScale);

    expect(path).toContain("M");
    expect((path.match(/M/g) ?? []).length).toBe(2);
    expect(path).not.toBe("");
  });

  it("returns no path for an all-missing series and counts coverage separately", () => {
    const points = [point(dates[0], null), point(dates[1], null)];
    const xScale = createTimeScale(
      points.map(({ date }) => date),
      [0, 720],
    );
    const yScale = createLinearScale(
      points.map(({ value }) => value),
      [180, 20],
    );

    expect(createLinePath(points, xScale, yScale)).toBe("");
    expect(getCoverage(points)).toEqual({ observed: 0, expected: 2 });
  });

  it("counts finite observations while retaining zero as an observed value", () => {
    const points = [
      point(dates[0], 0),
      point(dates[1], Number.NaN),
      point(dates[2], null),
      point(dates[3], 12),
    ];

    expect(getCoverage(points)).toEqual({ observed: 2, expected: 4 });
  });

  it("picks weekly tick dates plus the final date", () => {
    const windowDates = Array.from({ length: 28 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 6, 30 + index, 12));
      return date.toISOString().slice(0, 10);
    });

    expect(weeklyTickDates(windowDates)).toEqual([
      "2026-07-30",
      "2026-08-06",
      "2026-08-13",
      "2026-08-20",
      "2026-08-26",
    ]);
  });

  it("never duplicates the final date and handles short windows", () => {
    expect(weeklyTickDates(["2026-08-26"])).toEqual(["2026-08-26"]);
    expect(weeklyTickDates([])).toEqual([]);
    const eight = Array.from({ length: 8 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 7, 19 + index, 12));
      return date.toISOString().slice(0, 10);
    });
    expect(weeklyTickDates(eight)).toEqual(["2026-08-19", "2026-08-26"]);
  });
});
