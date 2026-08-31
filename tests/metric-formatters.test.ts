import { describe, expect, it } from "vitest";

import {
  formatDistanceKm,
  formatDurationSeconds,
  formatHeartRateBpm,
  formatPacePerKm,
  formatPaceSeconds,
} from "../src/ui/metricFormatters";

describe("metric formatters", () => {
  it("uses the same units and rounding across workout views", () => {
    expect(formatDistanceKm(7.5)).toBe("7.5 km");
    expect(formatDurationSeconds(2_747)).toBe("45:47");
    expect(formatPaceSeconds(366.27)).toBe("6:06");
    expect(formatPacePerKm(366.27)).toBe("6:06/km");
    expect(formatHeartRateBpm(169)).toBe("169 bpm");
  });
});
