// Owns: saving a file from the document view, and ticking a checkbox in one (PROJECT.md §10.2, §14's
// `/api/files/write`) — logged by path as `task.update`, `knowledge.write` or `file.write`. The
// other half of the file builders, the file operations, is `file-actions.ts`; the two are §14's two
// routes. Every refusal comes from `write-policy.ts`, checked here inside the batch, so a request
// that never saw the view is refused exactly as the view would have been.
//
// **Which bytes a version covers.** `versionOf` is SHA-256 over the file's bytes on disk exactly as
// `store.files.readBinary` returns them — before the frontmatter is parsed, before any line ending is
// normalized. The read route computes it with this function and hands it to the page; the page never
// hashes anything, it sends the same string back as `base`; the builder computes it again with this
// function, over the same read, before it writes. One function, one read, both sides — so a file
// nobody else touched cannot fail the comparison (the Phase 8 approval's 409 condition). The version a
// save answers with is taken the same way, inside its batch, from the bytes it wrote — the writer's
// `updatedAt` stamp included — so the next save is not a false 409, and a write landing after the
// batch is not a false pass (the Stage A review, item 6).
//
// **A save that changes nothing writes nothing, and logs nothing.** `saveDocument` compares first and
// answers `unchanged` without a batch, which is what lets an equation sheet go through Edit and Save
// untouched and keep its SHA-256 (§15). A save that does change the body writes the body exactly as
// typed: the frontmatter is re-serialized by the file's own writer, but the body is opaque to it.
//
// Failure behavior: every refusal is thrown before a byte is written — policy, a stale `base`, a
// frontmatter that fails its schema (named by field, never echoed) — and `runBatch` rolls back
// anything a later action wrote.

import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { joinFrontmatter, splitFrontmatter } from "../store/frontmatter.ts";
import { StoreError } from "../store/paths.ts";
import { looksLikeText } from "../security/raw.ts";
import { CHECKBOX } from "../knowledge/checkbox.ts";
import { runBatch } from "./batch.ts";
import { recorded, writeKnowledge } from "./knowledge-actions.ts";
import { commitPrefixFor, policyFor } from "./write-policy.ts";
import type { ActionSpec, BatchResult, Store } from "./batch.ts";
import type { Snapshots } from "./log.ts";
import type { Policy } from "./write-policy.ts";
import type { Task } from "../store/tasks.ts";

/** The version of a file: SHA-256 of its bytes as the store reads them. The only hash in this flow. */
export const versionOf = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export interface SaveInput {
  path: string;
  /** `versionOf` the bytes the editor opened, or null to create a file that must not exist yet. */
  base: string | null;
  /** Either the frontmatter table and the body… (`fields: null` means the table was not touched) */
  fields?: Record<string, unknown> | null;
  body?: string;
  /** …or the whole file as text: a file with no frontmatter, or one whose frontmatter will not parse. */
  text?: string;
  /** Creating a note: the map that links it, and the reason on that link line (§6.3). */
  mapLink?: string | null;
  reason?: string;
}

const nameOf = (rel: string): string => rel.split("/").pop()?.replace(/\.md$/, "") ?? rel;

/** "" from a cleared table cell means "not set", the way a hand-edited `due:` does (§4.1). */
const cleared = (data: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value]));

/** A schema failure as a refusal that names fields and never repeats a value (Decision 78). */
function unfit(rel: string, err: ZodError): StoreError {
  const fields = [...new Set(err.issues.map((issue) => String(issue.path[0] ?? "the frontmatter")))];
  const verb = fields.length === 1 ? "is" : "are";
  return new StoreError("invalid", `${rel} was not saved: ${fields.join(", ")} ${verb} missing or not the kind of value it needs to be.`);
}

function refuse(why: string | null): void {
  if (why !== null) throw new StoreError("forbidden_path", why);
}

/** Compare `base` with what is on disk now. Called inside the batch, where nothing else can write. */
function checkBase(rel: string, bytes: Buffer | null, base: string | null): void {
  if (base === null) {
    if (bytes !== null) throw new StoreError("exists", `${rel} already exists; nothing was written.`);
    return;
  }
  const kept = "Nothing was saved, and your text is still in the editor: copy what you need, reopen the file, and save again.";
  if (bytes === null) throw new StoreError("conflict", `${rel} was deleted after it was opened. ${kept}`);
  if (versionOf(bytes) !== base) throw new StoreError("conflict", `${rel} changed on disk after it was opened. ${kept}`);
}

/** The text before the body — the frontmatter block, byte for byte — so an untouched block stays so. */
const blockOf = (text: string, body: string): string => text.slice(0, text.length - body.length);

/**
 * Write the new state of `rel` with its kind's own writer. `current` is the file as it is, or null
 * when creating. Exactly one of `text` or `body` is set, which `shapeError` guarantees.
 */
