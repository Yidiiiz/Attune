// Owns: rail panels 2 and 3 of PROJECT.md §10.2, Knowledge and Files — each a `Tree` over what its
// route returns. Knowledge is the curated tree the maps make (`/api/knowledge/tree`). Files is the raw
// tree under `data/`, or with "Whole repo" on, git's tracked files outside it (`/api/files/tree`,
// Decision 88). A credential-shaped name is never in either, because the routes leave it out.
//
// Each panel reads its tree when it mounts, which is whenever the rail shows it, and that is the whole
// of its data flow: nothing here writes, and nothing here adopts a server render (Decision 69). Links
// carry the open conversation (`?c=`), so a document opened from here has a way back to it.
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
import { readStored, useRememberedScroll, writeStored } from "./remember.ts";
import Tree from "./Tree.tsx";
import chat from "@/components/chat/Chat.module.css";
import styles from "./Browser.module.css";

interface Loaded {
  tree: TreeNode[];
  errors: string[];
}

/** Read `url` once per change of it; a read that finishes after a newer one started is dropped. */
function useTree(url: string): { loaded: Loaded | null; error: string | null } {
  const [state, setState] = useState<{ url: string; loaded: Loaded | null; error: string | null }>({ url, loaded: null, error: null });
  useEffect(() => {
    let live = true;
    void get(url, { method: "GET" }).then((answer) => {
      if (!live) return;
      if (answer.error !== null) setState({ url, loaded: null, error: answer.error });
      else setState({ url, loaded: { tree: answer.data.tree as TreeNode[], errors: (answer.data.errors as string[] | undefined) ?? [] }, error: null });
    });
    return () => {
      live = false;
    };
  }, [url]);
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
  const { loaded, error } = useTree(whole ? "/api/files/tree?all=1" : "/api/files/tree");

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
        />
      </TreeBody>
    </div>
  );
}
