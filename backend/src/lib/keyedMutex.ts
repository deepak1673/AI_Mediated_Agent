// Serializes async work per key within this process. The approval flows are check-then-create
// (find a pending request, else create one); without this, two concurrent identical requests both
// see "none" and create duplicates. Single-process only, which is what the POC runs as.
const tails = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