async function write(store: Store, rel: string, policy: Policy, current: string | null, input: SaveInput): Promise<void> {
  const k = store.knowledge;
  const schemas = { note: k.NoteSchema, map: k.MapSchema, collection: k.CollectionSchema, session: k.SessionSchema };

  if (input.text !== undefined) {
    // The whole file, as typed. A record's frontmatter still has to be one, and a task keeps its id.
    if (policy.kind === "task" || policy.kind in schemas) {
      const { data } = splitFrontmatter(input.text);
      const parsed = policy.kind === "task" ? store.tasks.TaskSchema.parse(cleared(data)) : schemas[policy.kind as keyof typeof schemas].parse(data);
      if (policy.kind === "task" && current !== null && parsed.id !== splitFrontmatter(current).data.id) {
        throw new StoreError("invalid", `${rel} was not saved: a task's id does not change.`);
      }
    }
    await store.files.writeText(rel, input.text);
    return;
  }

  const body = input.body ?? "";
  const was = current === null ? { data: {}, body: "" } : splitFrontmatter(current);
  if (input.fields != null && !policy.fields) throw new StoreError("forbidden_path", `${rel}'s frontmatter is not edited here; only its text is.`);
  const data = input.fields == null ? was.data : cleared(input.fields);

  switch (policy.kind) {
    case "task":
      if (data.id !== was.data.id) throw new StoreError("invalid", `${rel} was not saved: a task's id does not change.`);
      await store.tasks.writeTask({ ...data, path: rel, body } as Task);
      return;
    case "note":
    case "map":
    case "collection":
    case "session":
      await k.writeRecord(rel, policy.kind, current === null ? await fresh(store, policy.kind, data) : data, body);
      return;
    case "profile":
    case "file":
      // No schema to write through: keep the frontmatter block exactly as it is unless it was edited.
      if (input.fields == null && current !== null) await store.files.writeText(rel, blockOf(current, was.body) + body);
      else if (input.fields != null) await store.files.writeText(rel, joinFrontmatter(data, body));
      else await store.files.writeText(rel, body);
      return;
    default:
      throw new StoreError("forbidden_path", `${rel} is not written here.`);
  }
}

/** A new map or collection: the id is the store's to give, and the title is required (§4.3, §4.5). */
async function fresh(store: Store, kind: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof data.title !== "string" || data.title.trim() === "") throw new StoreError("invalid", `A new ${kind} needs a title.`);
  return { ...data, id: await store.knowledge.newKnowledgeId(kind === "map" ? "m" : "k"), title: data.title.trim() };
}

/** The action type a save of `rel` is logged as (§10.2: by path). */
function typeFor(policy: Policy): ActionSpec["type"] {
  return policy.kind === "task" ? "task.update" : policy.kind === "file" ? "file.write" : "knowledge.write";
}

/** One save as an action, with everything the route checked checked again inside the batch. `written`
 * is handed the version of the bytes the save leaves on disk, read before the batch ends. */
export function saveAction(input: SaveInput, summary?: string, written?: (version: string) => void): ActionSpec {
  const rel = input.path;
  const kind = policyFor(rel, { text: true });
  return {
    type: typeFor(kind),
    summary: summary ?? `${input.base === null ? "Create" : "Save"} '${nameOf(rel)}'`,
    apply: async (store: Store) => {
      const done = async <T>(result: T): Promise<T> => {
        written?.(versionOf(await store.files.readBinary(rel)));
        return result;
      };
      const bytes = (await store.files.exists(rel)) ? await store.files.readBinary(rel) : null;
      const policy = policyFor(rel, { text: bytes === null || looksLikeText(bytes) });
      refuse(bytes === null ? policy.create : policy.save);
      checkBase(rel, bytes, input.base);
      const current = bytes === null ? null : bytes.toString("utf8");

      if (current === null && policy.kind === "note") {
        // §6.3: a new note arrives with its map link, through the same builder a proposal uses.
        if (!input.mapLink) throw new StoreError("invalid", "A new note names the map it belongs to (§6.3).");
        const content = input.text ?? joinFrontmatter(input.fields ?? {}, input.body ?? "");
        return done(await writeKnowledge({ path: rel, op: "create", content, reason: input.reason ?? "", mapLink: input.mapLink }, "manual").apply(store));
      }

      const run = async (): Promise<void> => {
        try {
          await write(store, rel, policy, current, input);
        } catch (err) {
          throw err instanceof ZodError ? unfit(rel, err) : err;
        }
      };
      if (policy.kind === "file" || policy.kind === "task") {
        const before: Snapshots = { [rel]: await store.snapshotContent(rel) };
        await run();
        return done({ targets: [rel], before, after: { [rel]: await store.snapshotContent(rel) } });
      }
      return done(await recorded(store, [rel], run)); // a knowledge file can change what the index says
    },
  };
}

