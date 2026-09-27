// Owns: a document's frontmatter as a table (PROJECT.md §10.2) — one row per key, in the file's
// order, each value editable as text where the policy allows it.
//
// **The shape a value goes back as follows the shape it came in as**, which is the only rule that
// keeps a hand-written file's types intact: a boolean is a checkbox, an array is a comma-separated
// list, a number stays a number while it still reads as one, and everything else is a string. The
// store has the last word — a value its schema refuses comes back named by field, never echoed —
// so this converts rather than validates.
//
// An empty cell means "not set", the way a hand-edited `due:` does (§4.1); the builder clears it.
//
// Failure behavior: a value it has no better form for is shown as JSON and is not editable, so a
// nested structure is never flattened by being displayed.

"use client";

import styles from "./Browser.module.css";

function shown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((one) => (typeof one === "object" ? JSON.stringify(one) : String(one))).join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** What the cell holds while it is being typed in. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((one) => (typeof one === "object" ? JSON.stringify(one) : String(one))).join(", ");
  return String(value);
}

/** Back to the shape the field came in as. `was` is the value on disk, which decides the shape. */
export function asValue(text: string, was: unknown): unknown {
  if (Array.isArray(was)) {
    const parts = text.split(",").map((one) => one.trim()).filter((one) => one.length > 0);
    return parts;
  }
  if (typeof was === "number") {
    const asNumber = Number(text.trim());
    return text.trim() !== "" && Number.isFinite(asNumber) ? asNumber : text;
  }
  return text;
}

/** A value no text box can hold without losing its shape: an object, or an array of them. */
const structural = (value: unknown): boolean =>
  (typeof value === "object" && value !== null && !Array.isArray(value)) ||
  (Array.isArray(value) && value.some((one) => typeof one === "object" && one !== null));

export interface FrontmatterTableProps {
  /** The values on disk, which decide each row's shape. */
  fields: Record<string, unknown>;
  /** The values as edited, when there is a draft; otherwise the same as `fields`. */
  values?: Record<string, unknown>;
  /** Null when the table may be edited, or the reason it may not. */
  readOnly: string | null;
  onChange?: (key: string, value: unknown) => void;
}

export default function FrontmatterTable({ fields, values, readOnly, onChange }: FrontmatterTableProps) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;
  const current = values ?? fields;

  return (
    <table className={styles.frontmatter} data-ui="frontmatter">
      <tbody>
        {keys.map((key) => {
          const was = fields[key];
          const value = current[key];
          const editable = readOnly === null && onChange !== undefined && !structural(was);
          return (
            <tr key={key} data-field={key}>
              <th scope="row">{key}</th>
              <td>
                {!editable ? (
                  shown(value)
                ) : typeof was === "boolean" ? (
                  <input
                    type="checkbox"
                    className={styles.fieldCheck}
                    checked={value === true}
                    aria-label={key}
                    onChange={(event) => onChange(key, event.target.checked)}
                  />
                ) : (
                  <input
                    type="text"
                    className={styles.fieldInput}
                    value={asText(value)}
                    aria-label={key}
                    spellCheck={false}
                    onChange={(event) => onChange(key, asValue(event.target.value, was))}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
