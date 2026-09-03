// Owns: the promise chain that makes every mutation in this process happen one at a time.
// Two batches running at once would interleave their log lines, race the commit-field backfill, and
// hand git a half-written tree; serializing costs nothing at this scale (PROJECT.md §7.1).
//
// Failure behavior: a task that rejects settles the queue and rejects only its own caller. The
// chain is never left broken — the next enqueue runs regardless of how the previous one ended.

let tail: Promise<unknown> = Promise.resolve();

/** Run `task` after everything already queued. Rejections belong to the caller, not the queue. */
export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task, task);
  tail = result.catch(() => undefined);
  return result;
}

/** Resolve when the queue is idle. Used by shutdown paths and by tests. */
export function drain(): Promise<void> {
  return tail.then(
    () => undefined,
    () => undefined,
  );
}