/** Why a request is neither of `SaveInput`'s two shapes, or null when it is one of them. */
function shapeError(input: SaveInput): string | null {
  const hasText = input.text !== undefined;
  const hasBody = input.body !== undefined;
  if (hasText === hasBody) return "A save carries either the whole text, or the frontmatter and the body — one of the two.";
  if (hasText && input.fields != null) return "A save of the whole text carries no separate frontmatter.";
  if (hasBody && !input.path.endsWith(".md")) return `${input.path} has no frontmatter to separate; a save of it carries the whole text.`;
  return null;
}

/** Key order is not meaning: a table that sends the same values in another order changed nothing. */
const sameData = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/**
 * The route's call: refuse a malformed shape, answer an unchanged save without a batch, and run the
 * rest. The comparison is repeated inside the batch, so a write landing between the two still loses.
 */
export async function saveDocument(store: Store, input: SaveInput): Promise<{ unchanged: true; version: string } | (BatchResult & { unchanged: false; version: string })> {
  const shape = shapeError(input);
  if (shape) throw new StoreError("invalid", shape);

  const rel = input.path;
  if (input.base !== null && (await store.files.exists(rel))) {
    const bytes = await store.files.readBinary(rel);
    checkBase(rel, bytes, input.base);
    const text = bytes.toString("utf8");
    let unchanged = input.text !== undefined && input.text === text;
    if (input.body !== undefined && looksLikeText(bytes)) {
      try {
        const was = splitFrontmatter(text);
        unchanged = was.body === input.body && (input.fields == null || sameData(cleared(input.fields), cleared(was.data)));
      } catch {
        unchanged = false; // a block that will not parse cannot be "the same" as a table
      }
    }
    if (unchanged) return { unchanged: true, version: input.base };
  }

  let version = "";
  const result = await runBatch({
    actor: "user",
    scope: "user",
    summary: `${input.base === null ? "create" : "save"} ${rel}`,
    commitPrefix: commitPrefixFor(rel),
    actions: [saveAction(input, undefined, (taken) => (version = taken))],
  });
  return { ...result, unchanged: false, version };
}

export interface ToggleInput {
  path: string;
  /** The line of the body, counted from zero. */
  line: number;
  /** That line as the page drew it. */
  expected: string;
}

/**
 * Tick or untick one checkbox in a body — §10.2's "one action per click". If the line is no longer
 * what the page drew, nothing is written. No `base` is asked for, so two quick clicks on two boxes
 * both land: what has to be unchanged is the line clicked, not the whole file. The check, the flip and
 * the write all happen inside the batch, where nothing else can write in between.
 */
export function toggleAction(input: ToggleInput, written?: (version: string) => void): ActionSpec {
  const rel = input.path;
  const box = CHECKBOX.exec(input.expected);
  const ticking = box?.[2] === " ";
  const item = input.expected.slice(box?.[0].length ?? 0).trim().replace(/\s*→\s*\[\[t_\d{8}_[0-9a-f]{4}\]\]$/, "").slice(0, 60);
  const summary = `${ticking ? "Tick" : "Untick"} '${item}' in '${nameOf(rel)}'`;
  return {
    type: typeFor(policyFor(rel, { text: true })),
    summary,
    apply: async (store: Store) => {
      if (box === null) throw new StoreError("invalid", `Line ${input.line + 1} of ${rel} is not a checkbox.`);
      if (!(await store.files.exists(rel))) throw new StoreError("not_found", `${rel} does not exist.`);
      const bytes = await store.files.readBinary(rel);
      const lines = splitFrontmatter(bytes.toString("utf8")).body.split("\n");
      if (lines[input.line] !== input.expected) {
        throw new StoreError("conflict", `That checkbox's line in ${rel} changed after the page was drawn, so nothing was saved. Reopen the file.`);
      }
      lines[input.line] = `${box[1]}${ticking ? "x" : " "}${box[3]}${input.expected.slice(box[0].length)}`;
      return saveAction({ path: rel, base: versionOf(bytes), fields: null, body: lines.join("\n") }, summary, written).apply(store);
    },
  };
}

export async function toggleCheckbox(store: Store, input: ToggleInput): Promise<BatchResult & { version: string }> {
  let version = "";
  const action = toggleAction(input, (taken) => (version = taken));
  const result = await runBatch({
    actor: "user",
    scope: "user",
    summary: action.summary[0].toLowerCase() + action.summary.slice(1), // batch summaries are lower-case
    commitPrefix: commitPrefixFor(input.path),
    actions: [action],
  });
  return { ...result, version };
}
