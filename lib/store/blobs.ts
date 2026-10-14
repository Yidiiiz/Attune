// Owns: immutable, content-addressed bytes for data history snapshots (amendment z).
// Failure behavior: reject malformed hashes, missing bytes and corrupt content by name;
// never restore a guessed value. Generic store writes retain path and atomic-write guards.

import { createHash } from "node:crypto";
import { exists, readBinary, writeBinary } from "./files.ts";
import { StoreError } from "./paths.ts";

export const blobHash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function blobPath(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new StoreError("invalid", "invalid history blob hash");
  return `history/blobs/${hash}`;
}

export async function readBlob(hash: string): Promise<Buffer> {
  const rel = blobPath(hash);
  const bytes = await readBinary(rel);
  if (blobHash(bytes) !== hash) throw new StoreError("invalid", `${rel} is corrupt; nothing restored`);
  return bytes;
}

export async function writeBlob(hash: string, bytes: Buffer): Promise<void> {
  const rel = blobPath(hash);
  if (blobHash(bytes) !== hash) throw new StoreError("invalid", "history blob digest mismatch");
  if (await exists(rel)) {
    await readBlob(hash);
    return;
  }
  await writeBinary(rel, bytes);
}
