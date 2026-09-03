export interface ChartPoint {
  date: string;
  value: number | null;
}

export interface PhaseAnnotation {
  kind: "phase";
  date: string;
  label: string;
}

export interface AdaptationAnnotation {
  kind: "adaptation";
  date: string;
  label: string;
  adaptationId: string;
}

export interface RaceAnnotation {
  kind: "race";
  date: string;
  label: string;
}

export type ChartAnnotation =
  PhaseAnnotation | AdaptationAnnotation | RaceAnnotation;

export type ChartRange = readonly [number, number];

export interface ChartViewBox {
  width: number;
  height: number;
}

export interface ChartPlotBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Tooltip anchored in viewBox coordinates; rendered as an HTML overlay. */
export interface ChartTooltip {
  x: number;
  y: number;
  text: string;
}

export function chartPlotBounds(viewBox: ChartViewBox): ChartPlotBounds {
  return {
    left: 60,
    right: viewBox.width - 60,
    top: 28,
    bottom: viewBox.height - 48,
  };
}

export const CHART_VIEWBOX = {
  width: 720,
  height: 280,
} as const;

export const CHART_PLOT = {
  left: 60,
  right: 660,
  top: 28,
  bottom: 232,
} as const;
