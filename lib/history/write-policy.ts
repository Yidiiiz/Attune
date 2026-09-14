// Owns: what the document view may do to a file, by where the file is — save, create, rename, delete,
// and whether its frontmatter is editable (the Phase 8 approval, open call 4, recorded in AGENTS.md
// as the table below). The builders in `file-actions.ts` enforce it inside the batch, and the read
// route reports it so the view can show only what will work: **the view decides what to show; the
// builder decides what is allowed.** A request that skips the view gets the same refusal.
//
//   tasks/                                save through writeTask (id fixed) · no create here (New task
//                                          is POST /api/tasks) · rename if nothing links · delete
//   knowledge/notes/                      save · create with a map · never rename · delete
//   knowledge/maps/, collections/         save · create · rename if nothing links · delete
//   knowledge/profile/                    body only · no create, rename or delete
//   knowledge/sessions/                   save · no create or rename · delete
//   files/ (text)                         save · create · rename if nothing links · delete
//   files/ (binary)                       rename if nothing links · delete
//   knowledge/index.md, files/index.md,   read-only
//     chats/, history/, settings/, and anything outside data/ or credential-shaped
//
// "If nothing links" is checked against the link index when the rename runs, not here: this module
// is pure and knows only the path.
//
// Failure behavior: none. Every answer is either null (allowed) or the sentence the refusal shows.

import { credentialPath, credentialRefusal } from "../security/credential-paths.ts";

export type DocKind = "task" | "note" | "map" | "collection" | "profile" | "session" | "file" | "readonly";

export interface Policy {
  kind: DocKind;
  /** Null when allowed; otherwise why not, as the refusal says it. */
  save: string | null;
  create: string | null;
  rename: string | null;
  remove: string | null;
  /** Whether the frontmatter table may be edited, as opposed to shown. */
  fields: boolean;
}

const RENAME_NOTE =
  "A note cannot be renamed here: §6.3 has every note linked from a map, so a rename would always " +
  "leave that link pointing at nothing, and the app cannot rewrite links yet (AGENTS.md amendment v).";

function readOnly(why: string): Policy {
  return { kind: "readonly", save: why, create: why, rename: why, remove: why, fields: false };
}

const allowed = (kind: DocKind, fields = true): Policy => ({ kind, save: null, create: null, rename: null, remove: null, fields });

/**
 * The policy for a `data/`-relative file path. `text` says whether the file's bytes are text, which
 * only matters under `files/`; everywhere else a record is markdown by construction.
 */
export function policyFor(rel: string, { text }: { text: boolean }): Policy {
  const credential = credentialPath(rel);
  if (credential) return readOnly(credentialRefusal(rel, credential));

  if (rel === "knowledge/index.md") return readOnly("knowledge/index.md is generated from the maps; edit a map instead.");
  if (rel === "files/index.md") return readOnly("files/index.md is generated from the uploads; it is rewritten on every upload.");
  if (rel.startsWith("chats/")) return readOnly("A conversation is changed from the conversation itself; a message once written is not edited.");
  if (rel.startsWith("history/")) return readOnly("The action log is append-only and written by the app alone.");
  if (rel.startsWith("settings/")) return readOnly("Settings are changed on the Settings page.");

  if (/^tasks\/[^/]+\.md$/.test(rel)) {
    return { ...allowed("task"), create: "A task is started with New task, which chooses its file name (Decision 7)." };
  }
  if (/^knowledge\/notes\/.+\.md$/.test(rel)) return { ...allowed("note"), rename: RENAME_NOTE };
  if (/^knowledge\/maps\/[^/]+\.md$/.test(rel)) return allowed("map");
  if (/^knowledge\/collections\/[^/]+\.md$/.test(rel)) return allowed("collection");
  if (/^knowledge\/profile\/[^/]+\.md$/.test(rel)) {
    const fixed = "The three profile files are always part of the assistant's context, so they are not created, renamed or deleted here.";
    return { kind: "profile", save: null, create: fixed, rename: fixed, remove: fixed, fields: false };
  }
  if (/^knowledge\/sessions\/c_[0-9a-z_]+\.md$/.test(rel)) {
    const made = "A session summary is made by Distill to knowledge, and named for its conversation.";
    return { ...allowed("session"), create: made, rename: made };
  }
  if (/^files\/.+/.test(rel)) {
    if (text) return { ...allowed("file"), fields: rel.endsWith(".md") };
    const binary = `${rel} is not a text file, so it is not edited here.`;
    return { ...allowed("file", false), save: binary, create: binary };
  }
  if (rel.startsWith("knowledge/")) {
    return readOnly(`${rel} is not a note, map, profile file, collection or session summary (§4), so it is not written here.`);
  }
  return readOnly(`${rel} is outside the folders the app writes (tasks/, knowledge/, files/).`);
}

/** The §8 commit prefix a change to `rel` is filed under. */
export function commitPrefixFor(rel: string): "task" | "knowledge" | "file" {
  return rel.startsWith("tasks/") ? "task" : rel.startsWith("knowledge/") ? "knowledge" : "file";
}

/** Folders the app may create or delete: under `files/` both; under `knowledge/notes/`, create only. */
export function folderPolicy(rel: string): { create: string | null; remove: string | null } {
  const credential = credentialPath(rel);
  if (credential) {
    const why = credentialRefusal(rel, credential);
    return { create: why, remove: why };
  }
  if (/^files\/.+/.test(rel)) return { create: null, remove: null };
  if (/^knowledge\/notes\/.+/.test(rel)) {
    return { create: null, remove: "A folder of notes is emptied one note at a time, so no note's map link is lost unseen." };
  }
  const why = `New folders go under files/ or knowledge/notes/; ${rel} is not one of those.`;
  return { create: why, remove: `${rel} is one of the folders the app itself keeps, so it is not deleted here.` };
}

/** Why `name` cannot be one file or folder name, or null: one segment, no leading dot, nothing credential-shaped. */
export function nameProblem(name: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name) || name.includes("..") || name.length > 120) {
    return "A name is letters, digits, spaces, dots, hyphens and underscores, not starting with a dot.";
  }
  const credential = credentialPath(name);
  return credential ? credentialRefusal(name, credential) : null;
}

/**
 * Whether `name` may be a new name for a file in the same folder: one path segment, no leading dot,
 * the same extension, and nothing credential-shaped. Null when it may. The extension is fixed for
 * every file, not only records: the raw route serves an image inline only when its bytes and its
 * extension agree, so renaming `x.png` to `x.jpg` would quietly turn a picture into a download.
 */
export function renameTarget(from: string, name: string): string | null {
  const bad = nameProblem(name);
  if (bad) return bad;
  const ext = (rel: string): string => (/\.[^./]+$/.exec(rel)?.[0] ?? "").toLowerCase();
  if (ext(from) !== ext(name)) {
    return `${from} has to keep its ${ext(from) || "missing"} extension; only the part before it can change.`;
  }
  return null;
}
