import { describe, expect, it } from "vitest";

import { sleepStageSegments } from "../src/ui/charts/sleepStages";

describe("sleep stage segments", () => {
  it("normalizes a complete stage set into ordered shares", () => {
    const segments = sleepStageSegments({
      deepRatio: 0.16,
      lightRatio: 0.54,
      remRatio: 0.27,
      awakeRatio: 0.03,
    });

    expect(segments?.map(({ key }) => key)).toEqual([
      "deep",
      "light",
      "rem",
      "awake",
    ]);
    expect(
      segments?.reduce((total, { share }) => total + share, 0),
    ).toBeCloseTo(1);
    expect(segments?.[0].share).toBeCloseTo(0.16, 2);
  });

  it("refuses partial stage sets instead of inflating the known stages", () => {
    // Only deep supplied: normalizing would fabricate deep as 100% of the bar.
    expect(sleepStageSegments({ deepRatio: 0.2 })).toBeNull();
    expect(
      sleepStageSegments({ deepRatio: 0.2, lightRatio: 0.5, remRatio: 0.27 }),
    ).toBeNull();
    expect(sleepStageSegments(undefined)).toBeNull();
    expect(sleepStageSegments({})).toBeNull();
  });

  it("refuses stage sets that do not plausibly sum to a whole night", () => {
    expect(
      sleepStageSegments({
        deepRatio: 0.1,
        lightRatio: 0.1,
        remRatio: 0.05,
        awakeRatio: 0.01,
      }),
    ).toBeNull();
    expect(
      sleepStageSegments({
        deepRatio: 0.6,
        lightRatio: 0.6,
        remRatio: 0.4,
        awakeRatio: 0.1,
      }),
    ).toBeNull();
  });

  it("tolerates a legitimate zero-awake night", () => {
    const segments = sleepStageSegments({
      deepRatio: 0.2,
      lightRatio: 0.55,
      remRatio: 0.25,
      awakeRatio: 0,
    });

    expect(segments).not.toBeNull();
    expect(segments?.map(({ key }) => key)).toEqual(["deep", "light", "rem"]);
  });
});
