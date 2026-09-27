// Owns: the unsaved half of the document view (PROJECT.md §10.2) — what has been typed into the body
// or the frontmatter table, whether it differs from the file, and the one save that sends both.
//
// **`base` is captured when editing starts, not when Save is pressed**, because that is what a 409
// means: the bytes the editor opened (Decision 86). The page never hashes anything; it hands the
// same `version` string back and the builder hashes the file again on its side. So a save that is
// refused for a conflict is a real conflict — someone else wrote the file after this editor read it
// — and the text stays in the editor either way (Decision 50, amendment `j`'s rule).
//
// **A draft is not only Edit mode.** The frontmatter table is editable in preview as well, so the
// draft is whatever differs from the file and `editing` is only which half is on screen. One save
// sends the table and the body together, as §10.2 asks, which is also what makes them one action in
// the log.
//
// Failure behavior: a refused save keeps every character and says why beside the buttons that would
// retry it — the surface is on screen, so §13.5 puts the message here rather than in a toast. The
// draft survives a re-read of the file; only a successful save or an explicit discard clears it.

"use client";

import { useCallback, useState } from "react";
import { send } from "@/components/tasks/writes";
import type { OpenDocument } from "./useDocument.ts";

export interface Draft {
  /** `versionOf` the bytes this draft was started from. */
  base: string;
  /** The frontmatter as the table holds it, or null for a file that is edited as whole text. */
  fields: Record<string, unknown> | null;
  /** The body under the frontmatter… */
  body?: string;
  /** …or the whole file, for one with no frontmatter or one whose frontmatter will not parse. */
  text?: string;
}

export interface DocumentDraft {
  editing: boolean;
  draft: Draft | null;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  /** The file changed after this draft started, so Save was refused and nothing was written. */
  conflict: boolean;
  /** Show the editor or the preview. The caller warns first when that would lose something. */
  setEditing: (on: boolean) => void;
  setBody: (text: string) => void;
  setField: (key: string, value: unknown) => void;
  /** Throw the draft away and go back to what is on disk. */
  discard: () => void;
  /** Save the table and the body as one write. True when it landed. */
  save: () => Promise<boolean>;
}

/** The draft a file starts with: its own current contents, so "dirty" is a real comparison. */
function from(doc: OpenDocument): Draft {
  return doc.body !== undefined
    ? { base: doc.version, fields: { ...(doc.fields ?? {}) }, body: doc.body }
    : { base: doc.version, fields: null, text: doc.text ?? "" };
}

/** Same keys, same order, same values — the table never adds or removes a key, so this is enough. */
function sameFields(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function useDocumentDraft(path: string, doc: OpenDocument | null, reload: () => Promise<void>): DocumentDraft {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const change = useCallback(
    (make: (current: Draft) => Draft): void => {
      if (doc === null) return;
      setDraft((current) => make(current ?? from(doc)));
    },
    [doc],
  );

  const dirty =
    doc !== null &&
    draft !== null &&
    (draft.body !== doc.body || draft.text !== doc.text || !sameFields(draft.fields, doc.body === undefined ? null : { ...(doc.fields ?? {}) }));

  const save = useCallback(async (): Promise<boolean> => {
    if (doc === null || draft === null) return false;
    setSaving(true);
    setError(null);
    setConflict(false);
    const payload =
      draft.text !== undefined
        ? { path, base: draft.base, text: draft.text }
        : { path, base: draft.base, fields: draft.fields, body: draft.body };
    const answer = await send("/api/files/write", { method: "PUT", body: JSON.stringify(payload) });
    setSaving(false);
    if (answer.error !== null) {
      setError(answer.error);
      setConflict(answer.data.code === "conflict");
      return false;
    }
    setDraft(null);
    await reload();
    return true;
  }, [doc, draft, path, reload]);

  return {
    editing,
    draft,
    dirty,
    saving,
    error,
    conflict,
    setEditing,
    setBody: (text: string) =>
      change((current) => (current.text !== undefined ? { ...current, text } : { ...current, body: text })),
    setField: (key: string, value: unknown) =>
      change((current) => ({ ...current, fields: { ...(current.fields ?? {}), [key]: value } })),
    discard: () => {
      setDraft(null);
      setError(null);
      setConflict(false);
    },
    save,
  };
}
