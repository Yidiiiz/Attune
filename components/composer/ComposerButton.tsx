// Owns: the + button and the fact of the sheet being open (PROJECT.md §9.1). Mounted by the Today
// and Calendar pages and by neither the Chat page nor the layout — §15's "the + button is absent on
// Chat, present on Today and Calendar" is enforced by where this is rendered, which is the only
// place it can be enforced without a component asking which route it is on.
//
// It also exports `openComposer`, the way a task row's "Ask about this" reaches the sheet. The bus
// is a module-level Set, copied deliberately from `components/shell/Toast.tsx` rather than
// abstracted with it: two callers is not three (§1), and a context provider would buy nothing here
// either — nothing below needs to re-render when the sheet opens, and the state has exactly one
// reader. When a third bus appears, that is the moment to extract one.
//
// Failure behavior: user requests made during a route mount gap are delivered once to
// the arriving host. Nothing opens without a user request.

"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import ComposerSheet from "./ComposerSheet";
import { isMode, MODE_KEY } from "./draft";
import type { Mode } from "./draft";
import type { Settings } from "@/lib/store/settings";
import styles from "./Composer.module.css";

export interface OpenRequest {
  mode?: Mode;
  /** "Ask about this" on a row: the sheet opens in Ask mode carrying this task (§9.6). */
  task?: { id: string; title: string };
}

type Listener = (request: OpenRequest) => void;

const listeners = new Set<Listener>();
let pending: OpenRequest | null = null;

/** Open the composer from anywhere on the client. Safe to call before the host mounts. */
export function openComposer(request: OpenRequest = {}): void {
  // A keyboard request during a route's mount gap belongs to the arriving page.
  if (listeners.size === 0) { pending = request; return; }
  for (const listener of listeners) listener(request);
}

export interface ComposerButtonProps {
  hiddenButton?: boolean;
  categories: string[];
  models: Settings["models"];
  /** The day this page is showing, so the context carries the right view block (§13.1). */
  viewDate?: string;
}

export default function ComposerButton({ categories, viewDate, models, hiddenButton = false }: ComposerButtonProps) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>("tasks");
  const [askingAbout, setAskingAbout] = useState<{ id: string; title: string } | undefined>(undefined);

  // §9.3: the last-used mode is remembered per tab. Read after mount, so the server render and the
  // first client render agree on the default (Decision 19).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODE_KEY);
      if (isMode(stored)) setMode(stored);
    } catch {
      // a browser refusing storage is not a reason to fail the page
    }
  }, []);

  useEffect(() => {
    const listener: Listener = (request) => {
      if (request.task !== undefined) setAskingAbout(request.task);
      if (request.mode !== undefined) chooseMode(request.mode);
      setOpen(true);
    };
    listeners.add(listener);
    if (pending) { const request = pending; pending = null; listener(request); }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  function chooseMode(next: Mode): void {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // as above
    }
  }

  function close(): void {
    setOpen(false);
    // The task the sheet was opened about belongs to that opening, not to the next one.
    setAskingAbout(undefined);
  }

  return (
    <>
      <ComposerSheet
        toggleRef={toggle}
        open={open}
        mode={mode}
        onMode={chooseMode}
        onClose={close}
        categories={categories}
        models={models}
        {...(viewDate === undefined ? {} : { viewDate })}
        {...(askingAbout === undefined ? {} : { askingAbout })}
      />

      {hiddenButton && !open ? null : <button
        type="button"
        className={`${styles.button} ${open ? styles.buttonOpen : ""}`}
        ref={toggle}
        data-composer="button"
        aria-expanded={open}
        aria-label={open ? "Close composer" : "Open composer"}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className={styles.glyph} aria-hidden="true">
          <Icon name="plus" size={24} />
        </span>
      </button>}
    </>
  );
}
