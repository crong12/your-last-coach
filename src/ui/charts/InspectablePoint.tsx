import type { KeyboardEvent } from "react";

export interface InspectablePointProps {
  x: number;
  y: number;
  date: string;
  label: string;
  selected: boolean;
  missing: boolean;
  onActivate: () => void;
}

export function InspectablePoint({
  x,
  y,
  date,
  label,
  selected,
  missing,
  onActivate,
}: InspectablePointProps) {
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onActivate();
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      data-chart-point
      data-chart-date={date}
      transform={`translate(${x} ${y})`}
      pointerEvents="all"
      onClick={onActivate}
      onKeyDown={handleKeyDown}
    >
      <circle
        data-chart-hit-area
        r="54"
        fill="var(--paper)"
        fillOpacity="0.001"
        stroke="none"
        strokeWidth="1"
        pointerEvents="all"
      />
      {selected && (
        <circle
          className="chart-point__selection"
          data-chart-point-selection
          r={missing ? 8 : 7}
          fill="none"
          stroke="var(--track)"
          strokeWidth="2"
        />
      )}
      {!missing && (
        <circle
          className="chart-point__visible"
          data-chart-point-visible
          r="4.5"
          fill="var(--series-1)"
        />
      )}
    </g>
  );
}
