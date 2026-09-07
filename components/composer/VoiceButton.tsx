// Owns: the other optional half of PROJECT.md §9.2 — dictation into the textarea. Split from
// `ComposerSheet.tsx` for the same reason as `Attachments.tsx`: the sheet was over the ~300-line
// cap, and §9.2 already treats this as its own thing.
//
// The rule it implements is one sentence: if `window.SpeechRecognition ?? webkitSpeechRecognition`
// exists, a mic button toggles dictation; otherwise the button is absent. Absent, not disabled —
// a greyed-out control on a browser that will never support it is a permanent apology.
//
// Failure behavior: the recognizer is read once after mount, so a server render and the first
// client render agree on nothing being there. If it throws on `start` — which is what a denied
// microphone permission does — the button falls back to not recording and the sheet is unaffected.
// Dictation is an input convenience; nothing about a prompt depends on it.

"use client";

import { useEffect, useState } from "react";
import styles from "./Composer.module.css";

/** Only what §9.2 uses. The full Web Speech API is much larger and none of the rest is wanted. */
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechWindow {
  SpeechRecognition?: new () => Recognizer;
  webkitSpeechRecognition?: new () => Recognizer;
}

export default function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [recognizer, setRecognizer] = useState<Recognizer | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const speech = window as unknown as SpeechWindow;
    const Ctor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (Ctor === undefined) return;

    const instance = new Ctor();
    instance.continuous = true;
    instance.interimResults = false;
    instance.onend = () => setRecording(false);
    setRecognizer(instance);
  }, []);

  useEffect(() => {
    if (recognizer === null) return;
    recognizer.onresult = (event) => {
      const said = Array.from(event.results, (result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said !== "") onText(said);
    };
  }, [recognizer, onText]);

  if (recognizer === null) return null;

  return (
    <button
      type="button"
      className={`${styles.iconButton} ${recording ? styles.recording : ""}`}
      title={recording ? "Stop dictating" : "Dictate"}
      aria-pressed={recording}
      data-composer="mic"
      onClick={() => {
        try {
          if (recording) recognizer.stop();
          else recognizer.start();
          setRecording(!recording);
        } catch {
          setRecording(false);
        }
      }}
    >
      🎤
    </button>
  );
}
