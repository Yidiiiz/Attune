// Owns: which body line is a checkbox a click can flip — one rule, read by the builder that flips it
// (`lib/history/document-actions.ts`) and by the document view that decides which drawn boxes may be
// clicked (`components/markdown/checkboxes.ts`). Two copies would drift, and the drift would be a box
// the page offers that the server then refuses, or one it refuses to offer that the server would take.
// Pure, so a component can import it.
//
// Failure behavior: none. A line that does not match is not a checkbox anyone can tick in place.

/** A GFM task-list line: its marker and box, then the one character a click flips. */
export const CHECKBOX = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\])(?=\s|$)/;

/** Whether `line` is a checkbox a click can flip, and if so whether it is ticked. */
export function checkboxState(line: string): { ticked: boolean } | null {
  const match = CHECKBOX.exec(line);
  return match === null ? null : { ticked: match[2] !== " " };
}
