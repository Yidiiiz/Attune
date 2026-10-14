// Owns: recording SDK edits as one reversible code.change (§13.4, amendment w).
// Failure behavior: changed-since-preview files refuse before logging; rollback uses
// captured repository bytes. runBatch scans every current text file before commit.
import { assertCode, readCode } from "../store/code.ts";
import type { CodeCapture } from "../store/code.ts";
import { rememberRepository } from "./snapshots.ts";
import type { ActionSpec } from "./batch.ts";
import type { Snapshots } from "./log.ts";

export function codeChange(beforeFiles: CodeCapture, afterFiles: CodeCapture, paths: string[], summary: string): ActionSpec {
  return { type: "code.change", summary, apply: async () => {
    await assertCode(afterFiles, paths);
    const before: Snapshots = {}, after: Snapshots = {};
    for (const rel of paths) {
      before[rel] = rememberRepository(rel, beforeFiles.get(rel) ?? null);
      after[rel] = await readCode(rel) === null ? null : { git: true };
    }
    return { targets: paths, before, after };
  } };
}
