// Owns: generic file access inside the data tree — the tree listing, text and binary reads, the
// atomic LF-normalized text write every other store module builds on, and the uploads directory
// with its manifest (PROJECT.md §4.8, §5).
//
// Failure behavior: reads throw StoreError("not_found") and writes throw "forbidden_path" rather
// than guessing. Every write is tmp + rename, so a crash leaves either the old file or the new one
// and never half of either — and the rename retries a transient Windows `EPERM`, which is another
// process holding the file for a moment rather than a permission problem (see `renameAtomic`). A
// tree walk that cannot read one directory omits it and keeps walking: one unreadable folder should
// cost you that folder, not the browser.

import { createHash } from "node:crypto";
import {
  appendFile, mkdir as fsMkdir, open, readFile, readdir, rename as fsRename, rm, stat, writeFile,
} from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, StoreError, resolveData } from "./paths.ts";
import { emitWrite } from "./events.ts";

export interface TreeNode {
  name: string;
  /** Relative to DATA_DIR, or to REPO_DIR in the Files panel's "Whole repo" tree. Always forward slashes. */
  path: string;
  type: "file" | "dir";
  size?: number;
  updatedAt?: string;
  children?: TreeNode[];
}

const toPosix = (rel: string): string => rel.split(path.sep).join("/");

async function walk(abs: string, rel: string): Promise<TreeNode[]> {
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return []; // unreadable directory: omit it, keep the rest of the tree
  }

  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.name === ".gitkeep") continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const childAbs = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: childRel,
        type: "dir",
        children: await walk(childAbs, childRel),
      });
    } else if (entry.isFile()) {
      const info = await stat(childAbs).catch(() => null);
      nodes.push({
        name: entry.name,
        path: childRel,
        type: "file",
        size: info?.size,
        updatedAt: info?.mtime.toISOString(),
      });
    }
  }

  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return nodes;
}

/** The `resolveData` guard, against an arbitrary root. Used for reads of the checkout's tracked files. */
export function resolveWithin(root: string, rel: string): string {
  if (typeof rel !== "string") throw new StoreError("forbidden_path", "path must be a string");
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new StoreError("forbidden_path", `path must be relative: ${rel}`);
  }
  const abs = path.resolve(root, rel || ".");
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new StoreError("forbidden_path", `path escapes the repository: ${rel}`);
  }
  return abs;
}

/**
 * List a directory tree under `data/`. There is no whole-checkout walk: until Phase 8 a `wholeRepo`
 * option walked the directory and would have listed `.env.local`; "Whole repo" is now git's tracked
 * files (`repoTree` in `browse.ts`), and a walk that could reach the key is one nobody can call.
 */
export async function listTree(rel: string): Promise<TreeNode[]> {
  const abs = resolveData(rel || ".");
  return walk(abs, toPosix(path.relative(DATA_DIR, abs)));
}

/**
 * A fingerprint of every file under `data/` outside the `skip` prefixes: each path with its size, its
 * modification and change times to the nanosecond, and its file id. A cache over the tree compares it
 * on every read, so it notices a write the store did not make — undo's `git checkout`, a file edited
 * in another program — which `events.onWrite` never hears about.
 *
 * **The residual gap, stated so nobody takes this for a content hash.** An edit that keeps the size
 * and the file id, and lands within the same timestamp tick as the write before it, with the cache
 * rebuilt in between, is invisible. The tick is the file system's clock, not the field's width: NTFS
 * stores 100 ns but is stamped from a clock that moves every 1–16 ms, Linux fills nanoseconds from a
 * coarse kernel clock of a few ms, FAT32 keeps 2 s. The change time narrows it — no ordinary tool can
 * set it, so one that restores an old modification time is still seen — and so does the file id,
 * which an editor saving through a temporary file and a rename replaces.
 */
export async function treeSignature(skip: string[] = []): Promise<string> {
  const hash = createHash("sha256");
  const visit = async (abs: string, rel: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      hash.update(`${rel}\0unreadable\n`);
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (skip.some((prefix) => `${childRel}/`.startsWith(prefix))) continue;
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) await visit(childAbs, childRel);
      else if (entry.isFile()) {
        const info = await stat(childAbs, { bigint: true }).catch(() => null);
        hash.update(info ? `${childRel}\0${info.size}\0${info.mtimeNs}\0${info.ctimeNs}\0${info.ino}\n` : `${childRel}\0gone\n`);
      }
    }
  };
  await visit(DATA_DIR, "");
  return hash.digest("hex");
}

function notFound(rel: string, err: unknown): never {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    throw new StoreError("not_found", `no such file: ${rel}`);
  }
  throw err;
}

export async function readText(rel: string): Promise<string> {
  try {
    return await readFile(resolveData(rel), "utf8");
  } catch (err) {
    notFound(rel, err);
  }
}

export async function readBinary(rel: string): Promise<Buffer> {
  try {
    return await readFile(resolveData(rel));
  } catch (err) {
    notFound(rel, err);
  }
}

export async function exists(rel: string): Promise<boolean> {
  try {
    await stat(resolveData(rel));
    return true;
  } catch {
    return false;
  }
}

