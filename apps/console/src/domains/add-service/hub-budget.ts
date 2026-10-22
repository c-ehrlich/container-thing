const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Docker Hub's per-IP allowance, from the `x-ratelimit-*` headers on its responses. The headers count
 * every request from our IP, so they stay right with several server instances behind it, though each
 * instance only learns about the others' requests when it makes one itself.
 */
export class HubBudget {
  #limit = 0;
  #remaining = 0;
  /** Until when `#remaining` is current. Hub's window is a minute long. */
  #until = 0;

  record(response: Response, now = Date.now()) {
    const header = (name: string) => {
      const value = Number(response.headers.get(name) ?? Number.NaN);
      return Number.isFinite(value) ? value : null;
    };
    const limit = header("x-ratelimit-limit");
    const remaining = header("x-ratelimit-remaining");
    // Seconds since the epoch.
    const reset = header("x-ratelimit-reset");
    if (limit && remaining !== null) {
      this.#limit = limit;
      this.#remaining = remaining;
      this.#until = reset ? reset * 1000 : now + MINUTE;
    }
    if (response.status === 429) {
      this.#limit ||= 1;
      this.#remaining = 0;
      this.#until = Math.max(this.#until, now + MINUTE);
    }
  }

  /** The share of the allowance left, from 0 to 1. Before any response, or once it resets, that's 1. */
  left(now = Date.now()) {
    if (!this.#limit || now >= this.#until) return 1;
    return Math.max(0, this.#remaining / this.#limit);
  }

  /** How old a cached answer may get before we spend a request refreshing it. */
  refreshAfterMs(now = Date.now()) {
    const left = this.left(now);
    if (left > 0.6) return 10 * MINUTE;
    if (left > 0.3) return HOUR;
    // The last 30% is kept for queries we have no answer for at all, so old answers stay as they are.
    return Number.POSITIVE_INFINITY;
  }
}
