// Owns: every absolute path this app touches, and the guard that keeps writes inside the data tree.
// It is deliberately the only module in app/, components/, lib/, or scripts/ that spells the data
// directory name as a literal (PROJECT.md §12); everything else composes paths from these exports,
// which is what makes `npm run publish-check` a one-line grep.
//
// Failure behavior: resolveData throws StoreError("forbidden_path") rather than returning a path it
// is unsure about. A caller that mishandles the throw loses its own operation; nothing outside
// DATA_DIR is ever written, which is the property worth protecting.

import path from "node:path";

export type StoreErrorCode = "not_found" | "exists" | "invalid" | "forbidden_path";

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

/** Yours: the private tree the app reads and writes. Never in the published repo. */
export const DATA_DIR: string = path.join(REPO_DIR, "data");

/** The blank-slate copy of every data file, shipped with the project. */
export const SEED_DIR: string = path.join(REPO_DIR, "seed");

/** Where .env.local lives. Read and written only by lib/store/env.ts. */
export const ENV_FILE: string = path.join(REPO_DIR, ".env.local");

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
