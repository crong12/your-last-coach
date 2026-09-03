import { describe, expect, it } from "vitest";

import {
  formatDistanceKm,
  formatDurationSeconds,
  formatMinutesClock,
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

  it("formats minutes as an h:mm clock for sleep durations", () => {
    expect(formatMinutesClock(440)).toBe("7:20");
    expect(formatMinutesClock(480)).toBe("8:00");
    expect(formatMinutesClock(59.6)).toBe("1:00");
    expect(formatMinutesClock(0)).toBe("0:00");
  });
});
