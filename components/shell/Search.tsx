// Owns: the top bar's search field (PROJECT.md §10.0) — the box, `Ctrl/Cmd+K`, and the list of hits
// under it. The scoring, the bound on a body subsequence and the order are `lib/knowledge/search.ts`'s
// (Decision 87); this asks `/api/search` and draws what comes back.
//
// **Each hit carries its own `href`**, which the route puts there precisely so this does not have to
// know that a conversation opens as a conversation and everything else opens as a document. A box
// that re-derived that would be a second place to fix when an address changes.
//
// **Typing is debounced, and a late answer is dropped.** The scan reads files, so a keystroke is not
// free, and answers can arrive out of order — the same ticket rule the document view uses (Decision
// 97), for the same reason: the newest query is the only one whose results are the truth.
//
// Failure behavior: a search that fails says so under the box and leaves the last results alone; a
// scan that skipped a file it could not parse says the list may be missing something, rather than
// showing a partial list as the whole (§6.5's habit, and the Conventions rule about lenient readers).

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { send as get } from "@/components/tasks/writes";
import styles from "./Tabs.module.css";

interface Hit {
  kind: "task" | "note" | "collection" | "conversation";
  title: string;
  path: string;
  href: string;
}

/** Long enough that a scan is worth running, short enough not to feel like waiting. */
const PAUSE = 180;

export default function Search() {
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const issued = useRef(0);

  // §10.0's one global key. It is on `document` because the point of it is to reach the box from
  // anywhere on the page, including from inside another input.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        box.current?.focus();
        box.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length === 0) {
      setHits([]);
      setSkipped([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      issued.current += 1;
      const ticket = issued.current;
      void get(`/api/search?q=${encodeURIComponent(text)}`, { method: "GET" }).then((answer) => {
        if (ticket !== issued.current) return; // a newer query is already out
        if (answer.error !== null) {
          setError(answer.error);
          return;
        }
        setError(null);
        setHits((answer.data.hits as Hit[] | undefined) ?? []);
        setSkipped((answer.data.skipped as string[] | undefined) ?? []);
      });
    }, PAUSE);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (href: string): void => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <div className={styles.search} data-ui="search">
      <input
        ref={box}
        type="search"
        className={styles.searchInput}
        placeholder="Search"
        aria-label="Search"
        value={query}
        data-ui="search-input"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            box.current?.blur();
          }
          if (event.key === "Enter" && hits.length > 0) go(hits[0].href);
        }}
        // A click on a result must land before the list goes, so the close waits a frame.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />

      {open && query.trim().length > 0 ? (
        <div className={styles.results} data-ui="search-results">
          {error !== null ? (
            <p className={styles.searchNote} role="alert">
              The search failed — {error}
            </p>
          ) : hits.length === 0 ? (
            <p className={styles.searchNote}>Nothing matches.</p>
          ) : (
            <ul className={styles.resultList}>
              {hits.map((hit) => (
                <li key={`${hit.kind}:${hit.path}`}>
                  <button type="button" className={styles.result} data-result={hit.path} onClick={() => go(hit.href)}>
                    <span className={styles.resultKind}>{hit.kind}</span>
                    <span className={styles.resultTitle}>{hit.title || hit.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {skipped.length > 0 ? (
            <p className={styles.searchNote} role="note" data-ui="search-skipped">
              {skipped.length} file{skipped.length === 1 ? "" : "s"} could not be read, so something may be missing.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
