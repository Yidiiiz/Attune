// Owns: the tree both the Knowledge and Files panels draw (PROJECT.md §10.2: "the same component, fed
// different `TreeNode[]` arrays"). A folder expands. A file opens in the document view. A file with
// children, which is what a map is in the Knowledge tree, does both: its name opens it and its
// chevron expands the notes it links to.
//
// The expanded set is remembered per tree under `storageKey`, read after mount (`remember.ts`). The
// open document's row is marked `aria-current`, which is how a reader finds it again in a long tree.
//
// Failure behavior: none of its own. It draws what it is given; an empty tree says so.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TreeNode } from "@/lib/store/files";
import { readStored, writeStored } from "./remember.ts";
import styles from "./Browser.module.css";

export interface TreeProps {
  nodes: TreeNode[];
  /** Where this tree's expanded folders are remembered. */
  storageKey: string;
  /** The path of the open document, if it is in this tree. */
  active: string | null;
  hrefFor: (path: string) => string;
}

export default function Tree({ nodes, storageKey, active, hrefFor }: TreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => setExpanded(new Set(readStored<string[]>(storageKey, []))), [storageKey]);

  const toggle = (path: string): void => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpanded(next);
    writeStored(storageKey, [...next]);
  };

  if (nodes.length === 0) return <p className={styles.treeEmpty}>Nothing here yet.</p>;

  const draw = (list: TreeNode[], depth: number) => (
    <ul className={styles.treeList} role={depth === 0 ? "tree" : "group"}>
      {list.map((node) => {
        const open = expanded.has(node.path);
        const opens = node.children !== undefined && (node.type === "dir" || node.children.length > 0);
        const indent = { paddingLeft: `${8 + depth * 14}px` };
        const chevron = opens ? (
          <button
            type="button"
            className={styles.treeChevron}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
            aria-expanded={open}
            onClick={() => toggle(node.path)}
          >
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </button>
        ) : (
          <span className={styles.treeChevron} aria-hidden="true" />
        );

        return (
          <li key={node.path} role="treeitem" aria-expanded={opens ? open : undefined} aria-selected={node.path === active}>
            {node.type === "dir" ? (
              <div className={styles.treeRow} style={indent} data-folder={node.path}>
                {chevron}
                <button type="button" className={styles.treeFolder} onClick={() => toggle(node.path)}>
                  {node.name}
                </button>
              </div>
            ) : (
              <div className={styles.treeRow} style={indent} data-file={node.path}>
                {chevron}
                <Link
                  className={styles.treeFile}
                  href={hrefFor(node.path)}
                  aria-current={node.path === active ? "page" : undefined}
                  title={node.path}
                >
                  {node.name}
                </Link>
              </div>
            )}
            {opens && open ? draw(node.children ?? [], depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  return draw(nodes, 0);
}
