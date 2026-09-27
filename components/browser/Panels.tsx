// Owns: rail panels 2 and 3 of PROJECT.md §10.2, Knowledge and Files — each a `Tree` over what its
// route returns. Knowledge is the curated tree the maps make (`/api/knowledge/tree`). Files is the raw
// tree under `data/`, or with "Whole repo" on, git's tracked files outside it (`/api/files/tree`,
// Decision 88). A credential-shaped name is never in either, because the routes leave it out.
//
// Each panel reads its tree when it mounts, which is whenever the rail shows it. Links carry the open
// conversation (`?c=`), so a document opened from here has a way back to it, and nothing here adopts a
// server render (Decision 69).
//
// **Files writes, and only through the menu on a row** (§10.2): New file, New folder, Rename, Delete,
// each one batch and each undoable. What is allowed is still the builder's to say, and the route now
// says it for each row as well, so the menu disables what will not work and shows the policy's own
// reason (Decision 105); outside `data/` it says the tree is read-only instead. A refusal that
// arrives anyway is still shown — a policy read when the tree was drawn is a moment old, and it does
// not cover the link check a rename makes. A change that landed re-reads the tree, by the revision
// below — the tree is client-read, so `router.refresh()` would not touch it.
//
// Failure behavior: a tree that cannot be read says why in the panel and leaves the rest of the page
// alone. The Knowledge tree also names the files the link index could not read, since a map it
// skipped is one whose notes are missing from the tree (AGENTS.md Conventions).

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { send as get } from "@/components/tasks/writes";
import type { TreeNode } from "@/lib/store/files";
import { documentHref } from "./href.ts";
import type { Where } from "./href.ts";
import FileMenu, { NameForm } from "./FileMenu.tsx";
import type { RowPolicy } from "./FileMenu.tsx";
import { readStored, useRememberedScroll, writeStored } from "./remember.ts";
import Tree from "./Tree.tsx";
import { useFileOps } from "./useFileOps.ts";
import chat from "@/components/chat/Chat.module.css";
import styles from "./Browser.module.css";

interface Loaded {
  tree: TreeNode[];
  errors: string[];
  /** What each row may do, by path — the data tree only (Decision 105). */
  policies: Record<string, RowPolicy>;
}

/** Read `url` once per change of it or of `revision`; a read that finishes after a newer one is dropped. */
function useTree(url: string, revision = 0): { loaded: Loaded | null; error: string | null } {
  const [state, setState] = useState<{ url: string; loaded: Loaded | null; error: string | null }>({ url, loaded: null, error: null });
  useEffect(() => {
    let live = true;
    void get(url, { method: "GET" }).then((answer) => {
      if (!live) return;
      if (answer.error !== null) setState({ url, loaded: null, error: answer.error });
      else
        setState({
          url,
          loaded: {
            tree: answer.data.tree as TreeNode[],
            errors: (answer.data.errors as string[] | undefined) ?? [],
            policies: (answer.data.policies as Record<string, RowPolicy> | undefined) ?? {},
          },
          error: null,
        });
    });
    return () => {
      live = false;
    };
  }, [url, revision]);
  return state.url === url ? state : { loaded: null, error: null };
}

/** What the address says is open, and the conversation to carry. */
function useOpen(): { path: string | null; where: Where; conversation: string | null } {
  const params = useSearchParams();
  return { path: params.get("open"), where: params.get("repo") === "1" ? "repo" : "data", conversation: params.get("c") };
}

function TreeBody({ name, loaded, error, children }: { name: string; loaded: Loaded | null; error: string | null; children: React.ReactNode }) {
  const scroller = useRememberedScroll(`browser.scroll.${name}`, loaded !== null);
  return (
    <div className={chat.panelList} ref={scroller}>
      {error !== null ? (
        <p className={styles.panelError} role="alert">
          The tree could not be read — {error}
        </p>
      ) : loaded === null ? (
        <p className={styles.treeEmpty}>Reading…</p>
      ) : (
        <>
          {loaded.errors.length > 0 ? (
            <p className={styles.panelNote} role="note" data-ui="tree-errors">
              Could not read {loaded.errors.join(", ")}, so anything only they link to is missing here.
            </p>
          ) : null}
          {children}
        </>
      )}
    </div>
  );
}

export function KnowledgePanel() {
  const open = useOpen();
  const { loaded, error } = useTree("/api/knowledge/tree");
  return (
    <div className={chat.panel} data-ui="knowledge-panel">
      <div className={chat.panelHead}>
        <h2 className={styles.panelTitle}>Knowledge</h2>
      </div>
      <TreeBody name="knowledge" loaded={loaded} error={error}>
        <Tree
          nodes={loaded?.tree ?? []}
          storageKey="browser.expanded.knowledge"
          active={open.where === "data" ? open.path : null}
          hrefFor={(path) => documentHref(path, "data", open.conversation)}
        />
      </TreeBody>
    </div>
  );
}

export function FilesPanel() {
  const open = useOpen();
  const [whole, setWhole] = useState(false);
  useEffect(() => setWhole(readStored<boolean>("browser.wholeRepo", false)), []);
  const where: Where = whole ? "repo" : "data";
  const [revision, setRevision] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const ops = useFileOps(() => setRevision((n) => n + 1));
  const { loaded, error } = useTree(whole ? "/api/files/tree?all=1" : "/api/files/tree", revision);

  return (
    <div className={chat.panel} data-ui="files-panel">
      <div className={chat.panelHead}>
        <h2 className={styles.panelTitle}>Files</h2>
        <label className={styles.wholeRepo}>
          <input
            type="checkbox"
            checked={whole}
            data-ui="whole-repo"
            onChange={(event) => {
              setWhole(event.target.checked);
              writeStored("browser.wholeRepo", event.target.checked);
            }}
          />
          Whole repo
        </label>
      </div>
      <TreeBody key={where} name={where === "repo" ? "repo" : "files"} loaded={loaded} error={error}>
        <Tree
          nodes={loaded?.tree ?? []}
          storageKey={`browser.expanded.${where === "repo" ? "repo" : "files"}`}
          active={open.where === where ? open.path : null}
          hrefFor={(path) => documentHref(path, where, open.conversation)}
          menu={(node) => (
            <FileMenu
              path={node.path}
              name={node.name}
              isFolder={node.type === "dir"}
              policy={loaded?.policies[node.path] ?? null}
              open={menuFor === node.path}
              onOpen={(on) => setMenuFor(on ? node.path : null)}
              ops={ops}
            />
          )}
          under={(node) => (ops.asking?.path === node.path ? <NameForm asking={ops.asking} ops={ops} /> : null)}
        />
      </TreeBody>
    </div>
  );
}
