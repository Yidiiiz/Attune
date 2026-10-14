// Owns: the Tasks · Ask · Build segmented control (PROJECT.md §9.3).
//
// Each mode owns its own result surface. Build's approval gates live in BuildPanel.
//
// Failure behavior: none. It reports a choice; the sheet decides what a choice means.

"use client";

import type { Mode } from "./draft";
import styles from "./Composer.module.css";

export interface ModeSelectorProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

const SEGMENTS: Array<{ mode: Mode; label: string }> = [
  { mode: "tasks", label: "Tasks" },
  { mode: "ask", label: "Ask" },
  { mode: "build", label: "Build" },
];

export default function ModeSelector({ mode, onChange, disabled = false }: ModeSelectorProps) {
  return (
    <div className={styles.modes} role="group" aria-label="Composer mode">
      {SEGMENTS.map((segment) => {
        const on = segment.mode === mode;
        return (
          <button
            key={segment.mode}
            type="button"
            data-mode={segment.mode}
            className={`${styles.mode} ${on ? styles.modeOn : ""}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(segment.mode)}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
