// Owns: §10.2's per-message read aloud — one button that speaks a message through
// `speechSynthesis` and stops it again.
//
// **It renders nothing when the browser has no speech synthesis**, which is the honest answer
// rather than a disabled button: a control that can never work is worse than no control, because
// it invites a reader to keep trying it. That absence is a checkable state, which is why the
// browser check asserts both the present and the absent case rather than only the one that draws.
//
// **Speaking is not correctness and is not waited on.** The button's state comes from
// `speechSynthesis.speaking` plus the utterance's own `end` and `error` events, never from a timer
// (§16.7). If the platform never fires `end` — some do not, when an utterance is cancelled — the
// state is corrected by the next event or by unmounting, and the worst outcome is a button that
// says Stop until it is pressed.
//
// **Unmounting cancels.** Navigating away from a conversation while a reply is being spoken should
// stop the speech: the utterance belongs to the message, and the message is gone.
//
// Failure behavior: any synthesis error resets the button and says nothing. Whether sound actually
// came out is not a thing a browser check can answer — `docs/CHECKLIST.md` carries that row, rather
// than this component pretending its own state is evidence.

"use client";

import { useEffect, useState } from "react";
import styles from "./Annotations.module.css";

export interface ReadAloudProps {
  /** What to speak: the message's own markdown, which is close enough to prose to read. */
  text: string;
}

/** Whether this browser can speak at all. Read once per render, never cached across mounts. */
function available(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

export default function ReadAloud({ text }: ReadAloudProps) {
  const [speaking, setSpeaking] = useState(false);
  const [can, setCan] = useState(false);

  // Read after mount rather than during render: the server has no `speechSynthesis`, and deciding
  // during render would make the first client paint disagree with the server's.
  useEffect(() => setCan(available()), []);

  useEffect(() => () => {
    if (available()) window.speechSynthesis.cancel();
  }, []);

  if (!can) return null;

  const stop = (): void => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const start = (): void => {
    window.speechSynthesis.cancel(); // one message at a time; a second press replaces the first
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      type="button"
      className={styles.readAloud}
      data-ui="read-aloud"
      data-speaking={speaking ? "true" : undefined}
      aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
      onClick={speaking ? stop : start}
    >
      {speaking ? "◼" : "▶"}
    </button>
  );
}
