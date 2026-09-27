// Owns: the Files panel's per-row menu (PROJECT.md §10.2) — the `⋯` the tree's operations hang off,
// and the one-line form that asks for a name.
//
// It is the Chats panel's row menu in a second place rather than a new pattern: the same `⋯`, the
// same inline rename box, the same `Enter` to accept and `Escape` to cancel. **Outside `data/` the
// menu says why there is nothing in it**, which §10.2 asks for by name — a tree row with no menu at
// all would read as an oversight rather than as a rule.
//
// **An entry the write policy forbids for this row is disabled and says why** (Decision 105). The
// reasons are the policy's own sentences, handed down with the tree by `/api/files/tree`, so this
// component holds no rule of its own and cannot drift from the builder that enforces them. It is
// display: the server refuses the same things whether or not a menu was ever drawn.
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

/**
 * What `/api/files/tree` says this row may do, straight from `lib/history/write-policy.ts`. Null is
 * allowed; a string is the policy's own reason it is not. Declared here because §3 keeps
 * `lib/history/` closed to components, value and type alike: this is the wire shape, not the rules.
 */
export interface RowPolicy {
  rename: string | null;
  remove: string | null;
  newFile: string | null;
  newFolder: string | null;
}

export interface FileMenuProps {
  path: string;
  name: string;
  isFolder: boolean;
  /** The policy for this row, or null outside `data/`, where nothing is written at all (§10.2). */
  policy: RowPolicy | null;
  open: boolean;
  onOpen: (open: boolean) => void;
  ops: FileOps;
}

/** One entry: the action when the policy allows it, the reason when it does not. */
function Entry({ id, label, why, run }: { id: string; label: string; why: string | null; run: () => void }) {
  return (
    <button type="button" data-ui={id} disabled={why !== null} title={why ?? undefined} onClick={run}>
      {label}
      {why === null ? null : <span className={styles.menuWhy}>{why}</span>}
    </button>
  );
}

export default function FileMenu({ path, name, isFolder, policy, open, onOpen, ops }: FileMenuProps) {
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
          {policy === null ? (
            <p className={styles.menuNote} data-ui="file-menu-note">
              Outside data/ the tree is read-only.
            </p>
          ) : (
            <>
              {isFolder ? (
                <>
                  <Entry id="new-file" label="New file" why={policy.newFile} run={() => choose("new-file")} />
                  <Entry id="new-folder" label="New folder" why={policy.newFolder} run={() => choose("new-folder")} />
                </>
              ) : null}
              <Entry id="rename" label="Rename" why={policy.rename} run={() => choose("rename", name)} />
              <Entry id="delete" label="Delete" why={policy.remove} run={() => void ops.remove(path)} />
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
