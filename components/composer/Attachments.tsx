// Owns: the attachment half of PROJECT.md §9.2 — the paperclip, the chips, the full-window drop
// overlay, and the upload itself. It is a separate file from `ComposerSheet.tsx` because that one
// crossed the ~300-line cap (AGENTS.md hard rule 5) and this is the seam §9.2 already draws: a
// paragraph of its own, one piece of state, and one request nothing else makes.
//
// Uploads happen immediately, not on send: §9.2 says a dropped file is stored and registered as one
// `file.add` batch straight away, and the chip is the receipt. Removing a chip does not delete the
// file — the batch is in the history and undoing it there is the way to take it back.
//
// Failure behavior: a failed upload reports through `onError` and adds no chip, so the sheet shows
// it inline beside the box like every other error with an on-screen origin (§13.5). It never throws
// into the sheet's own send path: an attachment that did not stick must not cost someone the prompt
// they typed.

"use client";

import { useEffect, useState } from "react";
import styles from "./Composer.module.css";

export interface Attachment {
  name: string;
  /** Relative to `data/`, as it came back from the batch. This is what a task's `links` holds. */
  path: string;
}

export interface AttachmentsProps {
  files: Attachment[];
  onFiles: (files: Attachment[]) => void;
  onError: (message: string) => void;
  /** True while the sheet is open; the window-wide drop target exists only then (§9.2). */
  active: boolean;
  /** Handed back so the textarea's paste-of-files can reach the same upload path. */
  onReady: (attach: (files: File[]) => void) => void;
}

export default function Attachments({ files, onFiles, onError, active, onReady }: AttachmentsProps) {
  const [dragging, setDragging] = useState(false);

  async function upload(chosen: File[]): Promise<void> {
    if (chosen.length === 0) return;
    const form = new FormData();
    for (const file of chosen) form.append("file", file);
    form.append("source", "composer");

    // Not `send()` from `components/tasks/writes.ts`: that one sets a JSON content type, and
    // multipart needs the boundary the browser generates. The §14 response shape is the same.
    try {
      const response = await fetch("/api/files/upload", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) {
        onError(typeof data.error === "string" ? data.error : "The upload did not go through.");
        return;
      }
      const stored = (data.files as Array<{ name: string; path: string | null }>).filter(
        (file): file is Attachment => file.path !== null,
      );
      onFiles([...files, ...stored]);
    } catch (err) {
      onError((err as Error).message);
    }
  }

  const attach = (chosen: File[]): void => void upload(chosen);

  useEffect(() => {
    onReady(attach);
  });

  // §9.2: a drag anywhere on the window while the sheet is open raises the overlay.
  useEffect(() => {
    if (!active) return;
    const onEnter = (event: DragEvent): void => {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) setDragging(true);
    };
    window.addEventListener("dragenter", onEnter);
    return () => window.removeEventListener("dragenter", onEnter);
  }, [active]);

  return (
    <>
      {dragging ? (
        <div
          className={styles.dropOverlay}
          data-composer="drop"
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            attach(Array.from(event.dataTransfer.files));
          }}
        >
          Drop to attach
        </div>
      ) : null}

      {files.length === 0 ? null : (
        <ul className={styles.chips}>
          {files.map((file) => (
            <li key={file.path} className={styles.chip} data-attachment={file.path}>
              <span className={styles.chipName}>{file.name}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remove ${file.name}`}
                title="Removing the chip does not delete the file"
                onClick={() => onFiles(files.filter((one) => one.path !== file.path))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The picker itself, rendered in the input row rather than above it. */
export function AttachButton({ onPick }: { onPick: (files: File[]) => void }) {
  return (
    <>
      <input
        type="file"
        multiple
        id="composer-attach"
        hidden
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          // Cleared so that picking the same file twice fires a second change event.
          event.target.value = "";
          onPick(chosen);
        }}
      />
      <label className={styles.iconButton} htmlFor="composer-attach" title="Attach a file">
        📎
      </label>
    </>
  );
}
