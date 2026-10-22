import { describe, expect, it, vi } from "vitest";

import { stream } from "./stream";

describe("stream", () => {
  it("delivers pushes in order, including those before anyone asked", async () => {
    const values = stream<number>((push) => {
      push(1);
      setTimeout(() => push(2), 0);
      return () => {};
    });
    expect(await values.next()).toEqual({ value: 1, done: false });
    expect(await values.next()).toEqual({ value: 2, done: false });
  });

  it("stops at once on return, even while waiting", async () => {
    const stop = vi.fn();
    const values = stream<number>(() => stop);
    const pending = values.next();
    await values.return?.();
    expect(stop).toHaveBeenCalledOnce();
    expect(await pending).toEqual({ value: undefined, done: true });
  });
});
