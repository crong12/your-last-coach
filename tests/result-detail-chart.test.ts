// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ResultDetailChart } from "../src/ui/charts/ResultDetailChart";
import type { ResultDetailLap } from "../src/ui/charts/resultDetailMath";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const laps: ResultDetailLap[] = [
  {
    id: "lap-1",
    label: "Lap 1",
    distanceKm: 2,
    paceSecondsPerKm: 360,
    averageHeartRateBpm: 130,
    maximumHeartRateBpm: null,
  },
  {
    id: "lap-2",
    label: "Lap 2",
    distanceKm: 2,
    paceSecondsPerKm: 286,
    averageHeartRateBpm: 152,
    maximumHeartRateBpm: null,
  },
  {
    id: "lap-3",
    label: "Lap 3",
    distanceKm: 2,
    paceSecondsPerKm: null,
    averageHeartRateBpm: null,
    maximumHeartRateBpm: null,
  },
  {
    id: "lap-4",
    label: "Lap 4",
    distanceKm: 2,
    paceSecondsPerKm: 278,
    averageHeartRateBpm: 164,
    maximumHeartRateBpm: null,
  },
];

let container: HTMLDivElement;
let root: Root;

function renderChart(chartLaps: readonly ResultDetailLap[] = laps) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(ResultDetailChart, { laps: chartLaps }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("Workout Result lap chart", () => {
  it("renders recorded pace bars, missing pace baseline, broken HR path, and coverage", () => {
    renderChart();

    expect(
      container.querySelector("svg[data-result-detail-chart]"),
    ).not.toBeNull();
    expect(container.querySelectorAll("[data-result-lap-bar]")).toHaveLength(3);
    expect(
      container.querySelectorAll("[data-result-lap-missing-pace]"),
    ).toHaveLength(1);
    expect(container.querySelector("[data-result-lap-hr-path]")).not.toBeNull();
    expect(container.querySelectorAll("[data-result-facet]")).toHaveLength(2);
    expect(
      container.querySelector("svg[data-result-detail-hr-chart]"),
    ).not.toBeNull();
    expect(container.querySelectorAll("[data-result-lap-hr-dot]")).toHaveLength(
      3,
    );
    expect(
      container.querySelectorAll("[data-result-lap-missing-hr]"),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '[data-result-facet="pace"] [data-result-axis-tick]',
      ).length,
    ).toBeGreaterThan(2);
    expect(
      container.querySelectorAll(
        '[data-result-facet="heartRate"] [data-result-axis-tick]',
      ).length,
    ).toBeGreaterThan(2);
    expect(container.textContent).toContain("3 of 4 laps with pace");
    expect(container.textContent).toContain("3 of 4 laps with average HR");
    expect(container.querySelector("svg desc")?.textContent).toContain(
      "4 laps",
    );
  });

  it("keeps every lap inspectable with 44px targets and updates one fixed readout by keyboard", () => {
    renderChart();

    const paceTargets = container.querySelectorAll<SVGGElement>(
      '[data-result-facet="pace"] [data-result-lap-target]',
    );
    const heartRateTargets = container.querySelectorAll<SVGGElement>(
      '[data-result-facet="heartRate"] [data-result-lap-target]',
    );
    expect(paceTargets).toHaveLength(4);
    expect(heartRateTargets).toHaveLength(4);
    const hitArea = paceTargets[0].querySelector("[data-result-lap-hit-area]");
    expect(Number(hitArea?.getAttribute("width"))).toBeGreaterThanOrEqual(44);
    expect(Number(hitArea?.getAttribute("height"))).toBeGreaterThanOrEqual(44);

    act(() =>
      paceTargets[3].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(
      container.querySelector("[data-result-chart-readout]")?.textContent,
    ).toContain("Lap 4");
    expect(
      container.querySelector("[data-result-chart-readout]")?.textContent,
    ).toContain("No max HR recorded");

    act(() =>
      heartRateTargets[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(
      container.querySelector("[data-result-chart-readout]")?.textContent,
    ).toContain("Lap 2");
  });

  it("shows a facet tooltip on focus and hides it on blur", () => {
    renderChart();

    expect(container.querySelector("[data-result-chart-tooltip]")).toBeNull();

    const heartRateTargets = container.querySelectorAll<SVGGElement>(
      '[data-result-facet="heartRate"] [data-result-lap-target]',
    );
    act(() =>
      heartRateTargets[3].dispatchEvent(
        new FocusEvent("focusin", { bubbles: true }),
      ),
    );
    const tooltips = container.querySelectorAll("[data-result-chart-tooltip]");
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0].textContent).toBe("Lap 4 · avg 164 bpm");

    act(() =>
      heartRateTargets[3].dispatchEvent(
        new FocusEvent("focusout", { bubbles: true }),
      ),
    );
    expect(container.querySelector("[data-result-chart-tooltip]")).toBeNull();
  });

  it("keeps dense lap hit regions non-overlapping so each column selects its own lap", () => {
    const denseLaps: ResultDetailLap[] = Array.from(
      { length: 11 },
      (_, index) => ({
        id: `lap-${index + 1}`,
        label: `Lap ${index + 1}`,
        distanceKm: 1,
        paceSecondsPerKm: 280 + index * 4,
        averageHeartRateBpm: 150 + index,
        maximumHeartRateBpm: 160 + index,
      }),
    );
    renderChart(denseLaps);

    const hitAreas = Array.from(
      container.querySelectorAll(
        '[data-result-facet="pace"] [data-result-lap-hit-area]',
      ),
    ).map((area) => ({
      x: Number(area.getAttribute("x")),
      width: Number(area.getAttribute("width")),
    }));
    expect(hitAreas).toHaveLength(11);
    for (const area of hitAreas) {
      expect(area.width).toBeGreaterThan(0);
    }
    const sorted = [...hitAreas].sort((a, b) => a.x - b.x);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index - 1].x + sorted[index - 1].width).toBeLessThanOrEqual(
        sorted[index].x + 0.001,
      );
    }
  });

  it("renders an honest heart-rate facet placeholder when no lap HR exists", () => {
    renderChart([
      {
        id: "lap-1",
        label: "Lap 1",
        distanceKm: 2,
        paceSecondsPerKm: 300,
        averageHeartRateBpm: null,
        maximumHeartRateBpm: null,
      },
    ]);

    expect(
      container.querySelector("svg[data-result-detail-hr-chart]"),
    ).toBeNull();
    expect(
      container.querySelector('[data-result-facet="heartRate"]')?.textContent,
    ).toContain("No lap heart rate recorded");
  });

  it("uses an exact missing max-HR segment and keeps recorded max HR explicit", () => {
    renderChart([
      laps[0],
      {
        ...laps[1],
        maximumHeartRateBpm: 180,
      },
    ]);

    expect(
      container.querySelector("[data-result-chart-readout]")?.textContent,
    ).toBe("Lap 1 · 2 km · 6:00/km · Avg HR 130 bpm · No max HR recorded");

    act(() =>
      container
        .querySelectorAll<SVGGElement>("[data-result-lap-target]")[1]
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(
      container.querySelector("[data-result-chart-readout]")?.textContent,
    ).toBe("Lap 2 · 2 km · 4:46/km · Avg HR 152 bpm · Max HR 180 bpm");
  });

  it("reports honest no-lap state without an SVG", () => {
    renderChart([]);

    expect(container.textContent).toContain("No lap data recorded");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-result-chart-readout]")).toBeNull();
  });

  it("omits the plot when laps contain no recorded pace", () => {
    renderChart([
      {
        id: "lap-without-pace",
        label: "Lap 1",
        distanceKm: 2,
        paceSecondsPerKm: null,
        averageHeartRateBpm: 140,
        maximumHeartRateBpm: null,
      },
    ]);

    expect(container.textContent).toContain("No lap pace recorded");
    expect(container.querySelector("svg[data-result-detail-chart]")).toBeNull();
    expect(container.querySelector("[data-result-chart-readout]")).toBeNull();
  });
});
