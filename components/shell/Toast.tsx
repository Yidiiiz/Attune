// Owns: the one toast surface in the app (PROJECT.md §10.0). Anything that needs to say something
// small calls `showToast`; the host is mounted once, in the shell, so no page has to carry it.
//
// The bus is a module-level Set rather than a context, because a toast has no state anyone reads
// and no component below needs to re-render when one appears — a provider would buy nothing and
// cost every caller a hook. At most one toast per `id` per page load, which is what stops a failing
// poll from stacking forty copies of the same sentence.
//
// **A toast is text and nothing else — no buttons, not even a close** (Decision 84). Its corner is
// where the chat composer's Send is, and at some window widths every spot a button could sit in a
// toast lands on Send; the one Undo toasts carried turned a Send click into an undo. So the host is
// transparent to the pointer, a toast leaves when its animation ends, and anything a person can do
// about what it says lives on the surface that owns it: Undo for an auto-applied write is the marker
// under the reply. `e2e/toast.spec.ts` checks that a click on Send reaches Send while one is up.
//
// Failure behavior: this component is the thing that reports failures, so it has none of its own —
// a toast that cannot render is dropped silently rather than throwing inside whatever raised it.

"use client";

import { useEffect, useState } from "react";
import styles from "./Toast.module.css";

export interface ToastSpec {
  /** Dedupe key. The same id never appears twice in one page load (HANDOFF §G). */
  id: string;
  text: string;
  tone?: "info" | "error";
}

type Listener = (toast: ToastSpec) => void;

const listeners = new Set<Listener>();
const shown = new Set<string>();

/** Show a toast. Safe to call from anywhere on the client, including before the host mounts. */
export function showToast(toast: ToastSpec): void {
  if (shown.has(toast.id)) return;
  shown.add(toast.id);
  for (const listener of listeners) listener(toast);
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastSpec[]>([]);

  useEffect(() => {
    const listener: Listener = (toast) => setToasts((current) => [...current, toast]);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dismiss = (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className={styles.host} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${toast.tone === "error" ? styles.error : ""}`}
          // The dismissal is the animation ending, not a timer: one source of truth for how long a
          // toast lives, and it is the stylesheet (§10.0).
          onAnimationEnd={() => dismiss(toast.id)}
        >
          <span className={styles.text}>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
