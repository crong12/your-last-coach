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
