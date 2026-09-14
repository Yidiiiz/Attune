// Owns: the ActionSpec builders for files under `data/` as files — an upload stored and indexed
// (§4.8, §9.2), and in Phase 8 the document view's saves and file operations (§10.2). Split from
// `actions.ts` by domain, which is the seam Decision 56 names for it: task builders, file builders,
// settings builders, never by layer.
//
// Failure behavior: a builder that cannot find its target throws before writing anything, which
// `runBatch` turns into a rolled-back batch and an error the caller can show.

import type { ActionSpec, Store } from "./batch.ts";

/**
 * Store one upload and re-index it (§4.8, §9.2). Two targets, because `addFile` regenerates the
 * manifest as part of storing the file and a batch that named only one of them would leave the
 * other outside undo.
 *
 * The uploaded bytes are snapshotted as `{ git: true }`, not inline: they are binary and the inline
 * path is text (§7.1 says that snapshot is for code changes and binaries). Undo still needs no
 * commit, because `before` is null and null means delete. A re-upload of bytes already stored
 * writes nothing, so it snapshots nothing and only the manifest moves; the file stays in `targets`,
 * where the conflict check can see it.
 */
export function addFile(
  kind: "images" | "docs" | "other",
  name: string,
  bytes: Buffer,
  source: string,
): ActionSpec {
  return {
    type: "file.add",
    summary: `Add '${name}'`,
    apply: async (store: Store) => {
      const manifestPath = "files/index.md";
      const manifestBefore = await store.snapshotContent(manifestPath);
      const { rel, created } = await store.manifest.addFile(kind, name, bytes, source);

      return {
        targets: [rel, manifestPath],
        before: { ...(created ? { [rel]: null } : {}), [manifestPath]: manifestBefore },
        after: {
          ...(created ? { [rel]: { git: true } as const } : {}),
          [manifestPath]: await store.snapshotContent(manifestPath),
        },
      };
    },
  };
}
