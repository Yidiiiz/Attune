// Owns: data snapshot capture, blob durability and restoration (PROJECT.md §7.1, Decision 106).
// Failure behavior: missing or corrupt blobs and legacy data git snapshots refuse by name.
// Rejected bytes remain in memory only; the batch persists accepted bytes before logging hashes.

import { joinFrontmatter, splitFrontmatter } from "../store/frontmatter.ts";
import * as files from "../store/files.ts";
import * as tasks from "../store/tasks.ts";
import { blobHash, readBlob, writeBlob } from "../store/blobs.ts";
import { StoreError } from "../store/paths.ts";
import { looksLikeText } from "../security/raw.ts";
import * as git from "./git.ts";
import type { Snapshot } from "./log.ts";

const INLINE_LIMIT = 64 * 1024;

/** First bytes captured per path, retained for a refused batch's rollback. */
const held = new Map<string, Buffer>();
// Persist only after the shared secret scan accepts the batch. Rejected bytes never reach blobs.
const pendingBlobs = new Map<string, Buffer>();

/** Small text inline, binary and large text by hash; no lossy binary decoding. */
export async function snapshotContent(rel: string): Promise<Snapshot> {
  if (!(await files.exists(rel))) return null;
  const bytes = await files.readBinary(rel);
  if (bytes.length > INLINE_LIMIT || !looksLikeText(bytes)) {
    if (!held.has(rel)) held.set(rel, bytes);
    const hash = blobHash(bytes);
    pendingBlobs.set(hash, bytes);
    return { blob: hash };
  }
  return { content: bytes.toString("utf8") };
}

export async function snapshotFields(rel: string, keys: string[]): Promise<Snapshot> {
  if (!(await files.exists(rel))) return null;
  const { data } = splitFrontmatter(await files.readText(rel));
  const fields: Record<string, unknown> = {};
  for (const key of keys) fields[key] = data[key] ?? null;
  return { fields };
}

/** Restore data from inline fields/text or blobs; committed repository paths from git. */
export async function applySnapshot(
  rel: string,
  snap: Snapshot,
  commit: string | null,
  side: "before" | "after" = "before",
  repoRelative = false,
): Promise<void> {
  if (snap === null) {
    await files.deleteFile(rel);
    tasks.invalidateTaskCache();
    return;
  }

  if ("content" in snap) {
    await files.writeText(rel, snap.content);
    tasks.invalidateTaskCache();
    return;
  }

  if ("blob" in snap) {
    if (repoRelative) throw new StoreError("invalid", `${rel}: a blob restores data paths only`);
    await files.writeBinary(rel, pendingBlobs.get(snap.blob) ?? await readBlob(snap.blob));
    tasks.invalidateTaskCache();
    return;
  }

  if ("fields" in snap) {
    const text = (await files.exists(rel)) ? await files.readText(rel) : "";
    const { data, body } = splitFrontmatter(text);
    for (const [key, value] of Object.entries(snap.fields)) data[key] = value;
    await files.writeText(rel, joinFrontmatter(data, body));
    tasks.invalidateTaskCache();
    return;
  }

  if (!repoRelative || !commit) {
    throw new Error(`${rel} can only be restored from its commit, and this batch has none`);
  }
  await git.restorePaths(side === "before" ? `${commit}^` : commit, [rel]);
  tasks.invalidateTaskCache();
}

export function resetSnapshots(): void {
  held.clear();
  pendingBlobs.clear();
}

export async function snapshotBytes(hash: string): Promise<Buffer> {
  return pendingBlobs.get(hash) ?? await readBlob(hash);
}

export async function persistSnapshots(snapshots: Snapshot[]): Promise<void> {
  const referenced = new Set(snapshots.flatMap((snap) => snap !== null && "blob" in snap ? [snap.blob] : []));
  for (const hash of referenced) {
    const bytes = pendingBlobs.get(hash);
    if (bytes) await writeBlob(hash, bytes);
    else await readBlob(hash);
  }
}

export async function rollbackSnapshot(rel: string, snap: Snapshot): Promise<void> {
  const bytes = snap !== null && ("git" in snap || "blob" in snap) ? held.get(rel) : undefined;
  if (bytes === undefined) await applySnapshot(rel, snap, null);
  else await files.writeBinary(rel, bytes);
}