/**
 * The rename half of every atomic write, with the one retry Windows makes necessary.
 *
 * On Windows a rename over an existing file fails with `EPERM` (or `EBUSY`, or `EACCES`) whenever
 * anything else has the destination or the temporary file open for a moment — a virus scanner
 * reading a file that was just created, an indexer, a backup agent. It is transient by nature: the
 * same call succeeds a few milliseconds later. Phase 6b's browser checks caught it once in about
 * thirty runs, as a chat turn that rolled back for no reason and read as flakiness; in the running
 * app the same failure loses the message being written.
 *
 * **Exported, and every atomic write in the project goes through it.** The reasoning does not stop
 * at messages: a scanner holding `settings.json` loses a setting the same way a held message file
 * loses a message, so `lib/store/settings.ts` and `lib/store/env.ts` call this rather than renaming
 * themselves. It takes absolute paths and resolves nothing, which is what lets `.env.local` — the
 * one write outside the data tree — use it too.
 *
 * The delay is a **failure guard, not a schedule** (Conventions: timers are never correctness). The
 * observable consequence is the rename succeeding, which is what the loop waits on; the attempts
 * are bounded so a genuinely permanent EPERM — a read-only file, a real permission problem — still
 * surfaces as itself rather than hanging. On every other platform the first attempt succeeds and
 * none of this runs.
 */
const RENAME_ATTEMPTS = 5;
const RENAME_BACKOFF_MS = 20;
const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);

export async function renameAtomic(tmp: string, abs: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fsRename(tmp, abs);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (attempt >= RENAME_ATTEMPTS || !TRANSIENT.has(code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RENAME_BACKOFF_MS * attempt));
    }
  }
}

/**
 * The one text write in the project: CRLF normalized away (Decision 42), dirty-checked, tmp +
 * rename. Every module that writes markdown goes through here so those three properties hold once.
 */
export async function writeText(rel: string, text: string): Promise<void> {
  const abs = resolveData(rel);
  const normalized = text.replace(/\r\n/g, "\n");

  try {
    if ((await readFile(abs, "utf8")) === normalized) return; // never rewrite identical bytes
  } catch {
    // absent or unreadable: fall through and write
  }

  await fsMkdir(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.tmp`);
  await writeFile(tmp, normalized, "utf8");
  await renameAtomic(tmp, abs);
  emitWrite([rel]);
}

/** Binary counterpart. No normalization, for obvious reasons. */
export async function writeBinary(rel: string, bytes: Buffer): Promise<void> {
  const abs = resolveData(rel);
  await fsMkdir(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.tmp`);
  await writeFile(tmp, bytes);
  await renameAtomic(tmp, abs);
  emitWrite([rel]);
}

export async function deleteFile(rel: string): Promise<void> {
  await rm(resolveData(rel), { recursive: true, force: true });
  emitWrite([rel]);
}

// Named `moveFile` rather than after the fs verb: `files.test.ts` flags every member call of that verb
// in the project so no write can skip `renameAtomic`, and this one goes through it (Phase 8 is its first caller).
export async function moveFile(from: string, to: string): Promise<void> {
  const absTo = resolveData(to);
  await fsMkdir(path.dirname(absTo), { recursive: true });
  try {
    // The same transient-Windows retry as an atomic write's rename: a file operation the reader
    // asked for should not fail because an indexer had the file open for a moment.
    await renameAtomic(resolveData(from), absTo);
  } catch (err) {
    notFound(from, err);
  }
  emitWrite([from, to]);
}

export async function mkdir(rel: string): Promise<void> {
  await fsMkdir(resolveData(rel), { recursive: true });
  emitWrite([rel]);
}

/**
 * Append-only text write, for the action log (§7.1). Not atomic in the tmp+rename sense — an append
 * of a few hundred bytes is a single write syscall, and rewriting a growing log on every action to
 * buy atomicity would cost more than it protects.
 */
export async function appendText(rel: string, text: string): Promise<void> {
  const abs = resolveData(rel);
  await fsMkdir(path.dirname(abs), { recursive: true });
  await appendFile(abs, text.replace(/\r\n/g, "\n"), "utf8");
  emitWrite([rel]);
}

/** Byte length, or 0 when the file does not exist. The log takes this before appending. */
export async function byteLength(rel: string): Promise<number> {
  try {
    return (await stat(resolveData(rel))).size;
  } catch {
    return 0;
  }
}

/** Read from `offset` to end. Paired with `replaceTail` for the log's one in-place edit. */
export async function readTail(rel: string, offset: number): Promise<string> {
  const handle = await open(resolveData(rel), "r");
  try {
    const size = (await handle.stat()).size;
    if (offset >= size) return "";
    const buffer = Buffer.alloc(size - offset);
    await handle.read(buffer, 0, buffer.length, offset);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

/** Truncate at `offset` and write `text` there. The log uses it to fill in a just-known commit. */
export async function replaceTail(rel: string, offset: number, text: string): Promise<void> {
  const handle = await open(resolveData(rel), "r+");
  try {
    await handle.truncate(offset);
    await handle.write(Buffer.from(text.replace(/\r\n/g, "\n"), "utf8"), 0, undefined, offset);
  } finally {
    await handle.close();
  }
  emitWrite([rel]);
}
