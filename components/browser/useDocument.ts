// Owns: the open document's state (PROJECT.md §10.2) — one file as `/api/files/read` returns it.
//
// **`reload()` is the only way in, and it is ordered by issue** (Decisions 69 and 70). The page never
// server-renders a document into this state: `app/chat/page.tsx` hands over a path and nothing else,
// and the view is keyed by that path, so opening another file is a remount rather than an update.
// A read that returns after a later one has already been adopted is dropped, which is what keeps a
// click's re-read from being undone by an older one. Nothing here calls `router.refresh()`, the route
// by which amendment `u`'s stale render reaches the chat pane; the document view is the surface the
// owner expects a third form of `u` on, and this is why it should not have one.
//
// **It re-reads when the window is focused**, which is Decision 20's second half and AGENTS.md
// amendment `q` (targeted here for the reason recorded with it: "I edited this file in VS Code and
// came back" is the document view's ordinary Tuesday). It goes through `reload` and never through a
// server render, so an answer that arrives after a newer one is dropped rather than adopted — the
// two ways of getting this wrong were both named in advance, and this is the one that is safe.
//
// Failure behavior: a read that fails leaves `error` saying why and keeps whatever was shown before,
// so a hiccup does not blank a document someone is reading.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { send as get } from "@/components/tasks/writes";
import type { Where } from "./href.ts";

/** What the document view may do with a file, as the read route reports it (Decision 86). Each
 * refusal is a sentence, or null where the action is allowed. */
export interface DocumentPolicy {
  kind: string;
  save: string | null;
  create: string | null;
  rename: string | null;
  remove: string | null;
  fields: boolean;
}

export interface OpenDocument {
  path: string;
  where: Where;
  kind: "markdown" | "text" | "image" | "binary";
  size: number;
  version: string;
  policy: DocumentPolicy;
  fields?: Record<string, unknown>;
  body?: string;
  /** A text file, or a markdown file whose frontmatter would not parse. */
  text?: string;
  frontmatterError?: string;
}

export interface DocumentState {
  doc: OpenDocument | null;
  error: string | null;
  reload: () => Promise<void>;
}

export function useDocument(path: string, where: Where): DocumentState {
  const [state, setState] = useState<{ doc: OpenDocument | null; error: string | null }>({ doc: null, error: null });
  const issued = useRef(0);
  const applied = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    issued.current += 1;
    const ticket = issued.current;
    const params = new URLSearchParams({ path });
    if (where === "repo") params.set("repo", "1");
    const answer = await get(`/api/files/read?${params.toString()}`, { method: "GET" });
    if (ticket <= applied.current) return;
    applied.current = ticket;
    setState((previous) =>
      answer.error !== null ? { doc: previous.doc, error: answer.error } : { doc: answer.data as unknown as OpenDocument, error: null },
    );
  }, [path, where]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onFocus = (): void => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  return { ...state, reload };
}
