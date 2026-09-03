import type { KeyboardEvent } from "react";
import type { ScaleTime } from "d3-scale";

import { parseChartDate } from "./chartMath";
import type { ChartPlotBounds, ChartPoint } from "./chartTypes";

export interface ChartHitColumnsProps {
  points: readonly ChartPoint[];
  xScale: ScaleTime<number, number>;
  plotBounds: ChartPlotBounds;
  selectedDate?: string | null;
  /** Extra data attribute (e.g. "data-sleep-night") kept for e2e contracts. */
  dataAttribute?: string;
  label: (point: ChartPoint, index: number) => string;
  onActivate: (index: number) => void;
  onHover?: (index: number | null) => void;
}

/**
 * Full-height invisible column bands that partition the plot so every pointer
 * position resolves to the nearest point — the interaction surface ported from
 * the workout detail chart. Visible marks should render pointer-events: none
 * and let these bands own tap, keyboard, and hover.
 */
export function ChartHitColumns({
  points,
  xScale,
  plotBounds,
  selectedDate = null,
  dataAttribute,
  label,
  onActivate,
  onHover,
}: ChartHitColumnsProps) {
  const positioned = points
    .map((point, index) => {
      const parsed = parseChartDate(point.date);
      return parsed === null ? null : { point, index, x: xScale(parsed) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.x - b.x);
  if (positioned.length === 0) return null;

  const boundaries = positioned.map(({ x }, order) => {
    const previous = positioned[order - 1];
    const next = positioned[order + 1];
    return {
      start: previous ? (previous.x + x) / 2 : plotBounds.left,
      end: next ? (next.x + x) / 2 : plotBounds.right,
    };
  });

  return (
    <g data-chart-hit-columns>
      {positioned.map(({ point, index, x }, order) => {
        const { start, end } = boundaries[order];
        const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onActivate(index);
        };
        return (
          <g
            key={point.date}
            role="button"
            tabIndex={0}
            aria-label={label(point, index)}
            data-chart-point
            data-chart-date={point.date}
            {...(dataAttribute ? { [dataAttribute]: "true" } : {})}
            data-chart-column-x={Math.round(x)}
            data-selected={point.date === selectedDate ? "true" : undefined}
            data-missing={point.value === null ? "true" : undefined}
            onClick={() => onActivate(index)}
            onKeyDown={handleKeyDown}
            onPointerEnter={() => onHover?.(index)}
            onPointerLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(index)}
            onBlur={() => onHover?.(null)}
          >
            <rect
              data-chart-hit-area
              x={start}
              y={plotBounds.top - 12}
              width={Math.max(end - start, 1)}
              height={plotBounds.bottom - plotBounds.top + 24}
              fill="var(--paper)"
              fillOpacity="0.001"
              pointerEvents="all"
            />
          </g>
        );
      })}
    </g>
  );
}
