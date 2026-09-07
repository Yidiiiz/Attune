// Owns: every absolute path this app touches, and the guard that keeps writes inside the data tree.
// It is deliberately the only module in app/, components/, lib/, or scripts/ that spells the data
// directory name as a literal (PROJECT.md §12); everything else composes paths from these exports,
// which is what makes `npm run publish-check` a one-line grep.
//
// Failure behavior: resolveData throws StoreError("forbidden_path") rather than returning a path it
// is unsure about. A caller that mishandles the throw loses its own operation; nothing outside
// DATA_DIR is ever written, which is the property worth protecting.

import path from "node:path";

/** `secret_rejected` is refused content, not a malformed request: the write path found a
 * credential in what was about to be logged and wrote nothing (§11.5). */
export type StoreErrorCode = "not_found" | "exists" | "invalid" | "forbidden_path" | "secret_rejected";

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

/**
 * The git checkout. Everything below is derived from it.
 *
 * `ATTUNE_REPO_DIR` points the whole app at a different checkout (Decision 45). It exists so the
 * history CLI can be exercised against a throwaway repository instead of yours, and so a store test
 * can run against a temp directory. Unset — which is every normal run — it is the working directory.
 */
export const REPO_DIR: string = process.env.ATTUNE_REPO_DIR
  ? path.resolve(process.env.ATTUNE_REPO_DIR)
  : process.cwd();

// Announced once, when the module is first loaded, because this is the one setting that can point
// every read and write in the app at a checkout the owner did not mean. A stray `export
// ATTUNE_REPO_DIR` left in a shell profile is otherwise completely silent (Decision 45).
if (process.env.ATTUNE_REPO_DIR) {
  console.error(`store: ATTUNE_REPO_DIR is set; reading and writing under ${REPO_DIR}`);
}

/** Yours: the private tree the app reads and writes. Never in the published repo. */
export const DATA_DIR: string = path.join(REPO_DIR, "data");

/** The blank-slate copy of every data file, shipped with the project. */
export const SEED_DIR: string = path.join(REPO_DIR, "seed");

/**
 * The one path this app writes that is relative to the *repository* rather than to `data/`. It is
 * spelled once, here, because two things depend on knowing it is not a data path: `env.ts`, which
 * writes it, and `undoBatch`, which must refuse to restore a snapshot for it (§7.2, Decision 58).
 */
export const ENV_TARGET = ".env.local";

/** Where .env.local lives. Read and written only by lib/store/env.ts. */
export const ENV_FILE: string = path.join(REPO_DIR, ENV_TARGET);

/**
 * Turn a path relative to DATA_DIR into an absolute one, refusing anything that escapes.
 * Rejects absolute inputs, Windows drive letters, and any `..` that climbs out.
 */
export function resolveData(rel: string): string {
  if (typeof rel !== "string" || rel.length === 0) {
    throw new StoreError("forbidden_path", "path must be a non-empty string");
  }
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.startsWith("\\\\")) {
    throw new StoreError("forbidden_path", `path must be relative: ${rel}`);
  }
  const abs = path.resolve(DATA_DIR, rel);
  const prefix = DATA_DIR + path.sep;
  if (abs !== DATA_DIR && !abs.startsWith(prefix)) {
    throw new StoreError("forbidden_path", `path escapes the data directory: ${rel}`);
  }
  return abs;
}

/**
 * Whether a target path means a file under `data/`, which is the only tree `resolveData` — and so
 * every store write, and so every `{fields}` or `{content}` restore — can address.
 *
 * Two kinds of path answer false, and they fail differently. `.env.local` resolves perfectly well
 * *and means the wrong file*: read as a data path it is `data/.env.local`, which is not the file
 * anyone wrote. Anything escaping the tree does not resolve at all. Undo needs both refused, so the
 * question is asked once, here, rather than as a check against a literal at each call site.
 */
export function isDataRelative(rel: string): boolean {
  if (rel === ENV_TARGET) return false;
  try {
    resolveData(rel);
    return true;
  } catch {
    return false;
  }
}
