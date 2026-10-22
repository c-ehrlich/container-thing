import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CANVAS_SILENCE_MS, CHANGE_DEBOUNCE_MS, watchEnvironment } from "./environment";
import type { LiveStatus } from "./environment";
import type { Handlers, LiveConnection, LiveTransport } from "./transport";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A connection the test controls: it can push to any subscription, drop and reconnect. */
function fakeTransport(initial: LiveConnection = "connected") {
  type Subscription = {
    query: string;
    variables: Record<string, unknown>;
    handlers: Handlers<unknown>;
    active: boolean;
  };
  const subscriptions: Subscription[] = [];
  let connection = initial;
  const connectionListeners = new Set<() => void>();
  const reconnectListeners = new Set<() => void>();

  const transport: LiveTransport = {
    subscribe: (query, variables, handlers) => {
      const subscription = { query, variables, handlers, active: true };
      subscriptions.push(subscription);
      return () => {
        subscription.active = false;
      };
    },
    connection: () => connection,
    onConnectionChange: (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    onReconnected: (listener) => {
      reconnectListeners.add(listener);
      return () => reconnectListeners.delete(listener);
    },
  };

  const find = (predicate: (s: Subscription) => boolean) => {
    const found = subscriptions.find((s) => s.active && predicate(s));
    if (!found) throw new Error("No such subscription");
    return found;
  };
  const canvas = () => find((s) => s.query.includes("canvasInvalidation"));

  return {
    transport,
    subscriptions,
    active: () => subscriptions.filter((s) => s.active),
    pushHash: (id: string) => canvas().handlers.next({ canvasInvalidation: { id } }),
    canvas,
    pushStatus: (deploymentId: string) =>
      find((s) => s.variables.id === deploymentId).handlers.next({
        deployment: { id: deploymentId, status: "DEPLOYING" },
      }),
    setConnection: (next: LiveConnection) => {
      connection = next;
      for (const listener of connectionListeners) listener();
    },
    reconnect: () => {
      for (const listener of reconnectListeners) listener();
    },
  };
}

function watch(fake: ReturnType<typeof fakeTransport>) {
  const onChange = vi.fn();
  const statuses: LiveStatus[] = [];
  const environment = watchEnvironment(fake.transport, {
    environmentId: "env-1",
    onChange,
    onStatus: (status) => statuses.push(status),
  });
  return { environment, onChange, mode: () => statuses.at(-1)?.mode };
}

describe("watchEnvironment", () => {
  it("counts the first hash and each new one as a change, not Railway's repeats", () => {
    const fake = fakeTransport();
    const { onChange } = watch(fake);

    // The first hash covers changes between loading the data and subscribing.
    fake.pushHash("a");
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    fake.pushHash("a");
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    fake.pushHash("b");
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("turns a burst of pushes into one change", () => {
    const fake = fakeTransport();
    const { environment, onChange } = watch(fake);
    environment.setDeployments(["d1"]);

    fake.pushHash("a");
    fake.pushStatus("d1");
    fake.pushStatus("d1");
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("follows exactly the deployments it's given", () => {
    const fake = fakeTransport();
    const { environment } = watch(fake);
    const followed = () => fake.active().flatMap((s) => (s.variables.id ? [s.variables.id] : []));

    environment.setDeployments(["d1", "d2"]);
    expect(followed()).toEqual(["d1", "d2"]);

    environment.setDeployments(["d2", "d3"]);
    expect(followed()).toEqual(["d2", "d3"]);
    // d2 kept its subscription instead of subscribing again.
    expect(fake.subscriptions.filter((s) => s.variables.id === "d2")).toHaveLength(1);
  });

  it("polls until connected, and again while reconnecting", () => {
    const fake = fakeTransport("connecting");
    const { mode } = watch(fake);
    expect(mode()).toBe("polling");

    fake.setConnection("connected");
    expect(mode()).toBe("live");

    fake.setConnection("reconnecting");
    expect(mode()).toBe("polling");
  });

  it("stays live while Railway keeps re-sending the same hash", () => {
    const fake = fakeTransport();
    const { mode, onChange } = watch(fake);

    // Measured: the hash is re-sent every 2 → 4 → 8 s.
    for (let elapsed = 0; elapsed < 120_000; elapsed += 8_000) {
      fake.pushHash("a");
      vi.advanceTimersByTime(8_000);
    }

    expect(mode()).toBe("live");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("polls once the hash goes silent, and goes live again when it's back", () => {
    const fake = fakeTransport();
    const { mode } = watch(fake);
    fake.pushHash("a");

    vi.advanceTimersByTime(CANVAS_SILENCE_MS);
    expect(mode()).toBe("live");

    // The watchdog checks every 5 s.
    vi.advanceTimersByTime(5_000);
    expect(mode()).toBe("polling");

    fake.pushHash("a");
    expect(mode()).toBe("live");
  });

  it("polls when canvasInvalidation errors", () => {
    const fake = fakeTransport();
    const { mode } = watch(fake);

    fake.canvas().handlers.error(new Error("Subscription not found"));

    expect(mode()).toBe("polling");
  });

  it("polls when canvasInvalidation sends something unexpected", () => {
    const fake = fakeTransport();
    const { mode, onChange } = watch(fake);

    fake.canvas().handlers.next({ canvasInvalidation: { hash: 42 } });
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);

    expect(mode()).toBe("polling");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("counts a reconnect as a change, since pushes may have been missed", () => {
    const fake = fakeTransport();
    const { onChange } = watch(fake);

    fake.reconnect();
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);

    expect(onChange).toHaveBeenCalledOnce();
  });

  it("releases every subscription and timer when stopped", () => {
    const fake = fakeTransport();
    const { environment, onChange } = watch(fake);
    environment.setDeployments(["d1"]);
    fake.pushHash("a");

    environment.stop();
    fake.reconnect();
    vi.advanceTimersByTime(CANVAS_SILENCE_MS * 2);

    expect(fake.active()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
