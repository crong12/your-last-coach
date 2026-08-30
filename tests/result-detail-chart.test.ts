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
    expect(container.textContent).toContain("3 of 4 laps with pace");
    expect(container.textContent).toContain("3 of 4 laps with average HR");
    expect(container.querySelector("svg desc")?.textContent).toContain(
      "4 laps",
    );
  });

  it("keeps every lap inspectable with 44px targets and updates one fixed readout by keyboard", () => {
    renderChart();

    const targets = container.querySelectorAll<SVGGElement>(
      "[data-result-lap-target]",
    );
    expect(targets).toHaveLength(4);
    expect(
      targets[0]
        .querySelector("[data-result-lap-hit-area]")
        ?.getAttribute("width"),
    ).toBe("44");
    expect(
      targets[0]
        .querySelector("[data-result-lap-hit-area]")
        ?.getAttribute("height"),
    ).toBe("44");

    act(() =>
      targets[3].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(
      container.querySelector("[data-result-chart-readout]")?.textContent,
    ).toContain("Lap 4");
    expect(
      container.querySelector("[data-result-chart-readout]")?.textContent,
    ).toContain("No max HR recorded");
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
