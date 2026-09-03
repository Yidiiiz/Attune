// Owns: the notification every store write emits, naming the paths it touched.
// One module-level listener set, no ordering guarantees, no payload beyond the paths. Its audience
// is the link index (PROJECT.md §5), which uses it to drop cached entries for changed files.
//
// Failure behavior: a listener that throws is caught and logged, never propagated. A cache that
// cannot invalidate itself is a stale graph; a write that fails because something downstream of it
// threw is a lost task.

type WriteListener = (paths: string[]) => void;

const listeners = new Set<WriteListener>();

/** Subscribe to store writes. Returns the unsubscribe function. */
export function onWrite(cb: WriteListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Called by store modules after a successful write. `paths` are relative to DATA_DIR. */
export function emitWrite(paths: string[]): void {
  if (paths.length === 0 || listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(paths);
    } catch (err) {
      console.error(`store: write listener threw (${(err as Error).message})`);
    }
  }
}
