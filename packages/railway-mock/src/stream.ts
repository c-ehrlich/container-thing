/**
 * An async iterator fed by pushes, for subscription resolvers. Unlike an async generator, `return()`
 * stops it right away even while nothing is queued, so a closed subscription releases its timers
 * and listeners.
 */
export function stream<T>(
  start: (push: (value: T) => void) => () => void,
): AsyncIterableIterator<T, undefined> {
  // Wrapped, so a pushed `undefined` isn't mistaken for an empty queue.
  const queue: { value: T }[] = [];
  const waiting: ((result: IteratorResult<T, undefined>) => void)[] = [];
  let finished = false;
  const done = { value: undefined, done: true } as const;

  const stop = start((value) => {
    if (finished) return;
    const resolve = waiting.shift();
    if (resolve) resolve({ value, done: false });
    else queue.push({ value });
  });

  const finish = () => {
    if (!finished) {
      finished = true;
      stop();
      for (const resolve of waiting.splice(0)) resolve(done);
    }
    return Promise.resolve(done);
  };

  return {
    next: () => {
      const queued = queue.shift();
      if (queued) return Promise.resolve({ value: queued.value, done: false });
      if (finished) return Promise.resolve(done);
      return new Promise((resolve) => waiting.push(resolve));
    },
    return: finish,
    throw: async (error: unknown) => {
      await finish();
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
