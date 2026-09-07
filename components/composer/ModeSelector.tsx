// Owns: the Tasks · Ask · Build segmented control (PROJECT.md §9.3).
//
// All three segments are rendered, and Build is disabled with a tooltip naming the phase that
// builds it. That is deliberate and was the approved call: nothing routes to Build yet, so a
// refusal path for it would be code with no caller, while a segment that simply is not there
// changes the control's geometry when Phase 9 adds it back. Build's approval toggle — Plan first /
// Auto, and its one-time confirmation — lands in Phase 9 with the mode it gates.
//
// Ask is selectable, because "Ask about this" on a task row opens the sheet in it and the user has
// to be able to see the context it would carry. A send in Ask mode refuses inline; that refusal
// lives in the sheet, next to the text it refused.
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

const SEGMENTS: Array<{ mode: Mode; label: string; until?: string }> = [
  { mode: "tasks", label: "Tasks" },
  { mode: "ask", label: "Ask" },
  { mode: "build", label: "Build", until: "Build mode arrives in Phase 9." },
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
            disabled={disabled || segment.until !== undefined}
            title={segment.until}
            onClick={() => onChange(segment.mode)}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
