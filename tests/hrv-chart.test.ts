// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HrvChart } from "../src/ui/charts/HrvChart";
import type { ChartAnnotation, ChartPoint } from "../src/ui/charts/chartTypes";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const points: ChartPoint[] = [
  { date: "2026-08-24", value: null },
  { date: "2026-08-25", value: 54 },
  { date: "2026-08-26", value: 55 },
  { date: "2026-08-27", value: null },
];

let container: HTMLDivElement;
let root: Root;

function renderChart(
  chartPoints: readonly ChartPoint[] = points,
  annotations: readonly ChartAnnotation[] = [],
  onViewAdaptation = vi.fn(),
  average?: number | null,
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(HrvChart, {
        points: chartPoints,
        annotations,
        onViewAdaptation,
        average,
      }),
    );
  });
  return onViewAdaptation;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("HRV chart render states", () => {
  it("omits phase markers while preserving adaptation and race annotations", () => {
    const annotations: ChartAnnotation[] = [
      { kind: "phase", date: "2026-08-25", label: "Base phase" },
      {
        kind: "adaptation",
        date: "2026-08-26",
        label: "Reduce load",
        adaptationId: "adaptation:one",
      },
      { kind: "race", date: "2026-08-26", label: "Target race" },
      { kind: "race", date: "2026-09-01", label: "Outside range" },
    ];

    renderChart(points, annotations);

    expect(
      container.querySelectorAll('[data-chart-annotation-kind="phase"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-chart-annotation-kind="adaptation"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-chart-annotation-kind="race"]'),
    ).toHaveLength(1);
    expect(container.textContent).not.toContain("Base phase");
    expect(container.textContent).toContain("Reduce load");
    expect(container.textContent).toContain("Target race");
    expect(container.textContent).not.toContain("Outside range");
  });

  it("selects an approved adaptation into the fixed readout and sends its identity to the consumer", () => {
    const onViewAdaptation = renderChart(points, [
      {
        kind: "adaptation",
        date: "2026-08-26",
        label: "Reduce load",
        adaptationId: "adaptation:one",
      },
    ]);

    const marker = container.querySelector<SVGGElement>(
      '[data-chart-annotation-kind="adaptation"]',
    );
    expect(marker).not.toBeNull();
    act(() =>
      marker!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(
      container.querySelector('[data-chart-readout="hrv"]')?.textContent,
    ).toContain("26 Aug · Approved adaptation: Reduce load");
    const viewAdaptation = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "View adaptation");
    expect(viewAdaptation).not.toBeUndefined();
    act(() => viewAdaptation!.click());
    expect(onViewAdaptation).toHaveBeenCalledWith("adaptation:one");
  });

  it("renders an honest empty state for empty or all-missing inputs", () => {
    renderChart([]);
    expect(container.textContent).toContain("No recorded nights in this range");
    expect(container.querySelector("svg")).toBeNull();

    act(() => {
      root.render(
        createElement(HrvChart, {
          points: [{ date: "2026-08-26", value: null }],
          annotations: [],
          onViewAdaptation: vi.fn(),
        }),
      );
    });
    expect(container.textContent).toContain("No recorded nights in this range");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("keeps a single observed input finite and shows a point without requiring a line", () => {
    renderChart([{ date: "2026-08-26", value: 55 }]);

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll("[data-chart-point]")).toHaveLength(1);
    expect(container.querySelector('[data-series="hrv"]')).toBeNull();
    expect(container.textContent).toContain("1 of 1 nights recorded");
  });

  it("does not render phase guide lines or labels", () => {
    renderChart(points, [
      { kind: "phase", date: "2026-08-25", label: "Base phase" },
    ]);

    expect(
      container.querySelector('[data-chart-annotation-kind="phase"]'),
    ).toBeNull();
    expect(container.querySelector("[data-chart-phase-label]")).toBeNull();
  });

  it("does not ring selected points", () => {
    renderChart([{ date: "2026-08-26", value: 55 }]);

    expect(container.querySelector("[data-chart-point-selection]")).toBeNull();

    act(() => {
      root.render(
        createElement(HrvChart, {
          points: [
            { date: "2026-08-25", value: 54 },
            { date: "2026-08-26", value: 55 },
          ],
        }),
      );
    });
    const olderPoint = container.querySelector<SVGGElement>(
      '[aria-label="Inspect HRV for 25 August, 54 ms"]',
    );
    act(() =>
      olderPoint?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(container.querySelector("[data-chart-point-selection]")).toBeNull();
  });

  it("uses the supplied trailing average without a direction summary", () => {
    renderChart(
      [
        { date: "2026-08-25", value: 1 },
        { date: "2026-08-26", value: 55 },
      ],
      [],
      vi.fn(),
      50,
    );

    expect(
      container.querySelector(".chart-card__average")?.textContent,
    ).toContain("7-night avg 50 ms");
    expect(container.querySelector(".chart-card__trend")).toBeNull();
  });

  it("surfaces an explicitly unavailable personal baseline", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        createElement(HrvChart, {
          points: [
            { date: "2026-08-25", value: 54 },
            { date: "2026-08-26", value: 55 },
          ],
          annotations: [],
          average: 54,
          baseline: null,
        }),
      );
    });

    const averageText =
      container.querySelector(".chart-card__average")?.textContent ?? "";
    expect(averageText).toContain("28d baseline —");
    expect(averageText).not.toContain("recorded days");
    expect(container.querySelector(".chart-card__trend")).toBeNull();
  });
});
