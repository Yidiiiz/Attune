// Owns: the Files panel's four operations (PROJECT.md §10.2, §14's `/api/files/op` and the create
// half of `/api/files/write`) — New file, New folder, Rename and Delete, as the panel runs them.
//
// **What is allowed is the builder's answer, not this hook's** (Decision 86). The tree route reports
// names and kinds, not policy, so the menu offers the same entries everywhere under `data/` and the
// refusal comes back as a sentence from `write-policy.ts` — "a note cannot be renamed here", "new
// folders go under files/ or knowledge/notes/". That keeps one source for the rules, and it is why a
// refusal here has to be *shown* rather than swallowed.
//
// §13.5 decides where each one is shown, and the two differ: a rename or a create has an input on
// screen, so its refusal goes inline beside what was typed and the name stays; a delete is fired from
// a row menu, which has no on-screen origin, so it raises a toast naming what did not happen.
//
// Failure behavior: every refusal lands in one of those two places, nothing is written optimistically,
// and the tree is re-read only after a change actually landed.

"use client";

import { useState } from "react";
import { reportFailure, send } from "@/components/tasks/writes";

export type OpKind = "rename" | "new-file" | "new-folder";

export interface Asking {
  kind: OpKind;
  /** The file being renamed, or the folder the new thing goes in. */
  path: string;
  value: string;
  error: string | null;
}

export interface FileOps {
  asking: Asking | null;
  busy: boolean;
  start: (kind: OpKind, path: string, initial?: string) => void;
  change: (value: string) => void;
  cancel: () => void;
  submit: () => Promise<void>;
  remove: (path: string) => Promise<void>;
}

const nameOf = (path: string): string => path.split("/").pop() ?? path;

export function useFileOps(onChanged: () => void): FileOps {
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (asking === null || busy) return;
    const name = asking.value.trim();
    if (name.length === 0) {
      setAsking({ ...asking, error: "Type a name." });
      return;
    }
    setBusy(true);
    const answer =
      asking.kind === "rename"
        ? await send("/api/files/op", { method: "POST", body: JSON.stringify({ op: "rename", path: asking.path, name }) })
        : asking.kind === "new-folder"
          ? await send("/api/files/op", { method: "POST", body: JSON.stringify({ op: "mkdir", path: `${asking.path}/${name}` }) })
          : // A new file is a save of nothing against a path that must not exist yet (`base: null`).
            await send("/api/files/write", {
              method: "PUT",
              body: JSON.stringify({ path: `${asking.path}/${name}`, base: null, text: "" }),
            });
    setBusy(false);
    if (answer.error !== null) {
      setAsking({ ...asking, error: answer.error });
      return;
    }
    setAsking(null);
    onChanged();
  }

  async function remove(path: string): Promise<void> {
    if (!window.confirm(`Delete ${path}? This is undoable from the history.`)) return;
    setBusy(true);
    const answer = await send("/api/files/op", { method: "POST", body: JSON.stringify({ op: "delete", path }) });
    setBusy(false);
    if (answer.error !== null) reportFailure(`${nameOf(path)} was not deleted`, answer.error);
    else onChanged();
  }

  return {
    asking,
    busy,
    start: (kind, path, initial = "") => setAsking({ kind, path, value: initial, error: null }),
    change: (value) => setAsking((current) => (current === null ? current : { ...current, value })),
    cancel: () => setAsking(null),
    submit,
    remove,
  };
}
