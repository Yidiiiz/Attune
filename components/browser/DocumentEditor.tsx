// Owns: the editing half of the document view (PROJECT.md §10.2) — a monospace textarea holding the
// file's body exactly as it is on disk, and `Ctrl/Cmd+S`.
//
// **Nothing is rendered or reformatted here**, which is the point: §15 asks that a LaTeX sheet go
// through Edit and Save and keep its SHA-256, and the only way to promise that is for the editor to
// be the bytes. The markdown pipeline runs on the preview side and never touches this text.
//
// Failure behavior: none of its own. A save that is refused is the caller's to show, and the text
// stays here while it does.

"use client";

import { useEffect, useRef } from "react";
import styles from "./Browser.module.css";

export interface DocumentEditorProps {
  value: string;
  onChange: (text: string) => void;
  /** `Ctrl/Cmd+S`, which is the same save the strip's button runs. */
  onSave: () => void;
  busy: boolean;
}

export default function DocumentEditor({ value, onChange, onSave, busy }: DocumentEditorProps) {
  const box = useRef<HTMLTextAreaElement>(null);

  // Focus on mount, with `preventScroll`: the toggle sits at the top of a scrolled document, and a
  // focus that jumps the page is the thing §16.4's composer already had to avoid.
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  return (
    <textarea
      ref={box}
      className={styles.editor}
      data-ui="document-editor"
      value={value}
      spellCheck={false}
      disabled={busy}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          onSave();
        }
      }}
    />
  );
}
