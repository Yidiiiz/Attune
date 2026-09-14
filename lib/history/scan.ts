// Owns: every reason `runBatch` refuses a batch after applying it and before a byte of it is logged
// — the secret scan (PROJECT.md Decision 50), a write into a reply another turn is still
// streaming (`in-flight.ts`), and a new note no map links to (§6.3). Predicates over a batch and its
// snapshots, split out of `batch.ts` along the seam Decision 56 named in advance, because they share
// no state with the ordered transaction there; this is also where each new refusal rule goes.
//
// Failure behavior: none of its own. It reads and returns; `runBatch` rolls back and throws.

import { findSecret } from "../security/secrets.ts";
import { splitFrontmatter } from "../store/frontmatter.ts";
import { markdownLinks, resolveDataPath } from "../knowledge/links.ts";
import type { StoreErrorCode } from "../store/paths.ts";
import { contestedTargets } from "./in-flight.ts";
import type { Snapshot } from "./log.ts";
import type { Applied, BatchSpec } from "./batch.ts";

export interface Refusal {
  code: StoreErrorCode;
  message: string;
}

/** A file the commit will carry whose bytes the log does not: its path, and its text. */
export interface Unlogged {
  rel: string;
  text: string;
}

/**
 * The text of every file this batch leaves behind a `{ git: true }` snapshot — an upload, a text
 * file over the inline limit. The log carries none of it, but the commit does, and the pre-commit
 * hook scans every staged file, so this has to be scanned here or the hook refuses the commit and
 * every one after it (hard rule 4). Read the way the hook reads one: a NUL byte means binary and is
 * skipped, anything else is text. The text is then scanned whole, as every snapshot here is, where the
 * hook goes line by line: no pattern is anchored, so whatever matches within a line matches within
 * the text, and this refuses everything the hook would. `read` is the store's binary read, passed in
 * so this module still touches no disk of its own.
 *
 * Data paths only. Phase 9's `code.change` targets are repository paths this reader cannot reach;
 * that batch owes the same scan of its own files.
 */
export async function unloggedTexts(applied: Applied[], read: (rel: string) => Promise<Buffer>): Promise<Unlogged[]> {
  const last = new Map<string, Snapshot>();
  for (const step of applied) {
    if (step.spec.type === "code.change") continue;
    for (const [rel, snap] of Object.entries(step.after)) last.set(rel, snap);
  }
  const found: Unlogged[] = [];
  for (const [rel, snap] of last) {
    if (snap === null || !("git" in snap)) continue;
    const bytes = await read(rel);
    if (!bytes.includes(0)) found.push({ rel, text: bytes.toString("utf8") });
  }
  return found;
}

/** The first reason to refuse this batch, or null. Secrets first, as they were before the others. */
export function refuseBatch(spec: BatchSpec, applied: Applied[], targets: string[], unlogged: Unlogged[] = []): Refusal | null {
  const secret = scanBatch(spec, applied, unlogged);
  if (secret) {
    return {
      code: "secret_rejected",
      message:
        `${secret.where} looks like it contains a credential (${secret.pattern}). Nothing was ` +
        `written. Move the value to .env.local, or change the text, and save again.`,
    };
  }
  const contested = contestedTargets(targets, spec.turn);
  if (contested) return { code: "invalid", message: contested };
  const unlinked = unlinkedNote(applied);
  if (unlinked) return { code: "invalid", message: unlinked };
  return null;
}

const NOTE = /^knowledge\/notes\/.+\.md$/;
const MAP = /^knowledge\/maps\/[^/]+\.md$/;

/**
 * §6.3: a note this batch creates must name a map in its `links`, and this same batch must write a
 * link to the note into that map. Read from the snapshots alone — the note's `after`, the map's
 * `after` — so it holds for any batch that creates a note, however it was built. A note whose bytes
 * the log does not carry (`{ git: true }`) cannot be checked and is refused rather than waved through.
 */
function unlinkedNote(applied: Applied[]): string | null {
  const before = new Map<string, Snapshot>();
  const after = new Map<string, Snapshot>();
  for (const step of applied) {
    for (const [rel, snap] of Object.entries(step.before)) if (!before.has(rel)) before.set(rel, snap);
    for (const [rel, snap] of Object.entries(step.after)) after.set(rel, snap);
  }

  const refuse = (rel: string, why: string): string =>
    `${rel} is a new note that ${why}. A new note names a map in its links, and the same change adds ` +
    "the link to that map (§6.3), so it is never an orphan. Nothing was written.";

  for (const [rel, snap] of after) {
    if (!NOTE.test(rel) || before.get(rel) !== null || snap === null) continue;
    if (!("content" in snap)) return refuse(rel, "is too large for its links to be checked");

    let links: unknown;
    try {
      links = splitFrontmatter(snap.content).data.links;
    } catch {
      return refuse(rel, "has frontmatter that does not parse");
    }
    const maps = (Array.isArray(links) ? links : [])
      .map((link) => (typeof link === "string" ? resolveDataPath(link) : null))
      .filter((link): link is string => link !== null && MAP.test(link));
    if (maps.length === 0) return refuse(rel, "names no map in its links");

    const linked = maps.some((map) => {
      const mapSnap = after.get(map);
      return mapSnap != null && "content" in mapSnap && markdownLinks(splitFrontmatter(mapSnap.content).body, map).includes(rel);
    });
    if (!linked) return refuse(rel, `is not linked from ${maps.join(" or ")} by this change`);
  }
  return null;
}

/** The text a snapshot puts into the log. `{ git: true }` carries none; the commit holds it. */
function snapshotText(snap: Snapshot): string {
  if (snap === null) return "";
  if ("content" in snap) return snap.content;
  if ("fields" in snap) return JSON.stringify(snap.fields);
  return "";
}

interface Rejection {
  where: string;
  pattern: string;
}

/**
 * Everything this batch is about to write into `actions.jsonl`, scanned before a byte of it is
 * written: the summaries and meta that become log fields and mirror lines, the target paths, and
 * both sides of every snapshot.
 *
 * The log is append-only and committed, so a credential reaching it is not an ordinary leak — the
 * pre-commit hook finds it on the *next* commit and refuses every commit after that, and undo does
 * not help because the undo batch snapshots the same text again. Scrubbing is not available here:
 * snapshots exist to restore files byte for byte. So the batch is refused instead, whole, before
 * anything is logged (AGENTS.md hard rules; PROJECT.md Decision 50).
 */
export function scanBatch(spec: BatchSpec, applied: Applied[], unlogged: Unlogged[] = []): Rejection | null {
  const described = [
    spec.summary,
    ...applied.map((step) => step.spec.summary),
    JSON.stringify(spec.meta ?? {}),
  ].join("\n");
  const inDescription = findSecret(described);
  if (inDescription) return { where: "the summary of this change", pattern: inDescription };

  for (const step of applied) {
    for (const rel of step.targets) {
      const inPath = findSecret(rel);
      if (inPath) return { where: rel, pattern: inPath };
    }
    // `before` counts too: deleting a file that already held a credential would copy it into the log
    // on the way out, which is the same deadlock arriving by a politer route.
    for (const snapshots of [step.before, step.after]) {
      for (const [rel, snap] of Object.entries(snapshots)) {
        const hit = findSecret(snapshotText(snap));
        if (hit) return { where: rel, pattern: hit };
      }
    }
  }

  // The bytes a `{ git: true }` snapshot leaves out of the log, which the commit still carries.
  for (const { rel, text } of unlogged) {
    const hit = findSecret(text);
    if (hit) return { where: rel, pattern: hit };
  }

  return null;
}
