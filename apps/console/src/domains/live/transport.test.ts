import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RESUBSCRIBE_BACKOFF_MS, keepSubscribed } from "./transport";
import type { Sink } from "./transport";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A stand-in for graphql-ws: records each attempt so the test can complete or feed it. */
function upstream() {
  const attempts: { sink: Sink; unsubscribe: ReturnType<typeof vi.fn> }[] = [];
  const start = (sink: Sink) => {
    const unsubscribe = vi.fn();
    attempts.push({ sink, unsubscribe });
    return unsubscribe;
  };
  const latest = () => {
    const attempt = attempts.at(-1);
    if (!attempt) throw new Error("Never subscribed");
    return attempt;
  };
  return { start, attempts, latest };
}

const handlers = () => ({ next: vi.fn(), error: vi.fn() });

describe("keepSubscribed", () => {
  it("passes data to next and GraphQL errors to error", () => {
    const { start, latest } = upstream();
    const on = handlers();
    keepSubscribed(start, on);

    latest().sink.next({ data: { canvasInvalidation: { id: "a" } } });
    latest().sink.next({ errors: [{ message: "nope" }] });

    expect(on.next).toHaveBeenCalledWith({ canvasInvalidation: { id: "a" } });
    expect(on.error).toHaveBeenCalledWith([{ message: "nope" }]);
  });

  it("resubscribes right away when Railway ends a long-lived subscription", () => {
    const { start, attempts, latest } = upstream();
    keepSubscribed(start, handlers());

    // Measured: Railway completes `canvasInvalidation` after ~95 s.
    vi.advanceTimersByTime(95_000);
    latest().sink.complete();
    vi.advanceTimersByTime(0);

    expect(attempts).toHaveLength(2);
  });

  it("backs off when a subscription keeps ending right after it starts", () => {
    const { start, attempts, latest } = upstream();
    keepSubscribed(start, handlers());

    vi.advanceTimersByTime(1_000);
    latest().sink.complete();
    vi.advanceTimersByTime(RESUBSCRIBE_BACKOFF_MS - 1);
    expect(attempts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(attempts).toHaveLength(2);
  });

  it("stays stopped when graphql-ws completes after our own unsubscribe", () => {
    const { start, attempts, latest } = upstream();
    const stop = keepSubscribed(start, handlers());

    stop();
    latest().sink.complete();
    vi.advanceTimersByTime(RESUBSCRIBE_BACKOFF_MS);

    expect(latest().unsubscribe).toHaveBeenCalledOnce();
    expect(attempts).toHaveLength(1);
  });

  it("cancels a pending resubscribe when stopped", () => {
    const { start, attempts, latest } = upstream();
    const stop = keepSubscribed(start, handlers());

    latest().sink.complete();
    stop();
    vi.advanceTimersByTime(RESUBSCRIBE_BACKOFF_MS);

    expect(attempts).toHaveLength(1);
  });
});
