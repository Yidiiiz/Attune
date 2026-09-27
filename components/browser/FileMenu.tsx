// Owns: the Files panel's per-row menu (PROJECT.md §10.2) — the `⋯` the tree's operations hang off,
// and the one-line form that asks for a name.
//
// It is the Chats panel's row menu in a second place rather than a new pattern: the same `⋯`, the
// same inline rename box, the same `Enter` to accept and `Escape` to cancel. **Outside `data/` the
// menu says why there is nothing in it**, which §10.2 asks for by name — a tree row with no menu at
// all would read as an oversight rather than as a rule.
//
// "Reveal in graph" is not here. §10.2 lists it, Phase 8b builds the view, and Decision 96 already
// settled what to do in the meantime: an affordance that opens nothing is a dead end drawn on
// purpose, so it arrives with the thing it reveals.
//
// Failure behavior: none of its own. What it asks for goes to `useFileOps`, which shows each refusal
// where §13.5 puts it.

"use client";

import type { Asking, FileOps, OpKind } from "./useFileOps.ts";
import chat from "@/components/chat/Chat.module.css";
import styles from "./Browser.module.css";

export interface FileMenuProps {
  path: string;
  name: string;
  isFolder: boolean;
  /** False outside `data/`, where the tree is read-only until Build mode exists (§10.2). */
  writable: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  ops: FileOps;
}

export default function FileMenu({ path, name, isFolder, writable, open, onOpen, ops }: FileMenuProps) {
  const choose = (kind: OpKind, initial = ""): void => {
    onOpen(false);
    ops.start(kind, path, initial);
  };

  return (
    <>
      <button
        type="button"
        className={chat.rowMenuButton}
        aria-label={`Actions for ${name}`}
        data-ui="file-menu-button"
        onClick={() => onOpen(!open)}
      >
        ⋯
      </button>
      {open ? (
        <div className={chat.rowMenu} data-ui="file-menu">
          {!writable ? (
            <p className={styles.menuNote} data-ui="file-menu-note">
              Outside data/ the tree is read-only.
            </p>
          ) : (
            <>
              {isFolder ? (
                <>
                  <button type="button" data-ui="new-file" onClick={() => choose("new-file")}>
                    New file
                  </button>
                  <button type="button" data-ui="new-folder" onClick={() => choose("new-folder")}>
                    New folder
                  </button>
                </>
              ) : null}
              <button type="button" data-ui="rename" onClick={() => choose("rename", name)}>
                Rename
              </button>
              <button type="button" data-ui="delete" onClick={() => void ops.remove(path)}>
                Delete
              </button>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

/** The one-line form under the row that asked for a name, for all three of the operations that do. */
export function NameForm({ asking, ops }: { asking: Asking; ops: FileOps }) {
  const label =
    asking.kind === "rename" ? "New name" : asking.kind === "new-folder" ? "New folder in" : "New file in";
  return (
    <div className={styles.nameForm}>
      <input
        className={chat.renameInput}
        value={asking.value}
        autoFocus
        aria-label={`${label} ${asking.path}`}
        data-ui="name-input"
        disabled={ops.busy}
        onChange={(event) => ops.change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void ops.submit();
          if (event.key === "Escape") ops.cancel();
        }}
      />
      {asking.error === null ? null : (
        <span className={styles.panelError} role="alert" data-ui="name-error">
          {asking.error}
        </span>
      )}
    </div>
  );
}
