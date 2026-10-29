import { describe, expect, it } from "vitest";

import { ago } from "./health";

describe("ago", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const minutesBefore = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it("says just now for the last minute, not now ago", () => {
    expect(ago(minutesBefore(0.5), now)).toBe("just now");
  });

  it("counts back in the same units as timeAgo", () => {
    expect(ago(minutesBefore(7), now)).toBe("7m ago");
    expect(ago(minutesBefore(3 * 60), now)).toBe("3h ago");
  });
});
