import { describe, expect, it } from "vitest";

import type { LogLine } from "../project/service";
import { mergeLogLines } from "./logs";

const line = (timestamp: string, message: string): LogLine => ({
  timestamp,
  message,
  severity: "info",
});

describe("mergeLogLines", () => {
  it("appends new lines in time order", () => {
    const current = [line("2026-10-22T10:00:00Z", "a"), line("2026-10-22T10:00:02Z", "c")];
    const merged = mergeLogLines(current, [line("2026-10-22T10:00:01Z", "b")]);
    expect(merged.map((l) => l.message)).toEqual(["a", "b", "c"]);
  });

  it("skips lines Railway resends on subscribe", () => {
    const current = [line("2026-10-22T10:00:00Z", "a")];
    const merged = mergeLogLines(current, [
      line("2026-10-22T10:00:00Z", "a"),
      line("2026-10-22T10:00:01Z", "b"),
    ]);
    expect(merged.map((l) => l.message)).toEqual(["a", "b"]);
  });

  it("keeps lines with the same time but different text", () => {
    const current = [line("2026-10-22T10:00:00Z", "a")];
    const merged = mergeLogLines(current, [line("2026-10-22T10:00:00Z", "b")]);
    expect(merged).toHaveLength(2);
  });

  it("returns the same array when nothing is new, so the cache doesn't re-render", () => {
    const current = [line("2026-10-22T10:00:00Z", "a")];
    expect(mergeLogLines(current, [line("2026-10-22T10:00:00Z", "a")])).toBe(current);
  });
});
