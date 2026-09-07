// Owns: the sheet — being open, the box, the keys, and where each piece is rendered (PROJECT.md
// §9.1, §9.2, §9.5). Three things that were here have their own files, each split off when this
// one crossed the ~300-line cap (AGENTS.md hard rule 5), and each along a seam the spec already
// draws: `Attachments.tsx` and `VoiceButton.tsx` are §9.2's two optional inputs, and
// `useComposerTurn.ts` is the whole conversation with the server. What is left is markup and
// keystrokes.
//
// Failure behavior: nothing here clears anything on a failure. The prompt survives every refusal,
// which is what lets someone change one word and try again (Decision 50); where the message goes is
// decided once, in `useComposerTurn`, by §13.5's rule about where the remedy is.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Attachments, { AttachButton } from "./Attachments";
import type { Attachment } from "./Attachments";
import { DRAFT_KEY } from "./draft";
import type { Mode } from "./draft";
import AskPanel from "./AskPanel";
import { useAskTurn } from "./useAskTurn";
import ModeSelector from "./ModeSelector";
import PreviewPanel from "./PreviewPanel";
import { useComposerTurn } from "./useComposerTurn";
import VoiceButton from "./VoiceButton";
import styles from "./Composer.module.css";

export interface ComposerSheetProps {
  open: boolean;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onClose: () => void;
  /** From settings, for the category select on each card. */
  categories: string[];
  /** The day the composer was opened from, which sets the view block of the context (§13.1). */
  viewDate?: string;
  /** Set when the sheet was opened by "Ask about this" on a row (§9.6). */
  askingAbout?: { id: string; title: string };
}

const MAX_ROWS = 10;
const rowsFor = (text: string): number => Math.min(MAX_ROWS, Math.max(1, text.split("\n").length));

export default function ComposerSheet(props: ComposerSheetProps) {
  const { open, mode, onMode, onClose, categories, viewDate, askingAbout } = props;
  const router = useRouter();
  const sheet = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const attach = useRef<(files: File[]) => void>(() => {});

  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);

  const onAdded = useCallback(() => {
    setFiles([]);
    router.refresh();
    onClose();
  }, [router, onClose]);

  const askTurn = useAskTurn();

  const turn = useComposerTurn({
    ...(viewDate === undefined ? {} : { viewDate }),
    ...(askingAbout === undefined ? {} : { askingAbout }),
    links: files.map((file) => file.path),
    onAdded,
  });

  // §9.1: a draft survives the sheet closing, per device (Decision 19). Read after mount so the
  // server render and the first client render agree.
  useEffect(() => {
    try {
      setPrompt(window.localStorage.getItem(DRAFT_KEY) ?? "");
    } catch {
      // a browser refusing storage is not a reason to fail the page
    }
  }, []);

  useEffect(() => {
    try {
      if (prompt === "") window.localStorage.removeItem(DRAFT_KEY);
      else window.localStorage.setItem(DRAFT_KEY, prompt);
    } catch {
      // as above
    }
  }, [prompt]);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  /** §9.1: Esc closes, and so does an outside click — but only with an empty box (HANDOFF §G). */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    const onDown = (event: MouseEvent): void => {
      if (prompt.trim() !== "") return;
      if (sheet.current !== null && !sheet.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, prompt, onClose]);

  const dictated = useCallback((said: string) => {
    setPrompt((current) => (current === "" ? said : `${current} ${said}`));
  }, []);

  const onReady = useCallback((fn: (chosen: File[]) => void) => {
    attach.current = fn;
  }, []);

  async function submit(): Promise<void> {
    const text = prompt.trim();
    if (text === "") return;

    // §9.6: Ask streams into a real conversation under `data/chats/` (Decision 17), which the
    // sheet shows in place and hands over to the Chat tab with "Open in Chat". The prompt is
    // cleared only once the turn has landed, like every other send here.
    if (mode === "ask") {
      turn.setError(null);
      const problem = await askTurn.ask(text, askingAbout === undefined ? [] : [askingAbout.id]);
      if (problem === null) setPrompt("");
      else turn.setError(problem);
      return;
    }

    // Cleared only once the answer has landed: §9.5 step 1 keeps the text in the disabled box until
    // then, and a failure leaves it there for good.
    if (await turn.send(text)) setPrompt("");
  }

  const busy = turn.busy !== "idle";

  return (
    <div
      ref={sheet}
      className={`${styles.sheet} ${open ? styles.sheetOpen : ""}`}
      role="dialog"
      aria-label="Composer"
      // Closed, it stays in the DOM so it can slide; `inert` is what keeps it out of the tab order
      // and away from a screen reader while it is off screen.
      inert={!open}
      data-composer="sheet"
    >
      <Attachments files={files} onFiles={setFiles} onError={turn.setError} active={open} onReady={onReady} />

      <div className={styles.inner}>
        <div className={styles.top}>
          <ModeSelector mode={mode} onChange={onMode} disabled={busy} />
          {askingAbout === undefined ? null : (
            <span className={styles.note} data-composer="context">
              about &lsquo;{askingAbout.title}&rsquo;
            </span>
          )}
          <span className={styles.spacer} />
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close composer">
            ×
          </button>
        </div>

        <AskPanel
          reply={askTurn.reply}
          streaming={askTurn.streaming}
          conversationId={askTurn.conversationId}
          {...(askingAbout === undefined ? {} : { about: askingAbout.title })}
          onStop={askTurn.stop}
        />

        {turn.result === null ? null : (
          <PreviewPanel
            result={turn.result}
            drafts={turn.drafts}
            selected={turn.selected}
            categories={categories}
            busy={busy}
            onChangeDraft={turn.editDraft}
            onSelect={turn.pick}
            onAdd={() => void turn.add()}
            onDiscard={turn.discard}
          />
        )}

        {turn.error === null ? null : (
          <p className={styles.error} role="alert" data-composer="error">
            {turn.error}
          </p>
        )}

        <div className={styles.inputRow}>
          <textarea
            ref={box}
            className={styles.textarea}
            rows={rowsFor(prompt)}
            value={prompt}
            disabled={turn.busy === "sending" || askTurn.streaming}
            data-composer="input"
            placeholder={
              turn.result?.kind === "question"
                ? "Answer, and send again"
                : turn.result === null
                  ? "What needs doing?"
                  : "Change something — 'make them all Friday'"
            }
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            onPaste={(event) => {
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length === 0) return; // a text paste inserts, as it always did
              event.preventDefault();
              attach.current(pasted);
            }}
          />

          <AttachButton onPick={(chosen) => attach.current(chosen)} />
          <VoiceButton onText={dictated} />

          <button
            type="button"
            className={styles.send}
            onClick={() => void submit()}
            disabled={busy || askTurn.streaming || prompt.trim() === ""}
            data-composer="send"
          >
            {turn.busy === "sending" ? <span className={styles.spinner} aria-label="Sending" /> : "Send"}
          </button>
        </div>

        <p className={styles.hint}>Enter sends · Shift+Enter for a new line · Esc closes</p>
      </div>
    </div>
  );
}
