export interface SleepStageRatios {
  deepRatio?: number | null;
  lightRatio?: number | null;
  remRatio?: number | null;
  awakeRatio?: number | null;
}

export interface SleepStageSegment {
  key: "deep" | "light" | "rem" | "awake";
  share: number;
}

const STAGE_KEYS = [
  ["deep", "deepRatio"],
  ["light", "lightRatio"],
  ["rem", "remRatio"],
  ["awake", "awakeRatio"],
] as const;

/**
 * Turn a night's stage ratios into normalized bar segments.
 *
 * Data honesty: segments are only produced when the record supplies the
 * complete stage set and the ratios plausibly account for the whole night
 * (sum within 0.9–1.1). Partial sets return null — normalizing over only the
 * supplied stages would silently inflate the known stages to cover the
 * unknown remainder. Callers should fall back to an unsegmented bar.
 */
export function sleepStageSegments(
  stages: SleepStageRatios | undefined,
): readonly SleepStageSegment[] | null {
  if (!stages) return null;
  const values: { key: SleepStageSegment["key"]; ratio: number }[] = [];
  for (const [key, field] of STAGE_KEYS) {
    const ratio = stages[field];
    if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) {
      return null;
    }
    values.push({ key, ratio });
  }
  const total = values.reduce((sum, { ratio }) => sum + ratio, 0);
  if (total < 0.9 || total > 1.1) return null;
  return values
    .filter(({ ratio }) => ratio > 0)
    .map(({ key, ratio }) => ({ key, share: ratio / total }));
}
