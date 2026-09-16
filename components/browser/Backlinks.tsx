// Owns: "Linked from" at the bottom of a document (PROJECT.md §10.2) — every file that links to it,
// from the link index, which now notices edits the app did not make (Decision 90). A conversation
// opens as itself, anything else as a document. The graph's edges into a node are these same
// linkers by construction (`lib/knowledge/graph.ts`).
//
// Failure behavior: the index's `errors` are shown, not swallowed. "Nothing links here" and "the
// files I could read don't link here" are different answers, and the second is the one given when a
// file would not parse (AGENTS.md Conventions).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { send as get } from "@/components/tasks/writes";
import { linkerHref } from "./href.ts";
import styles from "./Browser.module.css";

interface Linker {
  path: string;
  title: string;
  kind: string;
}

export default function Backlinks({ path, conversation }: { path: string; conversation: string | null }) {
  const [found, setFound] = useState<{ linkers: Linker[]; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void get(`/api/knowledge/backlinks?path=${encodeURIComponent(path)}`, { method: "GET" }).then((answer) => {
      if (!live) return;
      if (answer.error !== null) setError(answer.error);
      else setFound({ linkers: answer.data.linkers as Linker[], errors: answer.data.errors as string[] });
    });
    return () => {
      live = false;
    };
  }, [path]);

  return (
    <section className={styles.backlinks} data-ui="backlinks" aria-label="Linked from">
      <h2 className={styles.backlinksTitle}>Linked from</h2>
      {error !== null ? (
        <p className={styles.panelError} role="alert">The links to this file could not be read — {error}</p>
      ) : found === null ? (
        <p className={styles.muted}>Reading…</p>
      ) : (
        <>
          {found.linkers.length === 0 ? (
            <p className={styles.muted}>{found.errors.length === 0 ? "Nothing links here." : "Nothing the app could read links here."}</p>
          ) : (
            <ul className={styles.backlinkList}>
              {found.linkers.map((linker) => (
                <li key={linker.path} data-file={linker.path}>
                  <Link href={linkerHref(linker.path, conversation)}>{linker.title}</Link>
                  <span className={styles.backlinkKind}>{linker.kind}</span>
                </li>
              ))}
            </ul>
          )}
          {found.errors.length > 0 ? (
            <p className={styles.panelNote} role="note" data-ui="backlink-errors">
              Could not read {found.errors.join(", ")}; if one of them links here, it is not listed.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
